# app/poker_service.py
from typing import Dict, Any
from .schemas import HandIn
import logging
import re  # Import re for regex parsing

logger = logging.getLogger(__name__)
from pokerkit import Automation, NoLimitTexasHoldem
from typing import Dict, Any

import re  # Import re for regex parsing
from typing import Dict, Any

# from pokerkit import State, Automation
# from pokerkit.games import NoLimitTexasHoldem

# ... (rest of imports and logging setup)


def compute_payoffs_using_pokerkit(payload: dict) -> dict:
    """
    Computes the hand payoffs using pokerkit by replaying the hand
    from the provided payload.

    Args:
        payload: The hand data as a dictionary.

    Returns:
        A dictionary mapping player 'id' strings to their calculated payoff.

    Raises:
        ValueError: If the payload is malformed or actions are unexpected.
    """
    logger.info(f"Computing payoffs for hand {payload.get('id')}")

    # --- 1. Infer Blinds ---
    # The payload winnings (-40 for 5, +200 for 1) and pot (240)
    # strongly suggest a 20/40 blind structure where everyone put in 40.
    small_blind_amount = 20
    big_blind_amount = 40
    original_num_players = len(payload["players"])

    # --- 2. Map Players to pokerkit Order (SB, BB, UTG, ..., D) ---
    players_by_name = {p["name"]: p for p in payload["players"]}
    player_names_from_payload = [p["name"] for p in payload["players"]]
    sb_name = payload["smallBlind"]

    try:
        # Find the SB's index in the original player list
        sb_index_in_payload = player_names_from_payload.index(sb_name)
    except ValueError:
        raise ValueError(f"Small blind '{sb_name}' not found in player list.")

    pk_player_names = []
    pk_starting_stacks = []
    pk_hole_cards = []
    pk_player_id_map = {}  # Maps pokerkit index (0..n-1) to payload player_id
    pk_index_counter = 0

    # Re-order players starting from the Small Blind
    for i in range(original_num_players):
        current_index = (sb_index_in_payload + i) % original_num_players
        player_name = player_names_from_payload[current_index]
        player_data = players_by_name[player_name]

        # --- FIX: Filter out players with non-positive stacks (must have chips to play) ---
        if player_data["stack"] <= 0:
            logger.warning(
                f"Skipping player {player_name} (ID: {player_data['id']}) due to non-positive stack: {player_data['stack']}"
            )
            continue
        # --- END FIX ---

        pk_player_names.append(player_name)
        pk_starting_stacks.append(player_data["stack"])
        pk_hole_cards.append(player_data["cards"])
        # Map the sequential pokerkit index to the original ID
        pk_player_id_map[pk_index_counter] = player_data["id"]
        pk_index_counter += 1

    num_players = len(pk_starting_stacks)  # Update num_players after filtering

    if num_players < 2:
        raise ValueError(
            "Cannot start a poker hand with less than 2 players having chips."
        )

    logger.debug(f"pokerkit player order (SB first): {pk_player_names}")
    logger.debug(f"pokerkit stacks: {pk_starting_stacks}")
    logger.debug(f"pokerkit ID map: {pk_player_id_map}")

    # --- 3. Create pokerkit State ---
    automations = (
        Automation.ANTE_POSTING,
        Automation.BET_COLLECTION,
        Automation.BLIND_OR_STRADDLE_POSTING,
        Automation.HOLE_CARDS_SHOWING_OR_MUCKING,
        Automation.HAND_KILLING,
        Automation.CHIPS_PUSHING,
        Automation.CHIPS_PULLING,
    )

    state = NoLimitTexasHoldem.create_state(
        automations,
        False,  # Uniform antes
        0,  # Antes amount
        (small_blind_amount, big_blind_amount),  # Blinds
        big_blind_amount,  # Min-bet
        tuple(pk_starting_stacks),
        num_players,
    )

    # --- 4. Deal Hole Cards ---
    # state.deal_hole() deals cards to players in their index order (0, 1, 2...)
    for cards in pk_hole_cards:
        state.deal_hole(cards)

    # --- 5. Process Actions ---
    actions = payload["actions"]

    for i, action_str in enumerate(actions):
        try:
            if action_str == "c" or action_str == "x":
                # Check or Call
                state.check_or_call()
            elif action_str.lower() == "f":
                # Fold
                state.fold()
            elif re.match(r"[rb]\d+$", action_str):
                # Handle explicit bets (bXXX) or raises (rXXX)
                amount_str = action_str[1:]
                amount = int(amount_str)

                # --- FIX: Distinguish between a Call (to match all-in) and a Raise ---
                # Get the highest amount currently committed by any player this street.
                # This is the amount the current actor must match to call.
                amount_to_match = max(state.bets)

                # If the player is committing exactly the highest committed amount,
                # they are calling/matching the all-in, which pokerkit wants as check_or_call().
                # We also ensure the action is actually committing new chips (amount > current bet).
                if amount == amount_to_match and amount > state.bets[state.actor_index]:
                    state.check_or_call()
                else:
                    # Otherwise, use complete_bet_or_raise_to() for genuine raises or initial bets.
                    state.complete_bet_or_raise_to(amount)
                # --- END FIX ---

            elif action_str.startswith(("F[", "T[", "R[")):
                # Flop, Turn, or River action (Board Dealing)
                # This signals the end of the current betting street.
                cards = action_str[2:-1]  # Get the cards (e.g., "9hKs7c")

                # These operations must happen in sequence to advance the street
                state.burn_card()
                state.deal_board(cards)
            else:
                # Catch any other unknown action strings
                logger.warning(
                    f"Unknown action '{action_str}' at index {i} - skipping."
                )
                pass
        except Exception as e:
            logger.error(
                f"pokerkit state error on action '{action_str}' (index {i}): {e}"
            )
            logger.error(f"Current state: {state}")
            raise Exception(f"pokerkit error at action {i} ('{action_str}'): {e}")

    # --- 6. Get Payoffs ---
    # The automations CHIPS_PUSHING/PULLING should run,
    # and state.payoffs will be populated.
    if state.status != "ENDED":
        logger.warning(
            f"Hand state is '{state.status}', not 'ENDED'. Payoffs may be incomplete."
        )

    pk_payoffs = state.payoffs  # This is a tuple, e.g., (-40, 200, -40, ...)
    logger.debug(f"pokerkit raw payoffs (index-based): {pk_payoffs}")

    # --- 7. Map Payoffs back to Player IDs ---
    payoffs_map = {}
    for pk_index, payoff_amount in enumerate(pk_payoffs):
        player_id = pk_player_id_map[pk_index]
        payoffs_map[player_id] = payoff_amount

    logger.info(f"Computed payoffs: {payoffs_map}")
    return payoffs_map


def _validate_cards_format(cards):
    # simple validation: strings of length 2 per card or like "As"
    if not isinstance(cards, list):
        return False
    for c in cards:
        if not isinstance(c, str) or len(c.strip()) < 2:
            return False
    return True


def validate_hand_payload(data: Dict[str, Any]) -> tuple[bool, str]:
    """
    Basic validation of incoming payload (structure and some rules).
    Returns (is_valid, error_message_or_empty).
    """
    try:
        hand = HandIn.model_validate(data)
    except Exception as e:
        return False, f"Schema validation error: {e}"

    # check player count
    if not (2 <= len(hand.players) <= 6):
        return False, "players count must be between 2 and 6"

    # check cards format for each player
    for p in hand.players:
        # allow "AsKd" or "As Kd" or ["As","Kd"] as single string - this API expects combined string
        if not isinstance(p.cards, str) or len(p.cards.strip()) < 2:
            return False, f"player {p.name} cards invalid: {p.cards}"

    if not _validate_cards_format(hand.communityCards):
        return (
            False,
            "communityCards must be a list of card codes like ['Ts','Kd','5s']",
        )

    # other checks (finalPot positive etc.)
    if hand.finalPot < 0:
        return False, "finalPot must be non-negative"

    return True, ""


# def compute_payoffs_using_pokerkit(payload: dict) -> dict:
#     """
#     Computes the hand payoffs using pokerkit by replaying the hand
#     from the provided payload.

#     Args:
#         payload: The hand data as a dictionary.

#     Returns:
#         A dictionary mapping player 'id' strings to their calculated payoff.

#     Raises:
#         ValueError: If the payload is malformed or actions are unexpected.
#     """
#     logger.info(f"Computing payoffs for hand {payload.get('id')}")

#     # --- 1. Infer Blinds ---
#     # The payload winnings (-40 for 5, +200 for 1) and pot (240)
#     # strongly suggest a 20/40 blind structure where everyone put in 40.
#     small_blind_amount = 20
#     big_blind_amount = 40
#     num_players = len(payload["players"])

#     # --- 2. Map Players to pokerkit Order (SB, BB, UTG, ..., D) ---
#     players_by_name = {p["name"]: p for p in payload["players"]}
#     player_names_from_payload = [p["name"] for p in payload["players"]]
#     sb_name = payload["smallBlind"]

#     try:
#         # Find the SB's index in the original player list
#         sb_index_in_payload = player_names_from_payload.index(sb_name)
#     except ValueError:
#         raise ValueError(f"Small blind '{sb_name}' not found in player list.")

#     pk_player_names = []
#     pk_starting_stacks = []
#     pk_hole_cards = []
#     pk_player_id_map = {}  # Maps pokerkit index (0..n-1) to payload player_id

#     # Re-order players starting from the Small Blind
#     for i in range(num_players):
#         current_index = (sb_index_in_payload + i) % num_players
#         player_name = player_names_from_payload[current_index]
#         player_data = players_by_name[player_name]

#         pk_player_names.append(player_name)
#         pk_starting_stacks.append(player_data["stack"])
#         pk_hole_cards.append(player_data["cards"])
#         pk_player_id_map[i] = player_data["id"]

#     logger.debug(f"pokerkit player order (SB first): {pk_player_names}")
#     logger.debug(f"pokerkit stacks: {pk_starting_stacks}")
#     logger.debug(f"pokerkit ID map: {pk_player_id_map}")

#     # --- 3. Create pokerkit State ---
#     automations = (
#         Automation.ANTE_POSTING,
#         Automation.BET_COLLECTION,
#         Automation.BLIND_OR_STRADDLE_POSTING,
#         Automation.HOLE_CARDS_SHOWING_OR_MUCKING,
#         Automation.HAND_KILLING,
#         Automation.CHIPS_PUSHING,
#         Automation.CHIPS_PULLING,
#     )

#     state = NoLimitTexasHoldem.create_state(
#         automations,
#         False,  # Uniform antes
#         0,  # Antes amount
#         (small_blind_amount, big_blind_amount),  # Blinds
#         big_blind_amount,  # Min-bet
#         tuple(pk_starting_stacks),
#         num_players,
#     )

#     # --- 4. Deal Hole Cards ---
#     # state.deal_hole() deals cards to players in their index order (0, 1, 2...)
#     for cards in pk_hole_cards:
#         state.deal_hole(cards)

#     # --- 5. Process Actions ---
#     actions = payload["actions"]

#     for i, action_str in enumerate(actions):
#         try:
#             if action_str == "c" or action_str == "x":
#                 # Check or Call
#                 state.check_or_call()
#             elif action_str.lower() == "f":
#                 # Fold
#                 state.fold()
#             elif re.match(r"[rb]\d+$", action_str):
#                 # Handle explicit bets (bXXX) or raises (rXXX)
#                 # This assumes rXXX/bXXX is the total amount the player commits this street.
#                 amount_str = action_str[1:]
#                 amount = int(amount_str)
#                 # state.bet_or_raise(amount) # This was the incorrect method name
#                 state.complete_bet_or_raise_to(amount)  # Corrected method name
#             elif action_str.startswith(("F[", "T[", "R[")):
#                 # Flop, Turn, or River action (Board Dealing)
#                 # This signals the end of the current betting street.
#                 cards = action_str[2:-1]  # Get the cards (e.g., "9hKs7c")

#                 # These operations must happen in sequence to advance the street
#                 state.burn_card()
#                 state.deal_board(cards)
#             else:
#                 # Catch any other unknown action strings
#                 logger.warning(
#                     f"Unknown action '{action_str}' at index {i} - skipping."
#                 )
#                 pass
#         except Exception as e:
#             logger.error(
#                 f"pokerkit state error on action '{action_str}' (index {i}): {e}"
#             )
#             logger.error(f"Current state: {state}")
#             raise Exception(f"pokerkit error at action {i} ('{action_str}'): {e}")

#     # --- 6. Get Payoffs ---
#     # The automations CHIPS_PUSHING/PULLING should run,
#     # and state.payoffs will be populated.
#     if state.status != "ENDED":
#         logger.warning(
#             f"Hand state is '{state.status}', not 'ENDED'. Payoffs may be incomplete."
#         )

#     pk_payoffs = state.payoffs  # This is a tuple, e.g., (-40, 200, -40, ...)
#     logger.debug(f"pokerkit raw payoffs (index-based): {pk_payoffs}")

#     # --- 7. Map Payoffs back to Player IDs ---
#     payoffs_map = {}
#     for pk_index, payoff_amount in enumerate(pk_payoffs):
#         player_id = pk_player_id_map[pk_index]
#         payoffs_map[player_id] = payoff_amount

#     logger.info(f"Computed payoffs: {payoffs_map}")
#     return payoffs_map


# def compute_payoffs_using_pokerkit(payload: dict) -> dict:
#     """
#     Computes the hand payoffs using pokerkit by replaying the hand
#     from the provided payload.

#     Args:
#         payload: The hand data as a dictionary.

#     Returns:
#         A dictionary mapping player 'id' strings to their calculated payoff.

#     Raises:
#         ValueError: If the payload is malformed or actions are unexpected.
#     """
#     logger.info(f"Computing payoffs for hand {payload.get('id')}")

#     # --- 1. Infer Blinds ---
#     # The payload winnings (-40 for 5, +200 for 1) and pot (240)
#     # strongly suggest a 20/40 blind structure where everyone put in 40.
#     small_blind_amount = 20
#     big_blind_amount = 40
#     num_players = len(payload["players"])

#     # --- 2. Map Players to pokerkit Order (SB, BB, UTG, ..., D) ---
#     players_by_name = {p["name"]: p for p in payload["players"]}
#     player_names_from_payload = [p["name"] for p in payload["players"]]
#     sb_name = payload["smallBlind"]

#     try:
#         # Find the SB's index in the original player list
#         sb_index_in_payload = player_names_from_payload.index(sb_name)
#     except ValueError:
#         raise ValueError(f"Small blind '{sb_name}' not found in player list.")

#     pk_player_names = []
#     pk_starting_stacks = []
#     pk_hole_cards = []
#     pk_player_id_map = {}  # Maps pokerkit index (0..n-1) to payload player_id

#     # Re-order players starting from the Small Blind
#     for i in range(num_players):
#         current_index = (sb_index_in_payload + i) % num_players
#         player_name = player_names_from_payload[current_index]
#         player_data = players_by_name[player_name]

#         pk_player_names.append(player_name)
#         pk_starting_stacks.append(player_data["stack"])
#         pk_hole_cards.append(player_data["cards"])
#         pk_player_id_map[i] = player_data["id"]

#     logger.debug(f"pokerkit player order (SB first): {pk_player_names}")
#     logger.debug(f"pokerkit stacks: {pk_starting_stacks}")
#     logger.debug(f"pokerkit ID map: {pk_player_id_map}")

#     # --- 3. Create pokerkit State ---
#     automations = (
#         Automation.ANTE_POSTING,
#         Automation.BET_COLLECTION,
#         Automation.BLIND_OR_STRADDLE_POSTING,
#         Automation.HOLE_CARDS_SHOWING_OR_MUCKING,
#         Automation.HAND_KILLING,
#         Automation.CHIPS_PUSHING,
#         Automation.CHIPS_PULLING,
#     )

#     state = NoLimitTexasHoldem.create_state(
#         automations,
#         False,  # Uniform antes
#         0,  # Antes amount
#         (small_blind_amount, big_blind_amount),  # Blinds
#         big_blind_amount,  # Min-bet
#         tuple(pk_starting_stacks),
#         num_players,
#     )

#     # --- 4. Deal Hole Cards ---
#     # state.deal_hole() deals cards to players in their index order (0, 1, 2...)
#     for cards in pk_hole_cards:
#         state.deal_hole(cards)

#     # --- 5. Process Actions ---
#     actions = payload["actions"]

#     for i, action_str in enumerate(actions):
#         try:
#             if action_str == "c" or action_str == "x":
#                 state.check_or_call()
#             elif action_str.startswith("F["):
#                 cards = action_str[2:-1]  # Get "TsKd5s"
#                 state.burn_card()
#                 state.deal_board(cards)
#             elif action_str.startswith("T["):
#                 cards = action_str[2:-1]  # Get "7h"
#                 state.burn_card()
#                 state.deal_board(cards)
#             elif action_str.startswith("R["):
#                 cards = action_str[2:-1]  # Get "Qc"
#                 state.burn_card()
#                 state.deal_board(cards)
#             elif action_str.lower() == "f":
#                 state.fold()
#             else:
#                 # This script only handles c, x, f, F, T, R.
#                 # It does not handle explicit bets (e.g., 'b200', 'r800')
#                 logger.warning(
#                     f"Unknown action '{action_str}' at index {i} - skipping."
#                 )
#                 pass
#         except Exception as e:
#             logger.error(
#                 f"pokerkit state error on action '{action_str}' (index {i}): {e}"
#             )
#             logger.error(f"Current state: {state}")
#             raise Exception(f"pokerkit error at action {i} ('{action_str}'): {e}")

#     # --- 6. Get Payoffs ---
#     # The automations CHIPS_PUSHING/PULLING should run,
#     # and state.payoffs will be populated.
#     if state.status != "ENDED":
#         logger.warning(
#             f"Hand state is '{state.status}', not 'ENDED'. Payoffs may be incomplete."
#         )

#     pk_payoffs = state.payoffs  # This is a tuple, e.g., (-40, 200, -40, ...)
#     logger.debug(f"pokerkit raw payoffs (index-based): {pk_payoffs}")

#     # --- 7. Map Payoffs back to Player IDs ---
#     payoffs_map = {}
#     for pk_index, payoff_amount in enumerate(pk_payoffs):
#         player_id = pk_player_id_map[pk_index]
#         payoffs_map[player_id] = payoff_amount

#     logger.info(f"Computed payoffs: {payoffs_map}")
#     return payoffs_map


# --- FastAPI Endpoint ---


# def compute_payoffs_using_pokerkit(data: Dict[str, Any]) -> Dict[str, int]:
#     """
#     Try to compute payoffs using pokerkit. This function tries common API shapes.
#     If the installed pokerkit version uses different symbols, raise RuntimeError with instructions.
#     Returns mapping player_name -> net change (int).
#     """
#     try:
#         import pokerkit
#     except Exception as e:
#         raise RuntimeError("pokerkit is not installed or failed to import: " + str(e))

#     # try a couple of likely interfaces
#     # 1) Some versions expose NoLimitTexasHoldem and compute_payoffs
#     if hasattr(pokerkit, "NoLimitTexasHoldem"):
#         NoLimitTexasHoldem = getattr(pokerkit, "NoLimitTexasHoldem")
#         try:
#             # Build input in a couple of possible shapes. We'll try to be permissive.
#             players = []
#             for p in data["players"]:
#                 # p["cards"] could be "AsKd" or "As Kd" or "As,Kd"
#                 s = p["cards"].replace(" ", "")
#                 # split into two-char codes
#                 p_cards = [s[i : i + 2] for i in range(0, len(s), 2)]
#                 players.append(
#                     {"name": p["name"], "hole": p_cards, "stack": p["stack"]}
#                 )
#             board = data.get("communityCards", [])
#             # Try to create instance -- API may differ between versions
#             try:
#                 game = NoLimitTexasHoldem(players=players, board=board)
#             except TypeError:
#                 # alternative constructor forms
#                 game = NoLimitTexasHoldem(players, board)
#             # try possible payoff function names
#             if hasattr(game, "compute_payoffs"):
#                 pay = game.compute_payoffs()
#                 # expect mapping name->int or seat->value
#                 # normalize to name->int if needed
#                 if isinstance(pay, dict):
#                     return pay
#                 # else try to interpret list results
#                 return {p["name"]: pay_i for p, pay_i in zip(players, pay)}
#             elif hasattr(game, "evaluate"):
#                 pay = game.evaluate()
#                 if isinstance(pay, dict):
#                     return pay
#                 return {p["name"]: pay_i for p, pay_i in zip(players, pay)}
#             else:
#                 raise RuntimeError(
#                     "Unsupported NoLimitTexasHoldem instance: no compute_payoffs/evaluate found"
#                 )
#         except Exception as e:
#             raise RuntimeError(f"pokerkit NoLimitTexasHoldem usage failed: {e}")

#     # 2) older interface: try evaluate_texas_holdem
#     if hasattr(pokerkit, "evaluate_texas_holdem"):
#         try:
#             payoffs = pokerkit.evaluate_texas_holdem(data)
#             return payoffs
#         except Exception as e:
#             raise RuntimeError("pokerkit evaluate_texas_holdem failed: " + str(e))

#     raise RuntimeError(
#         "Installed pokerkit version doesn't expose a supported evaluation API. Please inspect pokerkit docs and adapt app/poker_service.py accordingly."
#     )
