'use client';
import type { GameState, Action, Player, Card, GameStage } from './types';
import { createDeck, shuffleDeck, dealCards } from './deck';
import { cardToString, getNextPlayerIndex } from './utils';
import { findWinners } from './hand-evaluator';
import { v4 as uuidv4 } from 'uuid';

export const BIG_BLIND_SIZE = 40;
export const SMALL_BLIND_SIZE = 20;

export function createInitialState(numPlayers: number): GameState {
  const players: Player[] = Array.from({ length: numPlayers }, (_, i) => ({
    id: i,
    name: `Player ${i + 1}`,
    stack: 2000,
    hand: [],
    bet: 0,
    totalBet: 0,
    status: 'playing',
    isDealer: false,
    isSmallBlind: false,
    isBigBlind: false,
    winnings: 0,

  }));

  return {
    players,
    deck: [],
    communityCards: [],
    pot: 0,
    stage: 'setup',
    activePlayerIndex: 0,
    lastRaiserIndex: null,
    currentBet: 0,
    smallBlind: SMALL_BLIND_SIZE,
    bigBlind: BIG_BLIND_SIZE,
    actionLog: ['Welcome to Texas Hold\'em! Click Start to begin.'],
    shortActionLog: [],
    handId: '',
    handWinnerDescription: '',
    handOver: true, // Start in a "handOver" state
  };
}

function startHand(state: GameState, initialPlayers: Player[]): GameState {
  const newState = { ...createInitialState(initialPlayers.length) };
  newState.handOver = false;

  const currentDealerIndex = initialPlayers.findIndex(p => p.isDealer);
  const nextDealerIndex = getNextPlayerIndex(currentDealerIndex, initialPlayers.length, []);

  newState.players.forEach((p, i) => {
    p.name = initialPlayers[i].name;
    p.stack = initialPlayers[i].stack;
    p.isDealer = i === nextDealerIndex;
  });

  newState.handId = uuidv4();

  newState.players.forEach((p, i) => {
    p.hand = [];
    p.bet = 0;
    p.totalBet = 0;
    p.status = p.stack > 0 ? 'playing' : 'out';
    p.winnings = 0;
    p.isSmallBlind = false;
    p.isBigBlind = false;
    p.bestHand = undefined;
    p.hasActedInRound = false;
  });

  const playersInPlay = newState.players.filter(p => p.status !== 'out');
  if (playersInPlay.length < 2) {
    newState.actionLog = ['Not enough players with stacks to start a hand.'];
    newState.handOver = true;
    return newState;
  }

  const playerStatuses = newState.players.map(p => p.status === 'out');

  const dealerIndex = newState.players.findIndex(p => p.isDealer);

  const smallBlindIndex = playersInPlay.length === 2 ? dealerIndex : getNextPlayerIndex(dealerIndex, newState.players.length, playerStatuses);
  const bigBlindIndex = getNextPlayerIndex(smallBlindIndex, newState.players.length, playerStatuses);

  const smallBlindPlayer = newState.players[smallBlindIndex];
  smallBlindPlayer.isSmallBlind = true;
  const sbAmount = Math.min(newState.smallBlind, smallBlindPlayer.stack);
  smallBlindPlayer.stack -= sbAmount;
  smallBlindPlayer.bet = sbAmount;
  smallBlindPlayer.totalBet = sbAmount;
  if (smallBlindPlayer.stack === 0) smallBlindPlayer.status = 'all-in';

  const bigBlindPlayer = newState.players[bigBlindIndex];
  bigBlindPlayer.isBigBlind = true;
  const bbAmount = Math.min(newState.bigBlind, bigBlindPlayer.stack);
  bigBlindPlayer.stack -= bbAmount;
  bigBlindPlayer.bet = bbAmount;
  bigBlindPlayer.totalBet = bbAmount;
  if (bigBlindPlayer.stack === 0) bigBlindPlayer.status = 'all-in';

  newState.pot = 0;
  newState.currentBet = newState.bigBlind;
  newState.stage = 'pre-flop';

  const deck = shuffleDeck(createDeck());
  const { hands, newDeck } = dealCards(deck, newState.players.length);
  newState.players.forEach((p, i) => {
    if (p.status !== 'out') p.hand = hands[i] as [Card, Card]
  });
  newState.deck = newDeck;

  const activePlayerIndex = playersInPlay.length === 2 && playersInPlay.length > 2 ? smallBlindIndex : getNextPlayerIndex(bigBlindIndex, newState.players.length, playerStatuses);

  newState.activePlayerIndex = activePlayerIndex;
  newState.lastRaiserIndex = activePlayerIndex;

  newState.communityCards = [];
  newState.actionLog = [`--- New Hand #${newState.handId.substring(0, 8)} ---`];
  newState.shortActionLog = [];
  newState.handWinnerDescription = '';

  const dealerPlayer = newState.players.find(p => p.isDealer);
  if (dealerPlayer) {
    newState.actionLog.push(`${dealerPlayer.name} is the dealer.`);
  }
  newState.actionLog.push(`${smallBlindPlayer.name} posts small blind of ${sbAmount}.`);
  newState.actionLog.push(`${bigBlindPlayer.name} posts big blind of ${bbAmount}.`);
  newState.actionLog.push(`--- Dealing Hole Cards ---`);

  const playersWhoCanAct = newState.players.filter(p => p.status === 'playing');
  if (playersWhoCanAct.length < 2 && playersInPlay.length > 1) {
    let tempState = newState;
    while (tempState.communityCards.length < 5 && !tempState.handOver) {
      tempState = advanceStage(tempState);
    }
    return endHand(tempState);
  }

  return newState;
}


function advanceStage(state: GameState): GameState {
  let newState = JSON.parse(JSON.stringify(state));

  const playersStillIn = newState.players.filter((p: Player) => p.status !== 'folded' && p.status !== 'out');
  if (playersStillIn.length <= 1) {
    return endHand(newState);
  }

  // Collect bets into the pot
  let betsInRound = 0;
  newState.players.forEach((p: Player) => {
    betsInRound += p.bet;
    p.bet = 0;
  });
  newState.pot += betsInRound;
  newState.currentBet = 0;
  newState.lastRaiserIndex = null;
  newState.players.forEach((p: Player) => { if (p.status === 'playing') p.hasActedInRound = false });

  const nextStageMap: { [K in GameStage]?: GameStage } = {
    'pre-flop': 'flop',
    'flop': 'turn',
    'turn': 'river',
    'river': 'showdown'
  };

  const currentStage = newState.stage;

  if (currentStage === 'setup' || currentStage === 'showdown') {
    return newState;
  }

  const nextStage = nextStageMap[currentStage as GameStage];

  if (!nextStage || nextStage === 'showdown') {
    // Fill up the board if we need to
    while (newState.communityCards.length < 5) {
      if (newState.deck.length > 0) newState.deck.pop(); // Burn
      const card = newState.deck.pop();
      if (card) newState.communityCards.push(card);
    }
    return endHand(newState);
  }

  newState.stage = nextStage;

  // Burn a card
  if (newState.deck.length > 0) newState.deck.pop();

  if (newState.stage === 'flop') {
    const flop = [newState.deck.pop()!, newState.deck.pop()!, newState.deck.pop()!].filter(Boolean);
    if (flop.length === 3) {
      newState.communityCards.push(...flop);
      newState.actionLog.push(`--- Flop --- [ ${flop.map(cardToString).join(' ')} ] (Pot: ${newState.pot})`);
      newState.shortActionLog.push(`F[${flop.map(cardToString).join('')}]`);
    }
  } else if (newState.stage === 'turn') {
    const turn = newState.deck.pop()!;
    if (turn) {
      newState.communityCards.push(turn);
      newState.actionLog.push(`--- Turn --- [ ${cardToString(turn)} ] (Pot: ${newState.pot})`);
      newState.shortActionLog.push(`T[${cardToString(turn)}]`);
    }
  } else if (newState.stage === 'river') {
    const river = newState.deck.pop()!;
    if (river) {
      newState.communityCards.push(river);
      newState.actionLog.push(`--- River --- [ ${cardToString(river)} ] (Pot: ${newState.pot})`);
      newState.shortActionLog.push(`R[${cardToString(river)}]`);
    }
  }

  const dealerIndex = newState.players.findIndex((p: Player) => p.isDealer);
  const nonActingPlayersStatuses = newState.players.map((p: Player) => p.status !== 'playing');
  let firstPlayerToAct = getNextPlayerIndex(dealerIndex, newState.players.length, nonActingPlayersStatuses);

  const activePlayers = playersStillIn.filter((p: Player) => p.status === 'playing');
  if (activePlayers.length < 2) {
    return advanceStage(newState);
  }


  if (firstPlayerToAct !== -1) {
    newState.activePlayerIndex = firstPlayerToAct;
    newState.lastRaiserIndex = firstPlayerToAct;
  } else {
    return advanceStage(newState);
  }

  return newState;
}

function endHand(state: GameState): GameState {
  const newState = JSON.parse(JSON.stringify(state));
  newState.stage = 'showdown';
  newState.handOver = true;
  newState.activePlayerIndex = -1;

  // Final bet collection
  let finalBets = 0;
  newState.players.forEach((p: Player) => {
    finalBets += p.bet;
    p.bet = 0;
  });
  newState.pot += finalBets;

  newState.actionLog.push(`--- Showdown ---`);

  const playersStillIn = newState.players.filter((p: Player) => p.status !== 'folded' && p.status !== 'out');

  if (playersStillIn.length === 1) {
    const winner = playersStillIn[0];
    winner.winnings = newState.pot;
    newState.handWinnerDescription = `${winner.name} wins pot of ${newState.pot}`;
    newState.actionLog.push(newState.handWinnerDescription);
  } else {
    playersStillIn.forEach((p: Player) => p.winnings = 0);
    const potSummaries: string[] = [];

    const sortedPlayersByBet = [...playersStillIn].sort((a, b) => a.totalBet - b.totalBet);
    const potLevels = [...new Set(sortedPlayersByBet.map(p => p.totalBet))];
    let lastPotLevelContribution = 0;

    potLevels.forEach(level => {
      if (level === 0) return;
      const contributionThisLevel = level - lastPotLevelContribution;
      const playersContributing = newState.players.filter((p: { totalBet: number; status: string; }) => p.totalBet >= level || (p.totalBet > lastPotLevelContribution && p.status === 'all-in'));

      let potSizeThisLevel = 0;
      playersContributing.forEach((p: { totalBet: number; }) => {
        potSizeThisLevel += Math.min(contributionThisLevel, p.totalBet - lastPotLevelContribution);
      })

      if (potSizeThisLevel > 0) {
        const playersInThisPot = playersStillIn.filter((p: { totalBet: number; }) => p.totalBet >= level);
        const { winners, bestHand } = findWinners(playersInThisPot, newState.communityCards);
        const share = Math.floor(potSizeThisLevel / winners.length);

        winners.forEach(w => {
          const winnerInState = newState.players.find((p: Player) => p.id === w.id);
          if (winnerInState) {
            winnerInState.winnings += share;
          }
        });

        let remainder = potSizeThisLevel % winners.length;
        if (remainder > 0) {
          const dealerIndex = newState.players.findIndex((p: Player) => p.isDealer);
          let currentIdx = getNextPlayerIndex(dealerIndex, newState.players.length, []);
          while (remainder > 0) {
            const playerToGetChip = winners.find((w: Player) => w.id === currentIdx);
            if (playerToGetChip) {
              const winnerInState = newState.players.find((p: Player) => p.id === playerToGetChip.id);
              if (winnerInState) winnerInState.winnings += 1;
              remainder--;
            }
            currentIdx = getNextPlayerIndex(currentIdx, newState.players.length, []);
          }
        }

        const winnerNames = winners.map(w => w.name).join(', ');
        potSummaries.push(`${winnerNames} ${winners.length > 1 ? 'split' : 'wins'} a pot of ${potSizeThisLevel} with ${bestHand.description}`);
      }

      lastPotLevelContribution = level;
    });

    const uncalledBet = newState.pot - newState.players.reduce((acc: any, p: { totalBet: any; }) => acc + p.totalBet, 0);
    if (uncalledBet > 0) {
      const maxBet = Math.max(...newState.players.map((p: Player) => p.totalBet));
      const better = newState.players.find((p: Player) => p.totalBet === maxBet);
      if (better) better.winnings += uncalledBet;
    }


    newState.handWinnerDescription = potSummaries.join('; ');
    if (potSummaries.length > 0) {
      newState.actionLog.push(...potSummaries);
    }
  }

  // Final stack update is now winnings MINUS what they put in
  newState.players.forEach((p: Player) => {
    p.stack += p.winnings;
  });

  return newState;
}

function handlePlayerAction(state: GameState): GameState {
  let newState = JSON.parse(JSON.stringify(state));
  const activePlayer = newState.players[newState.activePlayerIndex];
  if (activePlayer) {
    activePlayer.hasActedInRound = true;
  }

  const playersInHand = newState.players.filter((p: Player) => p.status !== 'folded' && p.status !== 'out');

  if (playersInHand.length <= 1) {
    return advanceStage(newState);
  }

  const playersWhoCanAct = playersInHand.filter((p: Player) => p.status === 'playing');

  const allBetsAreSettled = playersWhoCanAct.every((p: { bet: any; hasActedInRound: any; }) => p.bet === newState.currentBet && p.hasActedInRound);

  if (allBetsAreSettled) {
    if (playersWhoCanAct.length <= 1) {
      return advanceStage(newState);
    }
    return advanceStage(newState);
  }

  const nonActingPlayersStatuses = newState.players.map((p: Player) => p.status !== 'playing');
  let nextPlayerIndex = getNextPlayerIndex(newState.activePlayerIndex, newState.players.length, nonActingPlayersStatuses);

  if (nextPlayerIndex === -1 || (nextPlayerIndex === newState.lastRaiserIndex && newState.currentBet > 0)) {
    return advanceStage(newState);
  }

  if (playersWhoCanAct.every((p: { hasActedInRound: any; }) => p.hasActedInRound) && newState.currentBet === newState.players[nextPlayerIndex]?.bet) {
    return advanceStage(newState);
  }

  newState.activePlayerIndex = nextPlayerIndex;
  return newState;
}

export function gameReducer(state: GameState, action: Action): GameState {
  if (state.handOver && action.type !== 'START_HAND') {
    const isSetup = state.stage === 'setup' || state.handOver;
    if (!isSetup) return state;
  }

  if (state.stage === 'setup' && action.type !== 'START_HAND') return state;

  let newState = JSON.parse(JSON.stringify(state));

  if (action.type === 'START_HAND') {
    return startHand(state, action.payload.players);
  }

  const player = newState.players[newState.activePlayerIndex];

  if (!player || player.status !== 'playing') {
    const nonActingPlayersStatuses = newState.players.map((p: Player) => p.status !== 'playing');
    const nextIndex = getNextPlayerIndex(newState.activePlayerIndex, newState.players.length, nonActingPlayersStatuses);
    if (nextIndex !== -1) {
      newState.activePlayerIndex = nextIndex;
      return newState;
    }
    return handlePlayerAction(newState);
  }

  switch (action.type) {
    case 'FOLD':
      player.status = 'folded';
      newState.actionLog.push(`${player.name} folds.`);
      newState.shortActionLog.push('f');
      return handlePlayerAction(newState);

    case 'CHECK':
      if (newState.currentBet > player.bet) return state; // Can't check if there's a bet
      newState.actionLog.push(`${player.name} checks.`);
      newState.shortActionLog.push('x');
      return handlePlayerAction(newState);

    case 'CALL': {
      const callAmount = Math.min(newState.currentBet - player.bet, player.stack);
      if (callAmount <= 0) { // This becomes a check
        if (newState.currentBet === 0 || player.bet === newState.currentBet) {
          newState.actionLog.push(`${player.name} checks.`);
          newState.shortActionLog.push('x');
          return handlePlayerAction(newState);
        }
        return state; // Invalid call
      }
      player.stack -= callAmount;
      player.bet += callAmount;
      player.totalBet += callAmount;
      newState.actionLog.push(`${player.name} calls ${callAmount}.`);
      newState.shortActionLog.push('c');
      if (player.stack === 0) {
        player.status = 'all-in';
      }
      return handlePlayerAction(newState);
    }

    case 'BET': {
      if (newState.currentBet > 0) return state; // Can't bet if there's already a bet, must raise
      const betAmount = Math.min(action.payload.amount, player.stack);
      if (betAmount <= 0 || (betAmount < newState.bigBlind && betAmount < player.stack)) return state;
      player.stack -= betAmount;
      player.bet += betAmount;
      player.totalBet += betAmount;
      newState.currentBet = player.bet;
      newState.lastRaiserIndex = newState.activePlayerIndex;
      newState.actionLog.push(`${player.name} bets ${betAmount}.`);
      newState.shortActionLog.push(`b${betAmount}`);
      if (player.stack === 0) player.status = 'all-in';
      newState.players.forEach((p: Player) => {
        if (p.status === 'playing') p.hasActedInRound = false
      });
      return handlePlayerAction(newState);
    }

    case 'RAISE': {
      if (player.stack === 0) return state;

      const totalBetAmount = Math.min(action.payload.amount, player.stack + player.bet);
      const raiseAmount = totalBetAmount - player.bet;

      if (raiseAmount <= 0) return state;

      const lastRaiseSize = newState.currentBet - (newState.players.find((p: Player) => p.bet < newState.currentBet && p.hasActedInRound)?.bet || 0);
      const minRaiseTotal = newState.currentBet + Math.max(lastRaiseSize, newState.bigBlind);

      const isAllIn = (player.stack - raiseAmount) <= 0;

      if (totalBetAmount < minRaiseTotal && !isAllIn) {
        return state;
      }

      player.stack -= raiseAmount;
      player.bet += raiseAmount;
      player.totalBet += raiseAmount;

      let actionVerb = 'raises to';
      if (isAllIn) {
        actionVerb = player.bet > newState.currentBet ? 'goes all-in with a raise to' : 'goes all-in for';
        player.status = 'all-in';
      }

      newState.actionLog.push(`${player.name} ${actionVerb} ${totalBetAmount}.`);
      newState.shortActionLog.push(`r${totalBetAmount}`);

      // A full raise re-opens the action
      if (totalBetAmount >= minRaiseTotal && !isAllIn) {
        newState.currentBet = player.bet;
        newState.lastRaiserIndex = newState.activePlayerIndex;
        newState.players.forEach((p: Player) => {
          if (p.status === 'playing') {
            p.hasActedInRound = false;
          }
        });
      } else {
        newState.currentBet = Math.max(newState.currentBet, player.bet);
      }

      return handlePlayerAction(newState);
    }

    default:
      return state;
  }
}



//Test logic not working
// 'use client';
// import type { GameState, Action, Player, Card, GameStage, HandEvaluation } from './types';
// import { createDeck, shuffleDeck, dealCards } from './deck';
// import { cardToString, getNextPlayerIndex } from './utils';
// import { findWinners, evaluateBestHand } from './hand-evaluator';
// import { v4 as uuidv4 } from "uuid";

// export const BIG_BLIND_SIZE = 40;
// export const SMALL_BLIND_SIZE = 20;

// export function createInitialState(numPlayers: number): GameState {
//   const players: Player[] = Array.from({ length: numPlayers }, (_, i) => ({
//     id: i,
//     name: `Player ${i + 1}`,
//     stack: 2000,
//     hand: [],
//     bet: 0,
//     totalBet: 0,
//     status: 'playing',
//     isDealer: false,
//     isSmallBlind: false,
//     isBigBlind: false,
//     winnings: 0,
//   }));

//   return {
//     players,
//     deck: [],
//     communityCards: [],
//     pot: 0,
//     stage: 'setup',
//     activePlayerIndex: 0,
//     lastRaiserIndex: null,
//     currentBet: 0,
//     smallBlind: SMALL_BLIND_SIZE,
//     bigBlind: BIG_BLIND_SIZE,
//     actionLog: ['Welcome to Texas Hold\'em! Click Start to begin.'],
//     shortActionLog: [],
//     handId: '',
//     handWinnerDescription: '',
//     handOver: true, // Start in a "handOver" state
//   };
// }

// function startHand(state: GameState, initialPlayers: Player[]): GameState {
//   const newState = { ...createInitialState(initialPlayers.length) };
//   newState.handOver = false;

//   const currentDealerIndex = initialPlayers.findIndex(p => p.isDealer);
//   const nextDealerIndex = getNextPlayerIndex(currentDealerIndex, initialPlayers.length, []);

//   newState.players.forEach((p, i) => {
//     p.name = initialPlayers[i].name;
//     p.stack = initialPlayers[i].stack;
//     p.isDealer = i === nextDealerIndex;
//   });

//   newState.handId = uuidv4()

//   newState.players.forEach((p, i) => {
//     p.hand = [];
//     p.bet = 0;
//     p.totalBet = 0;
//     p.status = p.stack > 0 ? 'playing' : 'out';
//     p.winnings = 0;
//     p.isSmallBlind = false;
//     p.isBigBlind = false;
//     p.bestHand = undefined;
//     p.hasActedInRound = false;
//   });

//   const playersInPlay = newState.players.filter(p => p.status !== 'out');
//   if (playersInPlay.length < 2) {
//     newState.actionLog = ['Not enough players with stacks to start a hand.'];
//     newState.handOver = true;
//     return newState;
//   }

//   const playerStatuses = newState.players.map(p => p.status === 'out');

//   const dealerIndex = newState.players.findIndex(p => p.isDealer);
//   const smallBlindIndex = getNextPlayerIndex(dealerIndex, newState.players.length, playerStatuses);
//   const bigBlindIndex = getNextPlayerIndex(smallBlindIndex, newState.players.length, playerStatuses);

//   // In heads-up, dealer is SB
//   const effectiveSBIndex = playersInPlay.length === 2 ? dealerIndex : smallBlindIndex;
//   const effectiveBBIndex = getNextPlayerIndex(effectiveSBIndex, newState.players.length, playerStatuses);


//   const smallBlindPlayer = newState.players[effectiveSBIndex];
//   smallBlindPlayer.isSmallBlind = true;
//   const sbAmount = Math.min(newState.smallBlind, smallBlindPlayer.stack);
//   smallBlindPlayer.stack -= sbAmount;
//   smallBlindPlayer.bet = sbAmount;
//   smallBlindPlayer.totalBet = sbAmount;
//   if (smallBlindPlayer.stack === 0) smallBlindPlayer.status = 'all-in';

//   const bigBlindPlayer = newState.players[effectiveBBIndex];
//   bigBlindPlayer.isBigBlind = true;
//   const bbAmount = Math.min(newState.bigBlind, bigBlindPlayer.stack);
//   bigBlindPlayer.stack -= bbAmount;
//   bigBlindPlayer.bet = bbAmount;
//   bigBlindPlayer.totalBet = bbAmount;
//   if (bigBlindPlayer.stack === 0) bigBlindPlayer.status = 'all-in';

//   newState.pot = 0;
//   newState.currentBet = newState.bigBlind;
//   newState.stage = 'pre-flop';

//   const deck = shuffleDeck(createDeck());
//   const { hands, newDeck } = dealCards(deck, newState.players.length);
//   newState.players.forEach((p, i) => {
//     if (p.status !== 'out') p.hand = hands[i] as [Card, Card]
//   });
//   newState.deck = newDeck;

//   const activePlayerIndex = getNextPlayerIndex(effectiveBBIndex, newState.players.length, playerStatuses);

//   newState.activePlayerIndex = activePlayerIndex;
//   newState.lastRaiserIndex = effectiveBBIndex;

//   newState.communityCards = [];
//   newState.actionLog = [`--- New Hand #${newState.handId.substring(0, 8)} ---`];
//   newState.shortActionLog = [];
//   newState.handWinnerDescription = '';

//   const dealerPlayer = newState.players.find(p => p.isDealer);
//   if (dealerPlayer) {
//     newState.actionLog.push(`${dealerPlayer.name} is the dealer.`);
//   }
//   newState.actionLog.push(`${smallBlindPlayer.name} posts small blind of ${sbAmount}.`);
//   newState.actionLog.push(`${bigBlindPlayer.name} posts big blind of ${bbAmount}.`);
//   newState.actionLog.push(`--- Dealing Hole Cards ---`);
//   newState.players.forEach(p => {
//     if (p.status !== 'out') {
//       newState.actionLog.push(`Dealt to ${p.name}: [ ${p.hand.map(cardToString).join(' ')} ]`);
//     }
//   });

//   const playersWhoCanAct = newState.players.filter(p => p.status === 'playing');
//   if (playersWhoCanAct.length < 2 && playersInPlay.length > 1) {
//     // All but one player are all-in pre-deal, advance to showdown
//     let tempState = newState;
//     while (tempState.communityCards.length < 5 && !tempState.handOver) {
//       tempState = advanceStage(tempState);
//     }
//     return endHand(tempState);
//   }

//   return newState;
// }


// function advanceStage(state: GameState): GameState {
//   const newState = { ...state };

//   const playersStillIn = newState.players.filter(p => p.status !== 'folded' && p.status !== 'out');
//   if (playersStillIn.length <= 1) {
//     return endHand(newState);
//   }

//   newState.players.forEach(p => {
//     newState.pot += p.bet;
//     p.bet = 0;
//   });
//   newState.currentBet = 0;
//   newState.lastRaiserIndex = null;
//   newState.players.forEach(p => p.hasActedInRound = false);

//   const nextStageMap: { [K in GameStage]?: GameStage } = {
//     'pre-flop': 'flop',
//     'flop': 'turn',
//     'turn': 'river',
//     'river': 'showdown'
//   };

//   const currentStage = newState.stage;

//   if (currentStage === 'showdown' || currentStage === 'setup') {
//     return newState;
//   }

//   const nextStage = nextStageMap[currentStage];
//   if (!nextStage) {
//     return endHand(newState); // Should not happen with above checks, but as a safeguard
//   }

//   newState.stage = nextStage;

//   if (newState.stage === 'showdown') {
//     return endHand(newState);
//   }

//   if (newState.deck.length > 0) newState.deck.pop();

//   if (newState.stage === 'flop') {
//     const flop = [newState.deck.pop()!, newState.deck.pop()!, newState.deck.pop()!].filter(Boolean);
//     newState.communityCards.push(...flop);
//     newState.actionLog.push(`--- Flop --- [ ${flop.map(cardToString).join(' ')} ] (Pot: ${newState.pot})`);
//     newState.shortActionLog.push(`F[${flop.map(cardToString).join('')}]`);
//   } else if (newState.stage === 'turn') {
//     const turn = newState.deck.pop()!;
//     if (turn) {
//       newState.communityCards.push(turn);
//       newState.actionLog.push(`--- Turn --- [ ${cardToString(turn)} ] (Pot: ${newState.pot})`);
//       newState.shortActionLog.push(`T[${cardToString(turn)}]`);
//     }
//   } else if (newState.stage === 'river') {
//     const river = newState.deck.pop()!;
//     if (river) {
//       newState.communityCards.push(river);
//       newState.actionLog.push(`--- River --- [ ${cardToString(river)} ] (Pot: ${newState.pot})`);
//       newState.shortActionLog.push(`R[${cardToString(river)}]`);
//     }
//   }

//   const nonActingPlayers = newState.players.map(p => p.status !== 'playing');
//   const dealerIndex = newState.players.findIndex(p => p.isDealer);
//   let firstPlayerToAct = getNextPlayerIndex(dealerIndex, newState.players.length, nonActingPlayers);

//   // If all remaining players are all-in, just keep advancing the stage until showdown
//   const activePlayers = newState.players.filter(p => p.status === 'playing');
//   if (activePlayers.length === 0 && playersStillIn.length > 1) {
//     return advanceStage(newState);
//   }

//   newState.activePlayerIndex = firstPlayerToAct;
//   newState.lastRaiserIndex = firstPlayerToAct;

//   return newState;
// }

// function endHand(state: GameState): GameState {
//   const newState = JSON.parse(JSON.stringify(state));
//   newState.stage = 'showdown';
//   newState.handOver = true;
//   newState.activePlayerIndex = -1;

//   newState.players.forEach((p: { bet: number; }) => {
//     newState.pot += p.bet;
//     p.bet = 0;
//   });

//   newState.actionLog.push(`--- Showdown ---`);

//   const playersInHand = newState.players.filter((p: { status: string; }) => p.status !== 'out');
//   const unFoldedPlayers = playersInHand.filter((p: { status: string; }) => p.status !== 'folded');

//   unFoldedPlayers.forEach((p: { hand: string | any[]; bestHand: HandEvaluation; }) => {
//     if (p.hand.length > 0) {
//       p.bestHand = evaluateBestHand([...p.hand, ...newState.communityCards]);
//     }
//   });

//   if (unFoldedPlayers.length === 1) {
//     const winner = unFoldedPlayers[0];
//     winner.winnings = newState.pot;
//     newState.handWinnerDescription = `${winner.name} wins pot of ${newState.pot}`;
//     newState.actionLog.push(newState.handWinnerDescription);
//   } else {
//     const sortedPlayersByBet = [...playersInHand].sort((a, b) => a.totalBet - b.totalBet);
//     const potLevels = [...new Set(sortedPlayersByBet.map(p => p.totalBet))];
//     let lastPotLevel = 0;
//     let cumulativePot = 0;
//     const potSummaries = [];

//     for (const level of potLevels) {
//       if (level === 0) continue;

//       const playersContributingToThisLevel = playersInHand.filter((p: { totalBet: number; }) => p.totalBet >= level);
//       const playersAllInAtThisLevel = playersInHand.filter((p: { totalBet: any; }) => p.totalBet === level);

//       const potIncrement = (level - lastPotLevel) * playersContributingToThisLevel.length;

//       const sidePotTotal = potIncrement;
//       cumulativePot += sidePotTotal;

//       const eligiblePlayersForPot = unFoldedPlayers.filter((p: { id: any; }) => playersInHand.some((pInHand: { id: any; totalBet: number; }) => pInHand.id === p.id && pInHand.totalBet >= level));

//       if (eligiblePlayersForPot.length === 1) {
//         const winner = eligiblePlayersForPot[0];
//         winner.winnings += sidePotTotal;
//         potSummaries.push(`${winner.name} wins a pot of ${sidePotTotal}`);
//       } else if (eligiblePlayersForPot.length > 1) {
//         const { winners, bestHand } = findWinners(eligiblePlayersForPot, newState.communityCards);
//         const share = Math.floor(sidePotTotal / winners.length);
//         winners.forEach(w => w.winnings += share);

//         // Distribute remainder
//         let remainder = sidePotTotal % winners.length;
//         if (remainder > 0) {
//           const dealerIndex = newState.players.findIndex((p: { isDealer: any; }) => p.isDealer);
//           let currentIdx = getNextPlayerIndex(dealerIndex, newState.players.length, []);
//           while (remainder > 0) {
//             const playerToGetChip = winners.find(w => w.id === currentIdx);
//             if (playerToGetChip) {
//               playerToGetChip.winnings += 1;
//               remainder--;
//             }
//             currentIdx = getNextPlayerIndex(currentIdx, newState.players.length, []);
//           }
//         }
//         const winnerNames = winners.map(w => w.name).join(', ');
//         potSummaries.push(`${winnerNames} split a pot of ${sidePotTotal} with ${bestHand.description}`);
//       }
//       lastPotLevel = level;
//     }

//     const remainingPot = newState.pot - cumulativePot;
//     if (remainingPot > 0 && unFoldedPlayers.length > 0) {
//       const { winners, bestHand } = findWinners(unFoldedPlayers, newState.communityCards);
//       const share = Math.floor(remainingPot / winners.length);
//       winners.forEach(w => w.winnings += share);
//       // Handle remainder for main pot
//     }


//     newState.handWinnerDescription = potSummaries.join('; ');
//     newState.actionLog.push(...potSummaries);
//   }

//   newState.players.forEach((p: { stack: number; winnings: number; totalBet: number; }) => {
//     p.stack += p.winnings - p.totalBet;
//   });

//   return newState;
// }


// function handlePlayerAction(state: GameState): GameState {
//   let newState = JSON.parse(JSON.stringify(state));
//   const activePlayer = newState.players[newState.activePlayerIndex];
//   if (activePlayer) {
//     activePlayer.hasActedInRound = true;
//   }

//   const playersInHand = newState.players.filter((p: { status: string; }) => p.status !== 'folded' && p.status !== 'out');
//   if (playersInHand.length <= 1) {
//     return advanceStage(newState);
//   }

//   // Check if the round should end
//   const playersInPlay = playersInHand.filter((p: { status: string; }) => p.status === 'playing' || p.status === 'all-in');
//   const highestBet = Math.max(...playersInPlay.map((p: { bet: any; }) => p.bet));

//   const allPlayersHaveActed = playersInPlay.every((p: { hasActedInRound: any; status: string; }) => p.hasActedInRound || p.status === 'all-in');

//   const allBetsAreSettled = playersInPlay.every((p: { bet: number; status: string; }) => {
//     return p.bet === highestBet || p.status === 'all-in';
//   });

//   if (allPlayersHaveActed && allBetsAreSettled) {
//     return advanceStage(newState);
//   }

//   // Find next player
//   const nonActingPlayers = newState.players.map((p: { status: string; }) => p.status !== 'playing');
//   let nextPlayerIndex = getNextPlayerIndex(newState.activePlayerIndex, newState.players.length, nonActingPlayers);

//   // If we've looped all the way around and there are no more valid players to act
//   if (nextPlayerIndex === -1) {
//     return advanceStage(newState);
//   }

//   newState.activePlayerIndex = nextPlayerIndex;
//   return newState;
// }

// export function gameReducer(state: GameState, action: Action): GameState {
//   if (state.handOver && action.type !== 'START_HAND') {
//     const isSetup = state.stage === 'setup' || state.handOver;
//     if (!isSetup) return state;
//   }

//   if (state.stage === 'setup' && action.type !== 'START_HAND') return state;

//   let newState = JSON.parse(JSON.stringify(state));
//   const player = newState.players[newState.activePlayerIndex];

//   if (!player && action.type !== 'START_HAND') {
//     return state;
//   }

//   switch (action.type) {
//     case 'START_HAND':
//       return startHand(state, action.payload.players);

//     case 'FOLD':
//       player.status = 'folded';
//       newState.actionLog.push(`${player.name} folds.`);
//       newState.shortActionLog.push('f');
//       return handlePlayerAction(newState);

//     case 'CHECK':
//       if (newState.currentBet > player.bet) return state; // Can't check if there's a bet
//       newState.actionLog.push(`${player.name} checks.`);
//       newState.shortActionLog.push('x');
//       return handlePlayerAction(newState);

//     case 'CALL': {
//       const callAmount = Math.min(newState.currentBet - player.bet, player.stack);
//       // If there's no bet to call, it's a check
//       if (callAmount <= 0) {
//         if (newState.currentBet === 0 || player.bet === newState.currentBet) {
//           newState.actionLog.push(`${player.name} checks.`);
//           newState.shortActionLog.push('x');
//           return handlePlayerAction(newState);
//         }
//         return state; // Invalid call
//       }
//       player.stack -= callAmount;
//       player.bet += callAmount;
//       player.totalBet += callAmount;
//       newState.actionLog.push(`${player.name} calls ${callAmount}.`);
//       newState.shortActionLog.push('c');
//       if (player.stack === 0) {
//         player.status = 'all-in';
//       }
//       return handlePlayerAction(newState);
//     }

//     case 'BET': {
//       if (newState.currentBet > 0) return state; // Can't bet if there's already a bet, must raise
//       const betAmount = Math.min(action.payload.amount, player.stack);
//       if (betAmount <= 0 || (betAmount < newState.bigBlind && betAmount < player.stack)) return state;
//       player.stack -= betAmount;
//       player.bet += betAmount;
//       player.totalBet += betAmount;
//       newState.currentBet = player.bet;
//       newState.lastRaiserIndex = newState.activePlayerIndex;
//       newState.actionLog.push(`${player.name} bets ${betAmount}.`);
//       newState.shortActionLog.push(`b${betAmount}`);
//       if (player.stack === 0) player.status = 'all-in';
//       return handlePlayerAction(newState);
//     }

//     case 'RAISE': {
//       if (player.stack === 0) return state;

//       const totalBetAmount = Math.min(action.payload.amount, player.stack + player.bet);
//       const raiseAmount = totalBetAmount - player.bet;

//       if (raiseAmount <= 0) return state; // Must raise by a positive amount

//       const lastRaiseSize = newState.currentBet - (newState.players.find((p: Player) => p.id === newState.lastRaiserIndex)?.bet || 0);
//       const minRaiseTotal = newState.currentBet + Math.max(lastRaiseSize, newState.bigBlind);

//       const isAllIn = (player.stack - raiseAmount) <= 0;

//       // Under-raise all-in is allowed, but a regular raise must be at least the minimum.
//       if (totalBetAmount < minRaiseTotal && !isAllIn) {
//         return state;
//       }

//       player.stack -= raiseAmount;
//       player.bet += raiseAmount;
//       player.totalBet += raiseAmount;

//       let actionVerb = 'raises to';
//       if (isAllIn) {
//         actionVerb = player.bet > newState.currentBet ? 'goes all-in with a raise to' : 'goes all-in for';
//         player.status = 'all-in';
//       }

//       newState.actionLog.push(`${player.name} ${actionVerb} ${totalBetAmount}.`);
//       newState.shortActionLog.push(`r${totalBetAmount}`);

//       // A full raise re-opens the action
//       if (totalBetAmount >= minRaiseTotal && !isAllIn) {
//         newState.currentBet = player.bet;
//         newState.lastRaiserIndex = newState.activePlayerIndex;
//         newState.players.forEach((p: Player) => {
//           if (p.id !== player.id && p.status === 'playing') {
//             p.hasActedInRound = false;
//           }
//         });
//       }
//       // An all-in that is larger than the current bet also sets a new bet amount and re-opens action if it's a "full" raise
//       else if (isAllIn && totalBetAmount >= minRaiseTotal) {
//         newState.currentBet = player.bet;
//         newState.lastRaiserIndex = newState.activePlayerIndex;
//         newState.players.forEach((p: Player) => {
//           if (p.id !== player.id && p.status === 'playing') {
//             p.hasActedInRound = false;
//           }
//         });
//       }

//       return handlePlayerAction(newState);
//     }

//     default:
//       return state;
//   }
// }



// syntax error
// 'use client';
// import type { GameState, Action, Player, Card, HandEvaluation } from './types';
// import { createDeck, shuffleDeck, dealCards } from './deck';
// import { cardToString, getNextPlayerIndex } from './utils';
// import { findWinners, evaluateBestHand } from './hand-evaluator';

// export const BIG_BLIND_SIZE = 40;
// export const SMALL_BLIND_SIZE = 20;

// export function createInitialState(numPlayers: number): GameState {
//   const players: Player[] = Array.from({ length: numPlayers }, (_, i) => ({
//     id: i,
//     name: `Player ${i + 1}`,
//     stack: 2000,
//     hand: [],
//     bet: 0,
//     totalBet: 0,
//     status: 'playing',
//     isDealer: false,
//     isSmallBlind: false,
//     isBigBlind: false,
//     winnings: 0,
//   }));

//   return {
//     players,
//     deck: [],
//     communityCards: [],
//     pot: 0,
//     stage: 'setup',
//     activePlayerIndex: 0,
//     lastRaiserIndex: null,
//     currentBet: 0,
//     smallBlind: SMALL_BLIND_SIZE,
//     bigBlind: BIG_BLIND_SIZE,
//     actionLog: ['Welcome to Texas Hold\'em! Click Start to begin.'],
//     shortActionLog: [],
//     handId: '',
//     handWinnerDescription: '',
//     handOver: true, // Start in a "handOver" state
//   };
// }

// function startHand(state: GameState, initialPlayers: Player[]): GameState {
//   const newState = { ...createInitialState(initialPlayers.length) };
//   newState.handOver = false;

//   const currentDealerIndex = initialPlayers.findIndex(p => p.isDealer);
//   const nextDealerIndex = getNextPlayerIndex(currentDealerIndex, initialPlayers.length, []);

//   newState.players.forEach((p, i) => {
//     p.name = initialPlayers[i].name;
//     p.stack = initialPlayers[i].stack;
//     p.isDealer = i === nextDealerIndex;
//   });

//   newState.handId = crypto.randomUUID();

//   newState.players.forEach((p, i) => {
//     p.hand = [];
//     p.bet = 0;
//     p.totalBet = 0;
//     p.status = p.stack > 0 ? 'playing' : 'out';
//     p.winnings = 0;
//     p.isSmallBlind = false;
//     p.isBigBlind = false;
//     p.bestHand = undefined;
//     p.hasActedInRound = false;
//   });

//   const playersInPlay = newState.players.filter(p => p.status !== 'out');
//   if (playersInPlay.length < 2) {
//     newState.actionLog = ['Not enough players with stacks to start a hand.'];
//     newState.handOver = true;
//     return newState;
//   }

//   const playerStatuses = newState.players.map(p => p.status === 'out');

//   const dealerIndex = newState.players.findIndex(p => p.isDealer);
//   const smallBlindIndex = getNextPlayerIndex(dealerIndex, newState.players.length, playerStatuses);
//   const bigBlindIndex = getNextPlayerIndex(smallBlindIndex, newState.players.length, playerStatuses);

//   // In heads-up, dealer is SB
//   const effectiveSBIndex = playersInPlay.length === 2 ? dealerIndex : smallBlindIndex;
//   const effectiveBBIndex = getNextPlayerIndex(effectiveSBIndex, newState.players.length, playerStatuses);


//   const smallBlindPlayer = newState.players[effectiveSBIndex];
//   smallBlindPlayer.isSmallBlind = true;
//   const sbAmount = Math.min(newState.smallBlind, smallBlindPlayer.stack);
//   smallBlindPlayer.stack -= sbAmount;
//   smallBlindPlayer.bet = sbAmount;
//   smallBlindPlayer.totalBet = sbAmount;
//   if (smallBlindPlayer.stack === 0) smallBlindPlayer.status = 'all-in';

//   const bigBlindPlayer = newState.players[effectiveBBIndex];
//   bigBlindPlayer.isBigBlind = true;
//   const bbAmount = Math.min(newState.bigBlind, bigBlindPlayer.stack);
//   bigBlindPlayer.stack -= bbAmount;
//   bigBlindPlayer.bet = bbAmount;
//   bigBlindPlayer.totalBet = bbAmount;
//   if (bigBlindPlayer.stack === 0) bigBlindPlayer.status = 'all-in';

//   newState.pot = 0;
//   newState.currentBet = newState.bigBlind;
//   newState.stage = 'pre-flop';

//   const deck = shuffleDeck(createDeck());
//   const { hands, newDeck } = dealCards(deck, newState.players.length);
//   newState.players.forEach((p, i) => {
//     if (p.status !== 'out') p.hand = hands[i] as [Card, Card]
//   });
//   newState.deck = newDeck;

//   const activePlayerIndex = getNextPlayerIndex(effectiveBBIndex, newState.players.length, playerStatuses);

//   newState.activePlayerIndex = activePlayerIndex;
//   newState.lastRaiserIndex = effectiveBBIndex;

//   newState.communityCards = [];
//   newState.actionLog = [`--- New Hand #${newState.handId.substring(0, 8)} ---`];
//   newState.shortActionLog = [];
//   newState.handWinnerDescription = '';

//   const dealerPlayer = newState.players.find(p => p.isDealer);
//   if (dealerPlayer) {
//     newState.actionLog.push(`${dealerPlayer.name} is the dealer.`);
//   }
//   newState.actionLog.push(`${smallBlindPlayer.name} posts small blind of ${sbAmount}.`);
//   newState.actionLog.push(`${bigBlindPlayer.name} posts big blind of ${bbAmount}.`);
//   newState.actionLog.push(`--- Dealing Hole Cards ---`);
//   newState.players.forEach(p => {
//     if (p.status !== 'out') {
//       newState.actionLog.push(`Dealt to ${p.name}: [ ${p.hand.map(cardToString).join(' ')} ]`);
//     }
//   });

//   const playersWhoCanAct = newState.players.filter(p => p.status === 'playing');
//   if (playersWhoCanAct.length < 2 && playersInPlay.length > 1) {
//     // All but one player are all-in pre-deal, advance to showdown
//     let tempState = newState;
//     while (tempState.communityCards.length < 5 && !tempState.handOver) {
//       tempState = advanceStage(tempState);
//     }
//     return endHand(tempState);
//   }

//   return newState;
// }


// function advanceStage(state: GameState): GameState {
//   const newState = { ...state };

//   // Check if only one player is left who hasn't folded
//   const playersStillIn = newState.players.filter(p => p.status !== 'folded' && p.status !== 'out');
//   if (playersStillIn.length <= 1) {
//     return endHand(newState);
//   }

//   // Move round bets to pot
//   newState.players.forEach(p => {
//     newState.pot += p.bet;
//     p.bet = 0;
//   });
//   newState.currentBet = 0;
//   newState.lastRaiserIndex = null;
//   newState.players.forEach(p => p.hasActedInRound = false);

//   const nextStageMap = {
//     'pre-flop': 'flop',
//     'flop': 'turn',
//     'turn': 'river',
//     'river': 'showdown'
//   };

//   const currentStage = newState.stage;

//   if (currentStage === 'river') {
//     return endHand(newState);
//   }

//   // newState.stage = nextStageMap[currentStage] as GameState['stage'];
//   newState.stage = nextStageMap[currentStage as StageKey] as GameState['stage'];

//   // Burn a card (optional, good practice)
//   newState.deck.pop();

//   if (newState.stage === 'flop') {
//     const flop = [newState.deck.pop()!, newState.deck.pop()!, newState.deck.pop()!];
//     newState.communityCards.push(...flop);
//     newState.actionLog.push(`--- Flop --- [ ${flop.map(cardToString).join(' ')} ] (Pot: ${newState.pot})`);
//     newState.shortActionLog.push(`F[${flop.map(cardToString).join('')}]`);
//   } else if (newState.stage === 'turn') {
//     const turn = newState.deck.pop()!;
//     newState.communityCards.push(turn);
//     newState.actionLog.push(`--- Turn --- [ ${cardToString(turn)} ] (Pot: ${newState.pot})`);
//     newState.shortActionLog.push(`T[${cardToString(turn)}]`);
//   } else if (newState.stage === 'river') {
//     const river = newState.deck.pop()!;
//     newState.communityCards.push(river);
//     newState.actionLog.push(`--- River --- [ ${cardToString(river)} ] (Pot: ${newState.pot})`);
//     newState.shortActionLog.push(`R[${cardToString(river)}]`);
//   }

//   // Determine the next player to act
//   const nonActingPlayers = newState.players.map(p => p.status !== 'playing');
//   const dealerIndex = newState.players.findIndex(p => p.isDealer);
//   const firstPlayerToAct = getNextPlayerIndex(dealerIndex, newState.players.length, nonActingPlayers);

//   newState.activePlayerIndex = firstPlayerToAct;
//   newState.lastRaiserIndex = firstPlayerToAct;

//   // If no one can act (e.g., everyone is all-in), advance again
//   if (firstPlayerToAct === -1) {
//     return advanceStage(newState);
//   }

//   return newState;
// }

// function endHand(state: GameState): GameState {
//   const newState = JSON.parse(JSON.stringify(state));
//   newState.stage = 'showdown';
//   newState.handOver = true;
//   newState.activePlayerIndex = -1;

//   // Finalize pot with current bets
//   newState.players.forEach((p: { bet: number; }) => {
//     newState.pot += p.bet;
//     p.bet = 0;
//   });

//   newState.actionLog.push(`--- Showdown ---`);

//   const playersInHand = newState.players.filter((p: { status: string; }) => p.status !== 'out');
//   const unFoldedPlayers = playersInHand.filter((p: { status: string; }) => p.status !== 'folded');

//   if (unFoldedPlayers.length === 1) {
//     const winner = unFoldedPlayers[0];
//     winner.winnings = newState.pot; // They win the entire pot
//     newState.handWinnerDescription = `${winner.name} wins pot of ${newState.pot}`;
//     newState.actionLog.push(newState.handWinnerDescription);
//   } else {
//     // Evaluate hands for all unfolded players
//     unFoldedPlayers.forEach((player: { hand: Card[]; bestHand: HandEvaluation; name: any; }) => {
//       if (player.hand.length > 0) {
//         const allCards = [...player.hand, ...newState.communityCards];
//         player.bestHand = evaluateBestHand(allCards);
//         newState.actionLog.push(`${player.name} shows [ ${player.hand.map(cardToString).join(' ')} ] - ${player.bestHand.description}`);
//       }
//     });

//     // --- Side Pot Logic ---
//     const potContributors = playersInHand.sort((a: { totalBet: number; }, b: { totalBet: number; }) => a.totalBet - b.totalBet);
//     const betLevels = [...new Set(potContributors.map((p: { totalBet: number; }) => p.totalBet))].filter(bet => bet as number > 0);

//     let lastBetLevel = 0;
//     const potSummaries = [];

//     for (const level of betLevels as number[]) {
//       const potAmountForLevel = level - lastBetLevel;
//       const playersInThisPot = playersInHand.filter((p: { totalBet: number; }) => p.totalBet >= level);
//       const sidePotTotal = playersInThisPot.length * potAmountForLevel + (newState.pot - potContributors.reduce((acc: any, p: { totalBet: any; }) => acc + p.totalBet, 0));
//       newState.pot = 0; // The rest of the pot is now accounted for in this loop.

//       if (sidePotTotal <= 0) continue;

//       const showdownPlayers = unFoldedPlayers.filter((p: { id: any; }) => playersInThisPot.some((c: { id: any; }) => c.id === p.id));

//       if (showdownPlayers.length === 0) {
//         // This can happen if all remaining players in a side pot have folded. The last bettor wins.
//         // This edge case needs careful handling, for now we give it to the first player in the pot.
//         if (playersInThisPot.length > 0) {
//           const winner = playersInThisPot[0];
//           winner.winnings += sidePotTotal;
//           potSummaries.push(`${winner.name} wins an uncontested pot of ${sidePotTotal}`);
//         }
//         continue;
//       }

//       if (showdownPlayers.length === 1) {
//         const winner = showdownPlayers[0];
//         winner.winnings += sidePotTotal;
//         potSummaries.push(`${winner.name} wins a pot of ${sidePotTotal}`);
//       } else {
//         const { winners, bestHand } = findWinners(showdownPlayers, newState.communityCards);
//         const share = Math.floor(sidePotTotal / winners.length);
//         let remainder = sidePotTotal % winners.length;

//         winners.forEach(winner => {
//           winner.winnings += share;
//         });

//         // Distribute remainder chips to players earliest to act
//         if (remainder > 0) {
//           const dealerIndex = newState.players.findIndex((p: { isDealer: any; }) => p.isDealer);
//           let currentIdx = getNextPlayerIndex(dealerIndex, newState.players.length, []);
//           while (remainder > 0) {
//             const playerToGetChip = winners.find(w => w.id === currentIdx);
//             if (playerToGetChip) {
//               playerToGetChip.winnings += 1;
//               remainder--;
//             }
//             currentIdx = getNextPlayerIndex(currentIdx, newState.players.length, []);
//           }
//         }
//         const winnerNames = winners.map(w => w.name).join(', ');
//         potSummaries.push(`${winnerNames} split a pot of ${sidePotTotal} with ${bestHand.description}`);
//       }

//       lastBetLevel = level;
//     }
//     newState.handWinnerDescription = potSummaries.join('; ');
//     newState.actionLog.push(...potSummaries);
//   }

//   // Final stack update
//   newState.players.forEach((p: { stack: any; winnings: any; }) => {
//     p.stack += p.winnings;
//   });

//   return newState;
// }


// function handlePlayerAction(state: GameState): GameState {
//   let newState = JSON.parse(JSON.stringify(state));
//   const activePlayer = newState.players[newState.activePlayerIndex];
//   if (activePlayer) {
//     activePlayer.hasActedInRound = true;
//   }

//   const playersInHand = newState.players.filter((p: { status: string; }) => p.status !== 'folded' && p.status !== 'out');
//   if (playersInHand.length <= 1) {
//     return advanceStage(newState);
//   }

//   // Check if the round should end
//   const playersStillToAct = playersInHand.filter((p: { status: string; hasActedInRound: any; }) => p.status === 'playing' && !p.hasActedInRound);

//   const highestBetInRound = Math.max(...playersInHand.map((p: { bet: any; }) => p.bet));
//   const allBetsSettled = playersInHand.every((p: { bet: number; status: string; }) => {
//     return p.bet === highestBetInRound || p.status === 'all-in' || p.status === 'folded';
//   });

//   if (playersStillToAct.length === 0 && allBetsSettled) {
//     return advanceStage(newState);
//   }

//   // Find next player
//   const nonActingPlayers = newState.players.map((p: { status: string; }) => p.status !== 'playing');
//   let nextPlayerIndex = getNextPlayerIndex(newState.activePlayerIndex, newState.players.length, nonActingPlayers);

//   // If we've looped all the way around and there are no more valid players to act
//   if (nextPlayerIndex === -1 || nextPlayerIndex === newState.lastRaiserIndex) {
//     return advanceStage(newState);
//   }

//   newState.activePlayerIndex = nextPlayerIndex;
//   return newState;
// }

// export function gameReducer(state: GameState, action: Action): GameState {
//   if (state.handOver && action.type !== 'START_HAND') {
//     const isSetup = state.stage === 'setup' || state.handOver;
//     if (!isSetup) return state;
//   }

//   if (state.stage === 'setup' && action.type !== 'START_HAND') return state;

//   let newState = JSON.parse(JSON.stringify(state));
//   const player = newState.players[newState.activePlayerIndex];

//   if (!player && action.type !== 'START_HAND') {
//     return state;
//   }

//   switch (action.type) {
//     case 'START_HAND':
//       return startHand(state, action.payload.players);

//     case 'FOLD':
//       player.status = 'folded';
//       newState.actionLog.push(`${player.name} folds.`);
//       newState.shortActionLog.push('f');
//       return handlePlayerAction(newState);

//     case 'CHECK':
//       if (newState.currentBet > player.bet) return state; // Can't check if there's a bet
//       newState.actionLog.push(`${player.name} checks.`);
//       newState.shortActionLog.push('x');
//       return handlePlayerAction(newState);

//     case 'CALL': {
//       const callAmount = Math.min(newState.currentBet - player.bet, player.stack);
//       // If there's no bet to call, it's a check
//       if (callAmount <= 0) {
//         if (newState.currentBet === 0 || player.bet === newState.currentBet) {
//           newState.actionLog.push(`${player.name} checks.`);
//           newState.shortActionLog.push('x');
//           return handlePlayerAction(newState);
//         }
//         return state; // Invalid call
//       }
//       player.stack -= callAmount;
//       player.bet += callAmount;
//       player.totalBet += callAmount;
//       newState.actionLog.push(`${player.name} calls ${callAmount}.`);
//       newState.shortActionLog.push('c');
//       if (player.stack === 0) {
//         player.status = 'all-in';
//       }
//       return handlePlayerAction(newState);
//     }

//     case 'BET': {
//       if (newState.currentBet > 0) return state; // Can't bet if there's already a bet, must raise
//       const betAmount = Math.min(action.payload.amount, player.stack);
//       if (betAmount <= 0 || (betAmount < newState.bigBlind && betAmount < player.stack)) return state;
//       player.stack -= betAmount;
//       player.bet += betAmount;
//       player.totalBet += betAmount;
//       newState.currentBet = player.bet;
//       newState.lastRaiserIndex = newState.activePlayerIndex;
//       newState.actionLog.push(`${player.name} bets ${betAmount}.`);
//       newState.shortActionLog.push(`b${betAmount}`);
//       if (player.stack === 0) player.status = 'all-in';
//       return handlePlayerAction(newState);
//     }

//     case 'RAISE': {
//       if (player.stack === 0) return state;

//       const totalBetAmount = Math.min(action.payload.amount, player.stack + player.bet);
//       const raiseAmount = totalBetAmount - player.bet;

//       if (raiseAmount <= 0) return state; // Must raise by a positive amount

//       const lastRaiseSize = newState.currentBet - (newState.players.find((p: { id: any; }) => p.id === newState.lastRaiserIndex)?.bet || 0);
//       const minRaiseTotal = newState.currentBet + Math.max(lastRaiseSize, newState.bigBlind);

//       const isAllIn = (player.stack - raiseAmount) <= 0;

//       // Under-raise all-in is allowed, but a regular raise must be at least the minimum.
//       if (totalBetAmount < minRaiseTotal && !isAllIn) {
//         return state;
//       }

//       player.stack -= raiseAmount;
//       player.bet += raiseAmount;
//       player.totalBet += raiseAmount;

//       let actionVerb = 'raises to';
//       if (isAllIn) {
//         actionVerb = player.bet > newState.currentBet ? 'goes all-in with a raise to' : 'goes all-in for';
//       }

//       newState.actionLog.push(`${player.name} ${actionVerb} ${totalBetAmount}.`);
//       newState.shortActionLog.push(`r${totalBetAmount}`);

//       if (isAllIn) {
//         player.status = 'all-in';
//       }

//       // A full raise re-opens the action
//       if (player.bet >= minRaiseTotal && !isAllIn) {
//         newState.currentBet = player.bet;
//         newState.lastRaiserIndex = newState.activePlayerIndex;
//         newState.players.forEach((p: { id: any; status: string; hasActedInRound: boolean; }) => {
//           if (p.id !== player.id && p.status === 'playing') {
//             p.hasActedInRound = false;
//           }
//         });
//       }
//       // An all-in that is larger than the current bet also sets a new bet amount
//       else if (isAllIn && player.bet > newState.currentBet) {
//         newState.currentBet = player.bet;
//         newState.lastRaiserIndex = newState.activePlayerIndex;
//         newState.players.forEach((p: { id: any; status: string; hasActedInRound: boolean; }) => {
//           if (p.id !== player.id && p.status === 'playing') {
//             p.hasActedInRound = false;
//           }
//         });
//       }

//       return handlePlayerAction(newState);
//     }

//     default:
//       return state;
//   }
// }



// calculations error
// 'use client';
// import type { GameState, Action, Player, Card } from './types';
// import { createDeck, shuffleDeck, dealCards } from './deck';
// import { cardToString, getNextPlayerIndex } from './utils';
// import { findWinners, evaluateBestHand } from './hand-evaluator';
// import { v4 as uuidv4 } from "uuid";


// export const BIG_BLIND_SIZE = 40;
// export const SMALL_BLIND_SIZE = 20;

// export function createInitialState(numPlayers: number): GameState {
//   const players: Player[] = Array.from({ length: numPlayers }, (_, i) => ({
//     id: i,
//     name: `Player ${i + 1}`,
//     stack: 2000,
//     hand: [],
//     bet: 0,
//     totalBet: 0,
//     status: 'playing',
//     isDealer: false,
//     isSmallBlind: false,
//     isBigBlind: false,
//     winnings: 0,
//   }));

//   return {
//     players,
//     deck: [],
//     communityCards: [],
//     pot: 0,
//     stage: 'setup',
//     activePlayerIndex: 0,
//     lastRaiserIndex: null,
//     currentBet: 0,
//     smallBlind: SMALL_BLIND_SIZE,
//     bigBlind: BIG_BLIND_SIZE,
//     actionLog: ['Welcome to Texas Hold\'em! Click Start to begin.'],
//     shortActionLog: [],
//     handId: '',
//     handWinnerDescription: '',
//     handOver: true, // Start in a "handOver" state
//   };
// }

// function startHand(state: GameState, initialPlayers: Player[]): GameState {
//   const newState = { ...createInitialState(initialPlayers.length) };
//   newState.handOver = false;

//   const currentDealerIndex = initialPlayers.findIndex(p => p.isDealer);
//   const nextDealerIndex = getNextPlayerIndex(currentDealerIndex, initialPlayers.length, []);

//   newState.players.forEach((p, i) => {
//     p.name = initialPlayers[i].name;
//     p.stack = initialPlayers[i].stack;
//     p.isDealer = i === nextDealerIndex;
//   });

//   newState.handId = uuidv4()

//   // Reset players for new hand
//   newState.players.forEach((p, i) => {
//     p.hand = [];
//     p.bet = 0;
//     p.totalBet = 0;
//     p.status = p.stack > 0 ? 'playing' : 'out'; // Use 'out' for players with 0 stack
//     p.winnings = 0;
//     p.isSmallBlind = false;
//     p.isBigBlind = false;
//     p.bestHand = undefined;
//     p.hasActedInRound = false;
//   });

//   // Filter out players who are 'out' of the game entirely
//   const playersInPlay = newState.players.filter(p => p.status !== 'out');
//   if (playersInPlay.length < 2) {
//     newState.actionLog = ['Not enough players with stacks to start a hand.'];
//     newState.handOver = true;
//     return newState;
//   }

//   // Use a map for player statuses to pass to getNextPlayerIndex
//   const playerStatuses = newState.players.map(p => p.status !== 'playing');

//   const dealerIndex = newState.players.findIndex(p => p.isDealer);
//   const smallBlindIndex = getNextPlayerIndex(dealerIndex, newState.players.length, playerStatuses);
//   const bigBlindIndex = getNextPlayerIndex(smallBlindIndex, newState.players.length, playerStatuses);

//   // Handle heads-up case where dealer is SB
//   const effectiveSBIndex = playersInPlay.length === 2 ? dealerIndex : smallBlindIndex;
//   const effectiveBBIndex = getNextPlayerIndex(effectiveSBIndex, newState.players.length, playerStatuses);


//   const smallBlindPlayer = newState.players[effectiveSBIndex];
//   smallBlindPlayer.isSmallBlind = true;
//   const sbAmount = Math.min(newState.smallBlind, smallBlindPlayer.stack);
//   smallBlindPlayer.stack -= sbAmount;
//   smallBlindPlayer.bet = sbAmount;
//   smallBlindPlayer.totalBet = sbAmount;
//   if (smallBlindPlayer.stack === 0) smallBlindPlayer.status = 'all-in';

//   const bigBlindPlayer = newState.players[effectiveBBIndex];
//   bigBlindPlayer.isBigBlind = true;
//   const bbAmount = Math.min(newState.bigBlind, bigBlindPlayer.stack);
//   bigBlindPlayer.stack -= bbAmount;
//   bigBlindPlayer.bet = bbAmount;
//   bigBlindPlayer.totalBet = bbAmount;
//   if (bigBlindPlayer.stack === 0) bigBlindPlayer.status = 'all-in';

//   newState.pot = 0;
//   newState.currentBet = newState.bigBlind;
//   newState.stage = 'pre-flop';

//   const deck = shuffleDeck(createDeck());
//   const { hands, newDeck } = dealCards(deck, newState.players.length);
//   newState.players.forEach((p, i) => {
//     if (p.status === 'playing') p.hand = hands[i] as [Card, Card]
//   });
//   newState.deck = newDeck;

//   const activePlayerIndex = getNextPlayerIndex(effectiveBBIndex, newState.players.length, playerStatuses);

//   newState.activePlayerIndex = activePlayerIndex;
//   newState.lastRaiserIndex = effectiveBBIndex; // The BB is the last "raise" initially

//   newState.communityCards = [];
//   newState.actionLog = [`--- New Hand #${newState.handId.substring(0, 8)} ---`];
//   newState.shortActionLog = [];
//   newState.handWinnerDescription = '';

//   const dealerPlayer = newState.players[dealerIndex];
//   newState.actionLog.push(`${dealerPlayer.name} is the dealer.`);
//   newState.actionLog.push(`${smallBlindPlayer.name} posts small blind of ${sbAmount}.`);
//   newState.actionLog.push(`${bigBlindPlayer.name} posts big blind of ${bbAmount}.`);
//   newState.actionLog.push(`--- Dealing Hole Cards ---`);
//   newState.players.forEach(p => {
//     if (p.status !== 'out') {
//       newState.actionLog.push(`Dealt to ${p.name}: [ ${p.hand.map(cardToString).join(' ')} ]`);
//     }
//   });

//   if (activePlayerIndex === -1 || playersInPlay.filter(p => p.status === 'playing').length < 2) {
//     return advanceStage(newState);
//   }

//   return newState;
// }

// function advanceStage(state: GameState): GameState {
//   const newState = { ...state };

//   // Before advancing, check if only one player is left who hasn't folded.
//   const playersStillIn = newState.players.filter(p => p.status !== 'folded' && p.status !== 'out');
//   if (playersStillIn.length <= 1) {
//     return endHand(newState);
//   }

//   // Collect bets into pot
//   newState.players.forEach(p => {
//     newState.pot += p.bet;
//     p.bet = 0;
//   });
//   newState.currentBet = 0;

//   if (newState.stage === 'pre-flop') {
//     newState.stage = 'flop';
//     const flop = [newState.deck.pop()!, newState.deck.pop()!, newState.deck.pop()!];
//     newState.communityCards.push(...flop);
//     newState.actionLog.push(`--- Flop --- [ ${flop.map(cardToString).join(' ')} ] (Pot: ${newState.pot})`);
//     newState.shortActionLog.push(`F[${flop.map(cardToString).join('')}]`);
//   } else if (newState.stage === 'flop') {
//     newState.stage = 'turn';
//     const turn = newState.deck.pop()!;
//     newState.communityCards.push(turn);
//     newState.actionLog.push(`--- Turn --- [ ${cardToString(turn)} ] (Pot: ${newState.pot})`);
//     newState.shortActionLog.push(`T[${cardToString(turn)}]`);
//   } else if (newState.stage === 'turn') {
//     newState.stage = 'river';
//     const river = newState.deck.pop()!;
//     newState.communityCards.push(river);
//     newState.actionLog.push(`--- River --- [ ${cardToString(river)} ] (Pot: ${newState.pot})`);
//     newState.shortActionLog.push(`R[${cardToString(river)}]`);
//   } else if (newState.stage === 'river') {
//     return endHand(newState);
//   }

//   // A player is not able to act if they are folded, all-in, or out of the game.
//   const nonActingPlayers = newState.players.map(p => p.status !== 'playing');

//   const dealerIndex = newState.players.findIndex(p => p.isDealer);
//   const firstPlayerToAct = getNextPlayerIndex(dealerIndex, newState.players.length, nonActingPlayers);

//   newState.activePlayerIndex = firstPlayerToAct;
//   newState.lastRaiserIndex = firstPlayerToAct; // New round, action starts here.
//   newState.players.forEach(p => p.hasActedInRound = false);

//   const playersWhoCanBet = newState.players.filter(p => p.status === 'playing');

//   // If no one can bet (everyone is all-in), or only one person can bet, just deal out the rest of the board.
//   if (firstPlayerToAct === -1 || playersWhoCanBet.length < 2) {
//     let tempState = newState;
//     while (tempState.communityCards.length < 5 && !tempState.handOver) {
//       tempState = advanceStage(tempState);
//     }
//     return endHand(tempState);
//   }

//   return newState;
// }


// function endHand(state: GameState): GameState {
//   const newState = { ...state };
//   newState.stage = 'showdown';
//   newState.handOver = true;
//   newState.activePlayerIndex = -1; // No more actions

//   // Final bet collection before distributing pots
//   newState.players.forEach(p => {
//     newState.pot += p.bet;
//     p.bet = 0;
//   });

//   newState.actionLog.push(`--- Showdown ---`);

//   const playersInHand = newState.players.filter(p => p.status !== 'folded' && p.status !== 'out');

//   if (playersInHand.length === 1) {
//     const winner = playersInHand[0];
//     winner.winnings = newState.pot;
//     winner.stack += newState.pot;
//     newState.handWinnerDescription = `${winner.name} wins pot of ${newState.pot}`;
//     newState.actionLog.push(newState.handWinnerDescription);
//   } else {
//     // Evaluate hands for all players who made it to showdown
//     playersInHand.forEach(player => {
//       const allCards = [...player.hand, ...newState.communityCards];
//       player.bestHand = evaluateBestHand(allCards);
//       newState.actionLog.push(`${player.name} shows [ ${player.hand.map(cardToString).join(' ')} ] - ${player.bestHand.description}`);
//     });

//     const { winners, bestHand } = findWinners(playersInHand, newState.communityCards);

//     // Basic pot distribution (no side pots yet)
//     const potShare = Math.floor(newState.pot / winners.length);
//     winners.forEach(winner => {
//       winner.winnings += potShare;
//       winner.stack += potShare;
//     });

//     // Handle remainder chips
//     let remainder = newState.pot % winners.length;
//     if (remainder > 0) {
//       // Give remainder chips to the first player(s) after the dealer button
//       const dealerIndex = newState.players.findIndex(p => p.isDealer);
//       let currentIdx = (dealerIndex + 1) % newState.players.length;
//       while (remainder > 0) {
//         const playerToGetChip = winners.find(w => w.id === currentIdx);
//         if (playerToGetChip) {
//           playerToGetChip.winnings += 1;
//           playerToGetChip.stack += 1;
//           remainder--;
//         }
//         currentIdx = (currentIdx + 1) % newState.players.length;
//       }
//     }

//     const winnerNames = winners.map(w => w.name).join(', ');
//     const winPlural = winners.length > 1 ? '' : 's';
//     newState.handWinnerDescription = `${winnerNames} win${winPlural} with ${bestHand.description}`;
//     newState.actionLog.push(newState.handWinnerDescription);
//   }

//   return newState;
// }

// function handlePlayerAction(state: GameState): GameState {
//   let newState = JSON.parse(JSON.stringify(state)); // Deep copy
//   const activePlayer = newState.players[newState.activePlayerIndex];
//   if (activePlayer) {
//     activePlayer.hasActedInRound = true;
//   }

//   const playersInHand = newState.players.filter((p: { status: string; }) => p.status !== 'folded' && p.status !== 'out');
//   if (playersInHand.length <= 1) {
//     return advanceStage(newState);
//   }

//   const playersStillAbleToAct = playersInHand.filter((p: { status: string; }) => p.status === 'playing');
//   const allHaveActed = playersStillAbleToAct.every((p: { hasActedInRound: any; }) => p.hasActedInRound);

//   // This is the highest total bet a player has made in this round
//   const highestBetInRound = Math.max(...playersInHand.map((p: { bet: any; }) => p.bet));

//   // Everyone still in the hand has either matched the highest bet or is all-in
//   const allBetsSettled = playersInHand.every((p: { bet: number; status: string; }) => p.bet === highestBetInRound || p.status === 'all-in');

//   // Check if the round should end
//   if (allHaveActed && allBetsSettled) {
//     return advanceStage(newState);
//   }

//   // --- Find next player to act ---
//   const nonActingPlayers = newState.players.map((p: { status: string; }) => p.status !== 'playing');
//   const nextPlayerIndex = getNextPlayerIndex(newState.activePlayerIndex, newState.players.length, nonActingPlayers);

//   // If we've circled back to the last raiser (and everyone has acted), or no one else can act, the round is over.
//   if (nextPlayerIndex === newState.lastRaiserIndex || nextPlayerIndex === -1) {
//     // One final check: if the BB had the option and just checked, the round is over.
//     const bbPlayer = newState.players.find((p: { isBigBlind: any; }) => p.isBigBlind);
//     if (newState.stage === 'pre-flop' && newState.currentBet === newState.bigBlind && bbPlayer?.id === newState.activePlayerIndex) {
//       // BB just checked their option, so pre-flop round ends.
//       return advanceStage(newState);
//     }

//     if (nextPlayerIndex === -1) {
//       return advanceStage(newState);
//     }
//   }

//   newState.activePlayerIndex = nextPlayerIndex;
//   return newState;
// }


// export function gameReducer(state: GameState, action: Action): GameState {
//   if (state.handOver && action.type !== 'START_HAND') {
//     const isSetup = state.stage === 'setup' || state.handOver;
//     if (!isSetup) return state;
//   }

//   if (state.stage === 'setup' && action.type !== 'START_HAND') return state;

//   let newState = JSON.parse(JSON.stringify(state)); // Deep copy for safety
//   const player = newState.players[newState.activePlayerIndex];

//   if (!player && action.type !== 'START_HAND') {
//     return state;
//   }

//   switch (action.type) {
//     case 'START_HAND':
//       return startHand(state, action.payload.players);

//     case 'FOLD':
//       player.status = 'folded';
//       newState.actionLog.push(`${player.name} folds.`);
//       newState.shortActionLog.push('f');
//       return handlePlayerAction(newState);

//     case 'CHECK':
//       if (newState.currentBet > player.bet) return state; // Invalid action
//       newState.actionLog.push(`${player.name} checks.`);
//       newState.shortActionLog.push('x');
//       return handlePlayerAction(newState);

//     case 'CALL': {
//       const callAmount = Math.min(newState.currentBet - player.bet, player.stack);
//       if (callAmount <= 0) {
//         // This is a check
//         if (newState.currentBet === 0 || player.bet === newState.currentBet) {
//           newState.actionLog.push(`${player.name} checks.`);
//           newState.shortActionLog.push('x');
//           return handlePlayerAction(newState);
//         }
//         return state; // Invalid call
//       }
//       player.stack -= callAmount;
//       player.bet += callAmount;
//       player.totalBet += callAmount;
//       newState.actionLog.push(`${player.name} calls ${callAmount}.`);
//       newState.shortActionLog.push('c');
//       if (player.stack === 0) {
//         player.status = 'all-in';
//       }
//       return handlePlayerAction(newState);
//     }

//     case 'BET': {
//       if (newState.currentBet > 0) return state; // Cannot bet if there's already a bet, must raise
//       const betAmount = Math.min(action.payload.amount, player.stack);
//       if (betAmount <= 0) return state;
//       player.stack -= betAmount;
//       player.bet += betAmount;
//       player.totalBet += betAmount;
//       newState.currentBet = player.bet;
//       newState.lastRaiserIndex = newState.activePlayerIndex;
//       newState.actionLog.push(`${player.name} bets ${betAmount}.`);
//       newState.shortActionLog.push(`b${betAmount}`);
//       if (player.stack === 0) player.status = 'all-in';

//       // A new bet resets the action for everyone else
//       newState.players.forEach((p: { status: string; hasActedInRound: boolean; }) => { if (p.status === 'playing') p.hasActedInRound = false });

//       return handlePlayerAction(newState);
//     }

//     case 'RAISE': {
//       if (player.stack === 0) return state; // Cannot raise if no stack

//       // This is the total bet amount the player wants to make
//       const totalBetAmount = Math.min(action.payload.amount, player.stack + player.bet);
//       const amountToPutIn = totalBetAmount - player.bet;

//       if (amountToPutIn <= 0) return state; // Not actually a raise

//       // Check if it's a valid raise size
//       const lastRaiseSize = newState.currentBet - (newState.players
//         .filter((p: { id: any; bet: number; }) => p.id !== player.id && p.bet < newState.currentBet)
//         .reduce((prev: number, curr: { bet: number; }) => Math.max(prev, curr.bet), 0));

//       const minRaiseTotal = newState.currentBet + Math.max(lastRaiseSize, newState.bigBlind);

//       // A player can go all-in for less than a min-raise, but it doesn't re-open action
//       const isAllIn = (player.stack - amountToPutIn) === 0;
//       const isValidRaise = totalBetAmount >= minRaiseTotal;

//       if (!isValidRaise && !isAllIn) {
//         console.warn(`Invalid raise amount: ${totalBetAmount}. Minimum is ${minRaiseTotal}`);
//         return state; // Not a valid raise and not an all-in
//       }

//       player.stack -= amountToPutIn;
//       player.bet += amountToPutIn;
//       player.totalBet += amountToPutIn;

//       newState.currentBet = player.bet;

//       // A valid raise re-opens the action for all other players
//       if (isValidRaise) {
//         newState.lastRaiserIndex = newState.activePlayerIndex;
//         newState.players.forEach((p: { status: string; id: any; hasActedInRound: boolean; }) => {
//           if (p.status === 'playing' && p.id !== player.id) {
//             p.hasActedInRound = false;
//           }
//         });
//       }

//       newState.actionLog.push(`${player.name} raises to ${totalBetAmount}.`);
//       newState.shortActionLog.push(`r${totalBetAmount}`);
//       if (isAllIn) player.status = 'all-in';

//       return handlePlayerAction(newState);
//     }

//     default:
//       return state;
//   }
// }



// all good but issue in allin one player turn misses
// 'use client';
// import type { GameState, Action, Player, Card } from './types';
// import { createDeck, shuffleDeck, dealCards } from './deck';
// import { cardToString, getNextPlayerIndex } from './utils';
// import { findWinners } from './hand-evaluator';
// import { v4 as uuidv4 } from "uuid";


// export const BIG_BLIND_SIZE = 40;
// export const SMALL_BLIND_SIZE = 20;

// export function createInitialState(numPlayers: number): GameState {
//   const players: Player[] = Array.from({ length: numPlayers }, (_, i) => ({
//     id: i,
//     name: `Player ${i + 1}`,
//     stack: 2000,
//     hand: [],
//     bet: 0,
//     totalBet: 0,
//     status: 'playing',
//     isDealer: false,
//     isSmallBlind: false,
//     isBigBlind: false,
//     winnings: 0,
//   }));

//   return {
//     players,
//     deck: [],
//     communityCards: [],
//     pot: 0,
//     stage: 'setup',
//     activePlayerIndex: 0,
//     lastRaiserIndex: null,
//     currentBet: 0,
//     smallBlind: SMALL_BLIND_SIZE,
//     bigBlind: BIG_BLIND_SIZE,
//     actionLog: ['Welcome to Texas Hold\'em! Click Start to begin.'],
//     shortActionLog: [],
//     handId: '',
//     handWinnerDescription: '',
//     handOver: true, // Start in a "handOver" state
//   };
// }

// function startHand(state: GameState, initialPlayers: Player[]): GameState {
//   const newState = { ...createInitialState(initialPlayers.length) };
//   newState.handOver = false;

//   const currentDealerIndex = initialPlayers.findIndex(p => p.isDealer);
//   const nextDealerIndex = getNextPlayerIndex(currentDealerIndex, initialPlayers.length, []);

//   newState.players.forEach((p, i) => {
//     p.name = initialPlayers[i].name;
//     p.stack = initialPlayers[i].stack;
//     p.isDealer = i === nextDealerIndex;
//   });

//   // newState.handId = crypto.randomUUID();
//   newState.handId = uuidv4() // crypto.randomUUID();


//   // Reset players for new hand
//   newState.players.forEach((p, i) => {
//     p.hand = [];
//     p.bet = 0;
//     p.totalBet = 0;
//     p.status = p.stack > 0 ? 'playing' : 'folded';
//     p.winnings = 0;
//     p.isSmallBlind = false;
//     p.isBigBlind = false;
//     p.bestHand = undefined;
//   });

//   const playersInPlay = newState.players.filter(p => p.stack > 0);
//   if (playersInPlay.length < 2) {
//     newState.actionLog = ['Not enough players with stacks to start a hand.'];
//     newState.handOver = true;
//     return newState;
//   }

//   const foldedPlayersOnInit = newState.players.map(p => p.status === 'folded');

//   const dealerIndex = newState.players.findIndex(p => p.isDealer);
//   const smallBlindIndex = getNextPlayerIndex(dealerIndex, newState.players.length, foldedPlayersOnInit);
//   const bigBlindIndex = getNextPlayerIndex(smallBlindIndex, newState.players.length, foldedPlayersOnInit);

//   const smallBlindPlayer = newState.players[smallBlindIndex];
//   smallBlindPlayer.isSmallBlind = true;
//   const sbAmount = Math.min(newState.smallBlind, smallBlindPlayer.stack);
//   smallBlindPlayer.stack -= sbAmount;
//   smallBlindPlayer.bet = sbAmount;
//   smallBlindPlayer.totalBet = sbAmount;
//   if (smallBlindPlayer.stack === 0) smallBlindPlayer.status = 'all-in';

//   const bigBlindPlayer = newState.players[bigBlindIndex];
//   bigBlindPlayer.isBigBlind = true;
//   const bbAmount = Math.min(newState.bigBlind, bigBlindPlayer.stack);
//   bigBlindPlayer.stack -= bbAmount;
//   bigBlindPlayer.bet = bbAmount;
//   bigBlindPlayer.totalBet = bbAmount;
//   if (bigBlindPlayer.stack === 0) bigBlindPlayer.status = 'all-in';

//   newState.pot = 0;
//   newState.currentBet = newState.bigBlind;
//   newState.stage = 'pre-flop';

//   const deck = shuffleDeck(createDeck());
//   const { hands, newDeck } = dealCards(deck, newState.players.length);
//   newState.players.forEach((p, i) => {
//     if (p.status !== 'folded') p.hand = hands[i] as [Card, Card]
//   });
//   newState.deck = newDeck;

//   const activePlayerIndex = getNextPlayerIndex(bigBlindIndex, newState.players.length, foldedPlayersOnInit);

//   newState.activePlayerIndex = activePlayerIndex;
//   newState.lastRaiserIndex = bigBlindIndex;

//   newState.communityCards = [];
//   newState.actionLog = [`--- New Hand #${newState.handId.substring(0, 8)} ---`];
//   newState.shortActionLog = [];
//   newState.actionLog.push(`${smallBlindPlayer.name} posts small blind of ${sbAmount}`);
//   newState.actionLog.push(`${bigBlindPlayer.name} posts big blind of ${bbAmount}`);
//   newState.handWinnerDescription = '';

//   // if action gets folded to BB, or only BB is left, go to next stage.
//   if (activePlayerIndex === -1) {
//     return advanceStage(newState);
//   }

//   return newState;
// }

// function advanceStage(state: GameState): GameState {
//   const newState = { ...state };

//   const playersStillIn = newState.players.filter(p => p.status !== 'folded');
//   if (playersStillIn.length <= 1) {
//     return endHand(newState);
//   }

//   // Collect bets into pot
//   newState.players.forEach(p => {
//     newState.pot += p.bet;
//     p.bet = 0;
//   });
//   newState.currentBet = 0;

//   if (newState.stage === 'pre-flop') {
//     newState.stage = 'flop';
//     const flop = [newState.deck.pop()!, newState.deck.pop()!, newState.deck.pop()!];
//     newState.communityCards.push(...flop);
//     newState.actionLog.push(`--- Flop --- [ ${flop.map(cardToString).join(' ')} ] (Pot: ${newState.pot})`);
//     newState.shortActionLog.push(`F[${flop.map(cardToString).join('')}]`);
//   } else if (newState.stage === 'flop') {
//     newState.stage = 'turn';
//     const turn = newState.deck.pop()!;
//     newState.communityCards.push(turn);
//     newState.actionLog.push(`--- Turn --- [ ${cardToString(turn)} ] (Pot: ${newState.pot})`);
//     newState.shortActionLog.push(`T[${cardToString(turn)}]`);
//   } else if (newState.stage === 'turn') {
//     newState.stage = 'river';
//     const river = newState.deck.pop()!;
//     newState.communityCards.push(river);
//     newState.actionLog.push(`--- River --- [ ${cardToString(river)} ] (Pot: ${newState.pot})`);
//     newState.shortActionLog.push(`R[${cardToString(river)}]`);
//   } else if (newState.stage === 'river') {
//     return endHand(newState);
//   }

//   const nonActingPlayers = newState.players.map(p => p.status === 'folded' || p.status === 'all-in');

//   const dealerIndex = newState.players.findIndex(p => p.isDealer);
//   const firstPlayerToAct = getNextPlayerIndex(dealerIndex, newState.players.length, nonActingPlayers);

//   newState.activePlayerIndex = firstPlayerToAct;
//   newState.lastRaiserIndex = firstPlayerToAct;
//   newState.players.forEach(p => p.hasActedInRound = false);

//   const playersAbleToBet = newState.players.filter(p => p.status === 'playing' && p.stack > 0);

//   if (playersAbleToBet.length < 2 && playersAbleToBet.length > 0) {
//     // If only one player can bet, they don't need to act. Let's check if there are all-in players.
//     const allInPlayersCount = newState.players.filter(p => p.status === 'all-in').length;
//     if (allInPlayersCount > 0) {
//       // If there's one player who can bet and others are all-in, we just show cards.
//       let tempState = newState;
//       while (tempState.communityCards.length < 5) {
//         tempState = advanceStage(tempState);
//       }
//       return endHand(tempState);
//     }
//   }

//   if (firstPlayerToAct === -1) {
//     let tempState = newState;
//     while (tempState.communityCards.length < 5) {
//       tempState = advanceStage(tempState);
//       if (tempState.handOver) break;
//     }
//     return endHand(tempState);
//   }

//   return newState;
// }


// function endHand(state: GameState): GameState {
//   const newState = { ...state };
//   newState.stage = 'showdown';
//   newState.handOver = true;

//   // Final bet collection
//   newState.players.forEach(p => {
//     newState.pot += p.bet;
//     p.bet = 0;
//   });

//   newState.actionLog.push(`--- Showdown ---`);

//   let activePlayers = newState.players.filter(p => p.status !== 'folded');

//   if (activePlayers.length === 1) {
//     const winner = activePlayers[0];
//     winner.winnings = newState.pot;
//     winner.stack += newState.pot;
//     newState.handWinnerDescription = `${winner.name} wins pot of ${newState.pot}`;
//     newState.actionLog.push(newState.handWinnerDescription);
//   } else {
//     // More complex side pot logic would be needed for a real money game
//     const { winners, bestHand } = findWinners(newState.players, newState.communityCards);
//     const potShare = Math.floor(newState.pot / winners.length);

//     winners.forEach(winner => {
//       winner.winnings = potShare;
//       winner.stack += potShare;
//     });

//     // Handle odd chips
//     let remainder = newState.pot % winners.length;
//     if (remainder > 0) {
//       const dealerIndex = newState.players.findIndex(p => p.isDealer);
//       let currentIdx = getNextPlayerIndex(dealerIndex, newState.players.length, []);
//       while (remainder > 0) {
//         const playerToGetChip = winners.find(w => w.id === newState.players[currentIdx].id);
//         if (playerToGetChip) {
//           playerToGetChip.winnings += 1;
//           playerToGetChip.stack += 1;
//           remainder--;
//         }
//         currentIdx = getNextPlayerIndex(currentIdx, newState.players.length, []);
//       }
//     }

//     const winnerNames = winners.map(w => w.name).join(', ');
//     newState.handWinnerDescription = `${winnerNames} win${winners.length > 1 ? '' : 's'} with ${bestHand.description}`;
//     newState.actionLog.push(newState.handWinnerDescription);
//     newState.actionLog.push(`Winning Hand: ${winners.map(w => `${w.name}: ${w.hand.map(cardToString).join(' ')}`).join('; ')}`);
//   }

//   newState.activePlayerIndex = -1; // No more actions
//   return newState;
// }


// function handlePlayerAction(state: GameState): GameState {
//   let newState = { ...state };
//   const currentPlayer = newState.players[newState.activePlayerIndex];
//   if (currentPlayer) {
//     currentPlayer.hasActedInRound = true;
//   }

//   const playersInHandCount = newState.players.filter(p => p.status !== 'folded').length;
//   if (playersInHandCount <= 1) {
//     return endHand(newState);
//   }

//   const nonActingPlayers = newState.players.map(p => p.status === 'folded' || p.status === 'all-in');

//   // Check if betting round is over.
//   const activePlayers = newState.players.filter(p => p.status !== 'folded');
//   const allActivePlayersHaveActed = activePlayers.every(p => p.hasActedInRound || p.status === 'all-in');
//   const allBetsEqualized = activePlayers.filter(p => p.status !== 'all-in').every(p => p.bet === newState.currentBet);

//   if (allActivePlayersHaveActed && allBetsEqualized) {
//     // Special pre-flop case for the Big Blind
//     if (newState.stage === 'pre-flop' && newState.currentBet === newState.bigBlind) {
//       const bbPlayer = newState.players.find(p => p.isBigBlind);
//       // If action gets to BB and they haven't acted, they get an option.
//       if (bbPlayer && !bbPlayer.hasActedInRound && newState.activePlayerIndex === bbPlayer.id) {
//         // This case should not advance stage, but let the BB act.
//         // After the BB acts, this condition will be re-evaluated and pass.
//       } else {
//         return advanceStage(newState);
//       }
//     } else {
//       return advanceStage(newState);
//     }
//   }

//   // Find next player to act
//   const nextPlayerIndex = getNextPlayerIndex(newState.activePlayerIndex, newState.players.length, nonActingPlayers);

//   const playersAbleToBet = newState.players.filter(p => p.status === 'playing' && p.stack > 0).length;

//   if (playersAbleToBet < 2 && playersInHandCount > 1) {
//     let tempState = newState;
//     while (tempState.communityCards.length < 5) {
//       tempState = advanceStage(tempState);
//       if (tempState.handOver) break;
//     }
//     return endHand(tempState);
//   }

//   if (nextPlayerIndex === -1) {
//     return advanceStage(newState);
//   }

//   newState.activePlayerIndex = nextPlayerIndex;
//   return newState;
// }


// export function gameReducer(state: GameState, action: Action): GameState {
//   if (state.handOver && action.type !== 'START_HAND') {
//     const isSetup = state.stage === 'setup' || state.handOver;
//     if (!isSetup) return state;
//   }

//   if (state.stage === 'setup' && action.type !== 'START_HAND') return state;

//   let newState = JSON.parse(JSON.stringify(state)); // Deep copy for safety
//   const player = newState.players[newState.activePlayerIndex];

//   if (!player && action.type !== 'START_HAND') {
//     return state;
//   }

//   switch (action.type) {
//     case 'START_HAND':
//       return startHand(state, action.payload.players);

//     case 'FOLD':
//       player.status = 'folded';
//       newState.actionLog.push(`${player.name} folds.`);
//       newState.shortActionLog.push('f');
//       return handlePlayerAction(newState);

//     case 'CHECK':
//       if (newState.currentBet > player.bet) return state; // Invalid action
//       newState.actionLog.push(`${player.name} checks.`);
//       newState.shortActionLog.push('x');
//       return handlePlayerAction(newState);

//     case 'CALL': {
//       const callAmount = Math.min(newState.currentBet - player.bet, player.stack);
//       if (callAmount <= 0) {
//         if (player.bet === newState.currentBet && newState.currentBet > 0) {
//           return state; // Already called
//         }
//         // This is a check
//         if (newState.currentBet === 0 || (newState.stage === 'pre-flop' && player.isBigBlind && newState.currentBet === player.bet)) {
//           newState.actionLog.push(`${player.name} checks.`);
//           newState.shortActionLog.push('x');
//           return handlePlayerAction(newState);
//         }
//         return state;
//       }
//       player.stack -= callAmount;
//       player.bet += callAmount;
//       player.totalBet += callAmount;
//       newState.actionLog.push(`${player.name} calls ${callAmount}.`);
//       newState.shortActionLog.push('c');
//       if (player.stack === 0) {
//         player.status = 'all-in';
//       }
//       return handlePlayerAction(newState);
//     }

//     case 'BET': {
//       if (newState.currentBet > 0) return state; // Cannot bet if there's already a bet
//       const betAmount = Math.min(action.payload.amount, player.stack);
//       if (betAmount <= 0) return state;
//       player.stack -= betAmount;
//       player.bet += betAmount;
//       player.totalBet += betAmount;
//       newState.currentBet = player.bet;
//       newState.lastRaiserIndex = newState.activePlayerIndex;
//       newState.actionLog.push(`${player.name} bets ${betAmount}.`);
//       newState.shortActionLog.push(`b${betAmount}`);
//       if (player.stack === 0) player.status = 'all-in';
//       return handlePlayerAction(newState);
//     }

//     case 'RAISE': {
//       if (player.stack === 0) return state;

//       const lastRaiseSize = newState.currentBet > 0
//         ? (newState.currentBet - (newState.players.filter((p: { status: string; bet: number; }) => p.status !== 'folded' && p.bet < newState.currentBet).reduce((prev: number, curr: { bet: number; }) => Math.max(prev, curr.bet), 0)))
//         : newState.bigBlind;

//       const minRaiseAmount = newState.currentBet + Math.max(lastRaiseSize, newState.bigBlind);

//       const requestedRaiseAmount = action.payload.amount;

//       if (requestedRaiseAmount < minRaiseAmount && requestedRaiseAmount < player.stack + player.bet) {
//         console.warn(`Invalid raise amount: ${requestedRaiseAmount}. Minimum is ${minRaiseAmount}`);
//         return state;
//       }

//       const actualRaiseTotal = Math.min(requestedRaiseAmount, player.stack + player.bet);
//       const amountToPutIn = actualRaiseTotal - player.bet;

//       if (amountToPutIn <= 0) return state;

//       player.stack -= amountToPutIn;
//       player.bet = actualRaiseTotal;
//       player.totalBet += amountToPutIn;

//       if (actualRaiseTotal >= minRaiseAmount) {
//         newState.lastRaiserIndex = newState.activePlayerIndex;
//         newState.players.forEach((p: { status: string; hasActedInRound: boolean; }) => { if (p.status !== 'all-in' && p.status !== 'folded') p.hasActedInRound = false });
//       }

//       newState.currentBet = player.bet;
//       newState.actionLog.push(`${player.name} raises to ${actualRaiseTotal}.`);
//       newState.shortActionLog.push(`r${actualRaiseTotal}`);
//       if (player.stack === 0) player.status = 'all-in';
//       return handlePlayerAction(newState);
//     }

//     default:
//       return state;
//   }
// }



// new

// 'use client';
// import type { GameState, Action, Player, Card } from './types';
// import { createDeck, shuffleDeck, dealCards } from './deck';
// import { cardToString, getNextPlayerIndex } from './utils';
// import { findWinners } from './hand-evaluator';
// import { v4 as uuidv4 } from "uuid";


// export const BIG_BLIND_SIZE = 40;
// export const SMALL_BLIND_SIZE = 20;

// export function createInitialState(numPlayers: number): GameState {
//   const players: Player[] = Array.from({ length: numPlayers }, (_, i) => ({
//     id: i,
//     name: `Player ${i + 1}`,
//     stack: 2000,
//     hand: [],
//     bet: 0,
//     totalBet: 0,
//     status: 'playing',
//     isDealer: false,
//     isSmallBlind: false,
//     isBigBlind: false,
//     winnings: 0,
//   }));

//   return {
//     players,
//     deck: [],
//     communityCards: [],
//     pot: 0,
//     stage: 'setup',
//     activePlayerIndex: 0,
//     lastRaiserIndex: null,
//     currentBet: 0,
//     smallBlind: SMALL_BLIND_SIZE,
//     bigBlind: BIG_BLIND_SIZE,
//     actionLog: ['Welcome to Texas Hold\'em! Click Start to begin.'],
//     shortActionLog: [],
//     handId: '',
//     handWinnerDescription: '',
//     handOver: true, // Start in a "handOver" state
//   };
// }

// function startHand(state: GameState, initialPlayers: Player[]): GameState {
//   const newState = { ...createInitialState(initialPlayers.length) };
//   newState.handOver = false;

//   const currentDealerIndex = initialPlayers.findIndex(p => p.isDealer);
//   const nextDealerIndex = getNextPlayerIndex(currentDealerIndex, initialPlayers.length, []);

//   newState.players.forEach((p, i) => {
//     p.name = initialPlayers[i].name;
//     p.stack = initialPlayers[i].stack;
//     p.isDealer = i === nextDealerIndex;
//   });

//   newState.handId = uuidv4() // crypto.randomUUID();


//   // Reset players for new hand
//   newState.players.forEach((p, i) => {
//     p.hand = [];
//     p.bet = 0;
//     p.totalBet = 0;
//     p.status = p.stack > 0 ? 'playing' : 'folded';
//     p.winnings = 0;
//     p.isSmallBlind = false;
//     p.isBigBlind = false;
//     p.bestHand = undefined;
//   });

//   const playersInPlay = newState.players.filter(p => p.stack > 0);
//   if (playersInPlay.length < 2) {
//     newState.actionLog = ['Not enough players with stacks to start a hand.'];
//     newState.handOver = true;
//     return newState;
//   }

//   const foldedPlayersOnInit = newState.players.map(p => p.status === 'folded');

//   const dealerIndex = newState.players.findIndex(p => p.isDealer);
//   const smallBlindIndex = getNextPlayerIndex(dealerIndex, newState.players.length, foldedPlayersOnInit);
//   const bigBlindIndex = getNextPlayerIndex(smallBlindIndex, newState.players.length, foldedPlayersOnInit);

//   const smallBlindPlayer = newState.players[smallBlindIndex];
//   smallBlindPlayer.isSmallBlind = true;
//   const sbAmount = Math.min(newState.smallBlind, smallBlindPlayer.stack);
//   smallBlindPlayer.stack -= sbAmount;
//   smallBlindPlayer.bet = sbAmount;
//   smallBlindPlayer.totalBet = sbAmount;
//   if (smallBlindPlayer.stack === 0) smallBlindPlayer.status = 'all-in';

//   const bigBlindPlayer = newState.players[bigBlindIndex];
//   bigBlindPlayer.isBigBlind = true;
//   const bbAmount = Math.min(newState.bigBlind, bigBlindPlayer.stack);
//   bigBlindPlayer.stack -= bbAmount;
//   bigBlindPlayer.bet = bbAmount;
//   bigBlindPlayer.totalBet = bbAmount;
//   if (bigBlindPlayer.stack === 0) bigBlindPlayer.status = 'all-in';

//   newState.pot = 0;
//   newState.currentBet = newState.bigBlind;
//   newState.stage = 'pre-flop';

//   const deck = shuffleDeck(createDeck());
//   const { hands, newDeck } = dealCards(deck, newState.players.length);
//   newState.players.forEach((p, i) => {
//     if (p.status !== 'folded') p.hand = hands[i] as [Card, Card]
//   });
//   newState.deck = newDeck;

//   const activePlayerIndex = getNextPlayerIndex(bigBlindIndex, newState.players.length, foldedPlayersOnInit);

//   newState.activePlayerIndex = activePlayerIndex;
//   newState.lastRaiserIndex = bigBlindIndex;

//   newState.communityCards = [];
//   newState.actionLog = [`--- New Hand #${newState.handId.substring(0, 8)} ---`];
//   newState.shortActionLog = [];
//   newState.handWinnerDescription = '';

//   const dealerPlayer = newState.players[dealerIndex];
//   newState.actionLog.push(`${dealerPlayer.name} is the dealer.`);
//   newState.actionLog.push(`${smallBlindPlayer.name} posts small blind of ${sbAmount}.`);
//   newState.actionLog.push(`${bigBlindPlayer.name} posts big blind of ${bbAmount}.`);
//   newState.actionLog.push(`--- Dealing Hole Cards ---`);
//   newState.players.forEach(p => {
//     if (p.status !== 'folded') {
//       newState.actionLog.push(`Dealt to ${p.name}: [ ${p.hand.map(cardToString).join(' ')} ]`);
//     }
//   });

//   // if action gets folded to BB, or only BB is left, go to next stage.
//   if (activePlayerIndex === -1) {
//     return advanceStage(newState);
//   }

//   return newState;
// }

// function advanceStage(state: GameState): GameState {
//   const newState = { ...state };

//   const playersStillIn = newState.players.filter(p => p.status !== 'folded');
//   if (playersStillIn.length <= 1) {
//     return endHand(newState);
//   }

//   // Collect bets into pot
//   newState.players.forEach(p => {
//     newState.pot += p.bet;
//     p.bet = 0;
//   });
//   newState.currentBet = 0;

//   if (newState.stage === 'pre-flop') {
//     newState.stage = 'flop';
//     const flop = [newState.deck.pop()!, newState.deck.pop()!, newState.deck.pop()!];
//     newState.communityCards.push(...flop);
//     newState.actionLog.push(`--- Flop --- [ ${flop.map(cardToString).join(' ')} ] (Pot: ${newState.pot})`);
//     newState.shortActionLog.push(`F[${flop.map(cardToString).join('')}]`);
//   } else if (newState.stage === 'flop') {
//     newState.stage = 'turn';
//     const turn = newState.deck.pop()!;
//     newState.communityCards.push(turn);
//     newState.actionLog.push(`--- Turn --- [ ${cardToString(turn)} ] (Pot: ${newState.pot})`);
//     newState.shortActionLog.push(`T[${cardToString(turn)}]`);
//   } else if (newState.stage === 'turn') {
//     newState.stage = 'river';
//     const river = newState.deck.pop()!;
//     newState.communityCards.push(river);
//     newState.actionLog.push(`--- River --- [ ${cardToString(river)} ] (Pot: ${newState.pot})`);
//     newState.shortActionLog.push(`R[${cardToString(river)}]`);
//   } else if (newState.stage === 'river') {
//     return endHand(newState);
//   }

//   const nonActingPlayers = newState.players.map(p => p.status === 'folded' || p.status === 'all-in');

//   const dealerIndex = newState.players.findIndex(p => p.isDealer);
//   const firstPlayerToAct = getNextPlayerIndex(dealerIndex, newState.players.length, nonActingPlayers);

//   newState.activePlayerIndex = firstPlayerToAct;
//   newState.lastRaiserIndex = firstPlayerToAct;
//   newState.players.forEach(p => p.hasActedInRound = false);

//   const playersAbleToBet = newState.players.filter(p => p.status === 'playing' && p.stack > 0);

//   if (playersAbleToBet.length < 2 && playersAbleToBet.length > 0) {
//     // If only one player can bet, they don't need to act. Let's check if there are all-in players.
//     const allInPlayersCount = newState.players.filter(p => p.status === 'all-in').length;
//     if (allInPlayersCount > 0) {
//       // If there's one player who can bet and others are all-in, we just show cards.
//       let tempState = newState;
//       while (tempState.communityCards.length < 5) {
//         tempState = advanceStage(tempState);
//       }
//       return endHand(tempState);
//     }
//   }

//   if (firstPlayerToAct === -1) {
//     let tempState = newState;
//     while (tempState.communityCards.length < 5) {
//       tempState = advanceStage(tempState);
//       if (tempState.handOver) break;
//     }
//     return endHand(tempState);
//   }

//   return newState;
// }


// function endHand(state: GameState): GameState {
//   const newState = { ...state };
//   newState.stage = 'showdown';
//   newState.handOver = true;

//   // Final bet collection
//   newState.players.forEach(p => {
//     newState.pot += p.bet;
//     p.bet = 0;
//   });

//   newState.actionLog.push(`--- Showdown ---`);

//   let activePlayers = newState.players.filter(p => p.status !== 'folded');

//   if (activePlayers.length === 1) {
//     const winner = activePlayers[0];
//     winner.winnings = newState.pot;
//     winner.stack += newState.pot;
//     newState.handWinnerDescription = `${winner.name} wins pot of ${newState.pot}`;
//     newState.actionLog.push(newState.handWinnerDescription);
//   } else {
//     // More complex side pot logic would be needed for a real money game
//     const { winners, bestHand } = findWinners(newState.players, newState.communityCards);
//     const potShare = Math.floor(newState.pot / winners.length);

//     winners.forEach(winner => {
//       winner.winnings = potShare;
//       winner.stack += potShare;
//     });

//     // Handle odd chips
//     let remainder = newState.pot % winners.length;
//     if (remainder > 0) {
//       const dealerIndex = newState.players.findIndex(p => p.isDealer);
//       let currentIdx = getNextPlayerIndex(dealerIndex, newState.players.length, []);
//       while (remainder > 0) {
//         const playerToGetChip = winners.find(w => w.id === newState.players[currentIdx].id);
//         if (playerToGetChip) {
//           playerToGetChip.winnings += 1;
//           playerToGetChip.stack += 1;
//           remainder--;
//         }
//         currentIdx = getNextPlayerIndex(currentIdx, newState.players.length, []);
//       }
//     }

//     const winnerNames = winners.map(w => w.name).join(', ');
//     newState.handWinnerDescription = `${winnerNames} win${winners.length > 1 ? '' : 's'} with ${bestHand.description}`;
//     newState.actionLog.push(newState.handWinnerDescription);
//     newState.actionLog.push(`Winning Hand: ${winners.map(w => `${w.name}: ${w.hand.map(cardToString).join(' ')}`).join('; ')}`);
//   }

//   newState.activePlayerIndex = -1; // No more actions
//   return newState;
// }


// function handlePlayerAction(state: GameState): GameState {
//   let newState = { ...state };
//   const currentPlayer = newState.players[newState.activePlayerIndex];
//   if (currentPlayer) {
//     currentPlayer.hasActedInRound = true;
//   }

//   const playersInHandCount = newState.players.filter(p => p.status !== 'folded').length;
//   if (playersInHandCount <= 1) {
//     return endHand(newState);
//   }

//   const nonActingPlayers = newState.players.map(p => p.status === 'folded' || p.status === 'all-in');

//   // Check if betting round is over.
//   const activePlayers = newState.players.filter(p => p.status !== 'folded');
//   const allActivePlayersHaveActed = activePlayers.every(p => p.hasActedInRound || p.status === 'all-in');
//   const allBetsEqualized = activePlayers.filter(p => p.status !== 'all-in').every(p => p.bet === newState.currentBet);

//   if (allActivePlayersHaveActed && allBetsEqualized) {
//     // Special pre-flop case for the Big Blind
//     if (newState.stage === 'pre-flop' && newState.currentBet === newState.bigBlind) {
//       const bbPlayer = newState.players.find(p => p.isBigBlind);
//       // If action gets to BB and they haven't acted, they get an option.
//       if (bbPlayer && !bbPlayer.hasActedInRound && newState.activePlayerIndex === bbPlayer.id) {
//         // This case should not advance stage, but let the BB act.
//         // After the BB acts, this condition will be re-evaluated and pass.
//       } else {
//         return advanceStage(newState);
//       }
//     } else {
//       return advanceStage(newState);
//     }
//   }

//   // Find next player to act
//   const nextPlayerIndex = getNextPlayerIndex(newState.activePlayerIndex, newState.players.length, nonActingPlayers);

//   const playersAbleToBet = newState.players.filter(p => p.status === 'playing' && p.stack > 0).length;

//   if (playersAbleToBet < 2 && playersInHandCount > 1) {
//     let tempState = newState;
//     while (tempState.communityCards.length < 5) {
//       tempState = advanceStage(tempState);
//       if (tempState.handOver) break;
//     }
//     return endHand(tempState);
//   }

//   if (nextPlayerIndex === -1) {
//     return advanceStage(newState);
//   }

//   newState.activePlayerIndex = nextPlayerIndex;
//   return newState;
// }


// export function gameReducer(state: GameState, action: Action): GameState {
//   if (state.handOver && action.type !== 'START_HAND') {
//     const isSetup = state.stage === 'setup' || state.handOver;
//     if (!isSetup) return state;
//   }

//   if (state.stage === 'setup' && action.type !== 'START_HAND') return state;

//   let newState = JSON.parse(JSON.stringify(state)); // Deep copy for safety
//   const player = newState.players[newState.activePlayerIndex];

//   if (!player && action.type !== 'START_HAND') {
//     return state;
//   }

//   switch (action.type) {
//     case 'START_HAND':
//       return startHand(state, action.payload.players);

//     case 'FOLD':
//       player.status = 'folded';
//       newState.actionLog.push(`${player.name} folds.`);
//       newState.shortActionLog.push('f');
//       return handlePlayerAction(newState);

//     case 'CHECK':
//       if (newState.currentBet > player.bet) return state; // Invalid action
//       newState.actionLog.push(`${player.name} checks.`);
//       newState.shortActionLog.push('x');
//       return handlePlayerAction(newState);

//     case 'CALL': {
//       const callAmount = Math.min(newState.currentBet - player.bet, player.stack);
//       if (callAmount <= 0) {
//         if (player.bet === newState.currentBet && newState.currentBet > 0) {
//           return state; // Already called
//         }
//         // This is a check
//         if (newState.currentBet === 0 || (newState.stage === 'pre-flop' && player.isBigBlind && newState.currentBet === player.bet)) {
//           newState.actionLog.push(`${player.name} checks.`);
//           newState.shortActionLog.push('x');
//           return handlePlayerAction(newState);
//         }
//         return state;
//       }
//       player.stack -= callAmount;
//       player.bet += callAmount;
//       player.totalBet += callAmount;
//       newState.actionLog.push(`${player.name} calls ${callAmount}.`);
//       newState.shortActionLog.push('c');
//       if (player.stack === 0) {
//         player.status = 'all-in';
//       }
//       return handlePlayerAction(newState);
//     }

//     case 'BET': {
//       if (newState.currentBet > 0) return state; // Cannot bet if there's already a bet
//       const betAmount = Math.min(action.payload.amount, player.stack);
//       if (betAmount <= 0) return state;
//       player.stack -= betAmount;
//       player.bet += betAmount;
//       player.totalBet += betAmount;
//       newState.currentBet = player.bet;
//       newState.lastRaiserIndex = newState.activePlayerIndex;
//       newState.actionLog.push(`${player.name} bets ${betAmount}.`);
//       newState.shortActionLog.push(`b${betAmount}`);
//       if (player.stack === 0) player.status = 'all-in';
//       return handlePlayerAction(newState);
//     }

//     case 'RAISE': {
//       if (player.stack === 0) return state;

//       const lastRaiseSize = newState.currentBet > 0
//         ? (newState.currentBet - (newState.players.filter((p: { status: string; bet: number; }) => p.status !== 'folded' && p.bet < newState.currentBet).reduce((prev: number, curr: { bet: number; }) => Math.max(prev, curr.bet), 0)))
//         : newState.bigBlind;

//       const minRaiseAmount = newState.currentBet + Math.max(lastRaiseSize, newState.bigBlind);

//       const requestedRaiseAmount = action.payload.amount;

//       if (requestedRaiseAmount < minRaiseAmount && requestedRaiseAmount < player.stack + player.bet) {
//         console.warn(`Invalid raise amount: ${requestedRaiseAmount}. Minimum is ${minRaiseAmount}`);
//         return state;
//       }

//       const actualRaiseTotal = Math.min(requestedRaiseAmount, player.stack + player.bet);
//       const amountToPutIn = actualRaiseTotal - player.bet;

//       if (amountToPutIn <= 0) return state;

//       player.stack -= amountToPutIn;
//       player.bet = actualRaiseTotal;
//       player.totalBet += amountToPutIn;

//       if (actualRaiseTotal >= minRaiseAmount) {
//         newState.lastRaiserIndex = newState.activePlayerIndex;
//         newState.players.forEach((p: { status: string; hasActedInRound: boolean; }) => { if (p.status !== 'all-in' && p.status !== 'folded') p.hasActedInRound = false });
//       }

//       newState.currentBet = player.bet;
//       newState.actionLog.push(`${player.name} raises to ${actualRaiseTotal}.`);
//       newState.shortActionLog.push(`r${actualRaiseTotal}`);
//       if (player.stack === 0) player.status = 'all-in';
//       return handlePlayerAction(newState);
//     }

//     default:
//       return state;
//   }
// }

