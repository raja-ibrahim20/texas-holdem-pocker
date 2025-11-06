'use client';
import { useReducer, useEffect, useState, useMemo } from 'react';
import { gameReducer, createInitialState } from '@/lib/poker/game-logic';
import type { HandHistoryEntry, Player as PlayerType, GameState } from '@/lib/poker/types';
import Player from './player';
import Board from './board';
import Controls from './controls';
import ActionLog from './action-log';
import HandHistory from './hand-history';
import SetupControls from './setup-controls';
import { cardToString } from '@/lib/poker/utils';
import { useToast } from '@/hooks/use-toast';

const NUM_PLAYERS = 6;

const PokerTable = () => {
  const [initialPlayers, setInitialPlayers] = useState<PlayerType[]>(() => createInitialState(NUM_PLAYERS).players);

  const memoizedInitialState = useMemo(() => {
    const state = createInitialState(NUM_PLAYERS);
    state.players = initialPlayers;
    if (!state.players.some(p => p.isDealer)) {
      state.players[0].isDealer = true;
    }
    return state;
  }, [initialPlayers]);

  const [state, dispatch] = useReducer(gameReducer, memoizedInitialState);
  const [handHistories, setHandHistories] = useState<HandHistoryEntry[]>([]);
  const [lastSavedHandId, setLastSavedHandId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    async function fetchHistory() {
      const response = await fetch('/api/hands');
      const data: HandHistoryEntry[] = await response.json();
      setHandHistories(data);

      if (data.length > 0) {
        const lastHand = data[data.length - 1];
        setInitialPlayers(prevPlayers => {
          return prevPlayers.map(player => {
            const historyPlayer = lastHand.players.find(p => p.name === player.name);
            if (historyPlayer) {
              return {
                ...player,
                stack: historyPlayer.stack + historyPlayer.winnings
              };
            }
            return player;
          });
        });
      }
    }
    fetchHistory();
  }, []);

  useEffect(() => {
    // This effect should only run when a hand is over and it hasn't been saved yet.
    if (state.handOver && state.stage === 'showdown' && state.handId && state.handId !== lastSavedHandId) {

      // Create the history entry from the final state
      const entry: HandHistoryEntry = {
        id: state.handId,
        dealer: state.players.find(p => p.isDealer)?.name ?? '',
        smallBlind: state.players.find(p => p.isSmallBlind)?.name ?? '',
        bigBlind: state.players.find(p => p.isBigBlind)?.name ?? '',
        players: state.players.map(p => ({
          id: p.id.toString(),
          name: p.name,
          stack: initialPlayers.find(v => v.id == p.id)?.stack ?? 0, // p.stack, // + p.totalBet - p.winnings,
          cards: p.hand.map(cardToString).join(''), // Join cards into a single string
          winnings: p.winnings - p.totalBet
        })),
        actions: state.shortActionLog,
        communityCards: state.communityCards.map(cardToString),
        finalPot: state.pot,
      };

      const saveHand = async () => {
        try {
          await fetch('/api/hands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry),
          });
          // After successful save, update the local state
          setHandHistories(prev => [...prev, entry]);
          setLastSavedHandId(state.handId);
        } catch (error) {
          console.error("Failed to save hand history:", error);
        }
      };

      saveHand();
    }
  }, [state.handOver, state.stage, state.handId, lastSavedHandId, state.players, state.pot, state.shortActionLog, state.communityCards]);

  const handleStart = (players: PlayerType[]) => {
    if (players.some(p => p.stack === 0)) {
      toast({
        variant: "destructive",
        title: "Cannot Start Hand",
        description: "A player with an empty stack cannot participate. Please reset the stack.",
      })
      return;
    }
    // Update the player stacks and dealer position from the setup controls
    setInitialPlayers(players);
    dispatch({ type: 'START_HAND', payload: { players } });
  };

  const playerPositions = [
    { top: '50%', left: '0', transform: 'translateY(-50%)' }, // Player 5 (left)
    { top: '0', left: '25%', transform: 'translateX(-50%)' }, // Player 6 (top-left)
    { top: '0', left: '75%', transform: 'translateX(-50%)' }, // Player 1 (top-right)
    { top: '50%', right: '0', transform: 'translateY(-50%)' }, // Player 2 (right)
    { bottom: '0', right: '25%', transform: 'translateX(50%)' }, // Player 3 (bottom-right)
    { bottom: '0', left: '25%', transform: 'translateX(-50%)' }, // Player 4 (bottom-left) -> user
  ];

  const mappedPlayers = [4, 5, 0, 1, 2, 3];

  const currentPot = useMemo(() => {
    return (state.pot || 0) + (state.players?.reduce((acc, p) => acc + (p.bet || 0), 0) || 0)
  }, [state.pot, state.players]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_2.5fr_1fr] gap-4 max-w-screen-2xl mx-auto">
      <ActionLog log={state.actionLog} />

      <div className="flex flex-col gap-4">
        <SetupControls players={initialPlayers} onStart={handleStart} handOver={state.handOver} />
        <div className="relative aspect-[16/10] bg-primary/20 border-2 border-primary/50 rounded-full p-8 flex items-center justify-center">
          <div className="absolute w-[75%] h-[75%] border-2 border-dashed border-primary/50 rounded-full"></div>
          {state.players.map((player, index) => {
            const posIndex = mappedPlayers.indexOf(index);
            return (
              <div key={player.id} className="absolute" style={playerPositions[posIndex]}>
                <Player
                  player={player}
                  isActive={state.activePlayerIndex === player.id && state.stage !== 'showdown'}
                />
              </div>
            );
          })}

          <Board
            cards={state.communityCards}
            pot={currentPot}
            stage={state.stage}
            winnerDescription={state.handWinnerDescription}
          />
        </div>
        <Controls state={state} dispatch={dispatch} />
      </div>

      <HandHistory histories={handHistories} />
    </div>
  );
};

export default PokerTable;


// 'use client';
// import { useReducer, useEffect, useState, useMemo } from 'react';
// import { gameReducer, createInitialState } from '@/lib/poker/game-logic';
// import type { HandHistoryEntry, Player as PlayerType, GameState } from '@/lib/poker/types';
// import Player from './player';
// import Board from './board';
// import Controls from './controls';
// import ActionLog from './action-log';
// import HandHistory from './hand-history';
// import SetupControls from './setup-controls';
// import { cardToString } from '@/lib/poker/utils';

// const NUM_PLAYERS = 6;

// const PokerTable = () => {
//   const [initialPlayers, setInitialPlayers] = useState<PlayerType[]>(() => createInitialState(NUM_PLAYERS).players);

//   const memoizedInitialState = useMemo(() => {
//     const state = createInitialState(NUM_PLAYERS);
//     state.players = initialPlayers;
//     if (!state.players.some(p => p.isDealer)) {
//       state.players[0].isDealer = true;
//     }
//     return state;
//   }, [initialPlayers]);

//   const [state, dispatch] = useReducer(gameReducer, memoizedInitialState);
//   const [handHistories, setHandHistories] = useState<HandHistoryEntry[]>([]);
//   const [lastSavedHandId, setLastSavedHandId] = useState<string | null>(null);

//   useEffect(() => {
//     async function fetchHistory() {
//       const response = await fetch('/api/hands');
//       const data: HandHistoryEntry[] = await response.json();
//       setHandHistories(data);

//       if (data.length > 0) {
//         const lastHand = data[0];
//         console.log(`Last hand fetched: ${lastHand}`);
//         setInitialPlayers(prevPlayers => {
//           return prevPlayers.map(player => {
//             const historyPlayer = lastHand.players.find(p => p.name === player.name);
//             if (historyPlayer) {
//               return {
//                 ...player,
//                 stack: historyPlayer.stack + historyPlayer.winnings
//               };
//             }
//             return player;
//           });
//         });
//       }
//     }
//     fetchHistory();
//   }, []);

//   useEffect(() => {
//     // This effect should only run when a hand is over and it hasn't been saved yet.
//     if (state.handOver && state.handId && state.handId !== lastSavedHandId) {

//       // Create the history entry from the final state
//       const entry: HandHistoryEntry = {
//         id: state.handId,
//         dealer: state.players.find(p => p.isDealer)?.name ?? '',
//         smallBlind: state.players.find(p => p.isSmallBlind)?.name ?? '',
//         bigBlind: state.players.find(p => p.isBigBlind)?.name ?? '',
//         players: state.players.map(p => ({
//           id: p.id.toString(),
//           name: p.name,
//           stack: initialPlayers.find(v => v.id == p.id)?.stack ?? 0, // p.stack, // + p.totalBet - p.winnings,
//           cards: p.hand.map(cardToString).join(''), // Join cards into a single string
//           winnings: p.winnings - p.totalBet
//         })),
//         actions: state.shortActionLog,
//         communityCards: state.communityCards.map(cardToString),
//         finalPot: state.pot,
//       };

//       const saveHand = async () => {
//         try {
//           await fetch('/api/hands', {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify(entry),
//           });
//           // After successful save, update the local state
//           setHandHistories(prev => [entry, ...prev]);
//           setLastSavedHandId(state.handId);
//           setInitialPlayers(prevPlayers => {
//             return prevPlayers.map(player => {
//               const historyPlayer = entry.players.find(p => p.name === player.name);
//               if (historyPlayer) {
//                 return {
//                   ...player,
//                   stack: historyPlayer.stack + historyPlayer.winnings
//                 };
//               }
//               return player;
//             });
//           });
//         } catch (error) {
//           console.error("Failed to save hand history:", error);
//         }
//       };

//       saveHand();
//     }
//   }, [state.handOver, state.handId]);

//   const handleStart = (players: PlayerType[]) => {
//     // Update the player stacks and dealer position from the setup controls
//     setInitialPlayers(players);
//     dispatch({ type: 'START_HAND', payload: { players } });
//   };

//   const playerPositions = [
//     { top: '50%', left: '0', transform: 'translateY(-50%)' }, // Player 5 (left)
//     { top: '0', left: '25%', transform: 'translateX(-50%)' }, // Player 6 (top-left)
//     { top: '0', left: '75%', transform: 'translateX(-50%)' }, // Player 1 (top-right)
//     { top: '50%', right: '0', transform: 'translateY(-50%)' }, // Player 2 (right)
//     { bottom: '0', right: '25%', transform: 'translateX(50%)' }, // Player 3 (bottom-right)
//     { bottom: '0', left: '25%', transform: 'translateX(-50%)' }, // Player 4 (bottom-left) -> user
//   ];

//   const mappedPlayers = [4, 5, 0, 1, 2, 3];

//   const currentPot = useMemo(() => {
//     return state.pot + state.players.reduce((acc, p) => acc + p.bet, 0)
//   }, [state.pot, state.players]);

//   return (
//     <div className="grid grid-cols-1 lg:grid-cols-[1fr_2.5fr_1fr] gap-4 max-w-screen-2xl mx-auto">
//       <ActionLog log={state.actionLog} />

//       <div className="flex flex-col gap-4">
//         <SetupControls players={initialPlayers} onStart={handleStart} handOver={state.handOver} />
//         <div className="relative aspect-[16/10] bg-primary/20 border-2 border-primary/50 rounded-full p-8 flex items-center justify-center">
//           <div className="absolute w-[75%] h-[75%] border-2 border-dashed border-primary/50 rounded-full"></div>
//           {state.players.map((player, index) => {
//             const posIndex = mappedPlayers.indexOf(index);
//             return (
//               <div key={player.id} className="absolute" style={playerPositions[posIndex]}>
//                 <Player
//                   player={player}
//                   isActive={state.activePlayerIndex === player.id && state.stage !== 'showdown'}
//                 />
//               </div>
//             );
//           })}

//           <Board
//             cards={state.communityCards}
//             pot={currentPot}
//             stage={state.stage}
//             winnerDescription={state.handWinnerDescription}
//           />
//         </div>
//         <Controls state={state} dispatch={dispatch} />
//       </div>

//       <HandHistory histories={handHistories} />
//     </div>
//   );
// };

// export default PokerTable;


// 'use client';
// import { useReducer, useEffect, useState, useMemo } from 'react';
// import { gameReducer, createInitialState } from '@/lib/poker/game-logic';
// import type { HandHistoryEntry, Player as PlayerType, GameState } from '@/lib/poker/types';
// import Player from './player';
// import Board from './board';
// import Controls from './controls';
// import ActionLog from './action-log';
// import HandHistory from './hand-history';
// import SetupControls from './setup-controls';
// import { cardToString } from '@/lib/poker/utils';

// const NUM_PLAYERS = 6;

// const PokerTable = () => {
//   const [initialPlayers, setInitialPlayers] = useState<PlayerType[]>(() => createInitialState(NUM_PLAYERS).players);

//   const memoizedInitialState = useMemo(() => {
//     const state = createInitialState(NUM_PLAYERS);
//     state.players = initialPlayers.map((p, i) => ({
//       ...p,
//       isDealer: initialPlayers[i].isDealer,
//     }));
//     if (!state.players.some(p => p.isDealer)) {
//       state.players[0].isDealer = true;
//     }
//     return state;
//   }, [initialPlayers]);

//   const [state, dispatch] = useReducer(gameReducer, memoizedInitialState);
//   const [handHistories, setHandHistories] = useState<HandHistoryEntry[]>([]);
//   const [lastSavedHandId, setLastSavedHandId] = useState<string | null>(null);

//   useEffect(() => {
//     async function fetchHistory() {
//       const response = await fetch('/api/hands');
//       const data = await response.json();
//       setHandHistories(data);
//     }
//     fetchHistory();
//   }, []);

//   useEffect(() => {
//     // This effect should only run when a hand is over and it hasn't been saved yet.
//     if (state.handOver && state.handId && state.handId !== lastSavedHandId) {

//       // Create the history entry from the final state
//       const entry: HandHistoryEntry = {
//         id: state.handId,
//         dealer: state.players.find(p => p.isDealer)?.name ?? '',
//         smallBlind: state.players.find(p => p.isSmallBlind)?.name ?? '',
//         bigBlind: state.players.find(p => p.isBigBlind)?.name ?? '',
//         players: state.players.map(p => ({
//           id: p.id.toString(),
//           name: p.name,
//           stack: p.stack + p.totalBet - p.winnings,
//           cards: p.hand.map(cardToString).join(''), // Join cards into a single string
//           winnings: p.winnings - p.totalBet
//         })),
//         actions: state.shortActionLog,
//         communityCards: state.communityCards.map(cardToString),
//         finalPot: state.pot,
//       };

//       const saveHand = async () => {
//         try {
//           await fetch('/api/hands', {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify(entry),
//           });
//           // After successful save, update the local state
//           setHandHistories(prev => [...prev, entry]);
//           setLastSavedHandId(state.handId);
//         } catch (error) {
//           console.error("Failed to save hand history:", error);
//         }
//       };

//       saveHand();
//     }
//   }, [state.handOver, state.handId, lastSavedHandId, state.pot, state.players, state.communityCards, state.shortActionLog]);

//   const handleStart = (players: PlayerType[]) => {
//     // Update the player stacks and dealer position from the *last* hand state
//     // before starting the new one.
//     const updatedPlayers = players.map(p => {
//       const finalPlayerState = state.players.find(fp => fp.id === p.id);
//       return {
//         ...p,
//         stack: finalPlayerState?.stack ?? p.stack,
//       };
//     });
//     const lastDealerIndex = state.players.findIndex(p => p.isDealer);
//     updatedPlayers.forEach((p, i) => {
//       p.isDealer = i === lastDealerIndex;
//     });

//     setInitialPlayers(updatedPlayers);
//     dispatch({ type: 'START_HAND', payload: { players: updatedPlayers } });
//   };

//   const playerPositions = [
//     { top: '50%', left: '0', transform: 'translateY(-50%)' }, // Player 5 (left)
//     { top: '0', left: '25%', transform: 'translateX(-50%)' }, // Player 6 (top-left)
//     { top: '0', left: '75%', transform: 'translateX(-50%)' }, // Player 1 (top-right)
//     { top: '50%', right: '0', transform: 'translateY(-50%)' }, // Player 2 (right)
//     { bottom: '0', right: '25%', transform: 'translateX(50%)' }, // Player 3 (bottom-right)
//     { bottom: '0', left: '25%', transform: 'translateX(-50%)' }, // Player 4 (bottom-left) -> user
//   ];

//   const mappedPlayers = [4, 5, 0, 1, 2, 3];

//   const currentPot = useMemo(() => {
//     return state.pot + state.players.reduce((acc, p) => acc + p.bet, 0)
//   }, [state.pot, state.players]);

//   return (
//     <div className="grid grid-cols-1 lg:grid-cols-[1fr_2.5fr_1fr] gap-4 max-w-screen-2xl mx-auto">
//       <ActionLog log={state.actionLog} />

//       <div className="flex flex-col gap-4">
//         <SetupControls players={state.handOver ? state.players : initialPlayers} onStart={handleStart} handOver={state.handOver} />
//         <div className="relative aspect-[16/10] bg-primary/20 border-2 border-primary/50 rounded-full p-8 flex items-center justify-center">
//           <div className="absolute w-[75%] h-[75%] border-2 border-dashed border-primary/50 rounded-full"></div>
//           {state.players.map((player, index) => {
//             const posIndex = mappedPlayers.indexOf(index);
//             return (
//               <div key={player.id} className="absolute" style={playerPositions[posIndex]}>
//                 <Player
//                   player={player}
//                   isActive={state.activePlayerIndex === player.id && state.stage !== 'showdown'}
//                 />
//               </div>
//             );
//           })}

//           <Board
//             cards={state.communityCards}
//             pot={currentPot}
//             stage={state.stage}
//             winnerDescription={state.handWinnerDescription}
//           />
//         </div>
//         <Controls state={state} dispatch={dispatch} />
//       </div>

//       <HandHistory histories={handHistories} />
//     </div>
//   );
// };

// export default PokerTable;

// 'use client';
// import { useReducer, useEffect, useState, useMemo } from 'react';
// import { gameReducer, createInitialState } from '@/lib/poker/game-logic';
// import type { HandHistoryEntry, Player as PlayerType, GameState } from '@/lib/poker/types';
// import Player from './player';
// import Board from './board';
// import Controls from './controls';
// import ActionLog from './action-log';
// import HandHistory from './hand-history';
// import SetupControls from './setup-controls';
// import { cardToString } from '@/lib/poker/utils';

// const NUM_PLAYERS = 6;

// const PokerTable = () => {
//   const [initialPlayers, setInitialPlayers] = useState<PlayerType[]>(() => createInitialState(NUM_PLAYERS).players);

//   const memoizedInitialState = useMemo(() => {
//     const state = createInitialState(NUM_PLAYERS);
//     state.players = initialPlayers.map((p, i) => ({
//       ...p,
//       isDealer: initialPlayers[i].isDealer,
//     }));
//     if (!state.players.some(p => p.isDealer)) {
//       state.players[0].isDealer = true;
//     }
//     return state;
//   }, [initialPlayers]);

//   const [state, dispatch] = useReducer(gameReducer, memoizedInitialState);
//   const [handHistories, setHandHistories] = useState<HandHistoryEntry[]>([]);


//   useEffect(() => {
//     async function fetchHistory() {
//       const response = await fetch('/api/hands');
//       const data = await response.json();
//       setHandHistories(data);
//     }
//     fetchHistory();
//   }, []);

//   useEffect(() => {
//     if (state.handOver && state.handId) {
//       const lastDealerIndex = state.players.findIndex(p => p.isDealer);

//       setInitialPlayers(currentPlayers => {
//         return currentPlayers.map((p, i) => {
//           const finalPlayerState = state.players.find(fp => fp.id === p.id);
//           return {
//             ...p,
//             stack: finalPlayerState?.stack ?? p.stack,
//             isDealer: i === lastDealerIndex
//           };
//         });
//       });

//       // Hand is over, save to history
//       const entry: HandHistoryEntry = {
//         id: state.handId,
//         dealer: state.players.find(p => p.isDealer)?.name ?? '',
//         smallBlind: state.players.find(p => p.isSmallBlind)?.name ?? '',
//         bigBlind: state.players.find(p => p.isBigBlind)?.name ?? '',
//         players: state.players.map(p => ({
//           name: p.name,
//           stack: p.stack + p.totalBet - p.winnings,
//           cards: p.hand.map(cardToString).join(''), // Join cards into a single string
//           winnings: p.winnings - p.totalBet
//         })),
//         actions: state.shortActionLog,
//         communityCards: state.communityCards.map(cardToString),
//         finalPot: state.pot,
//       };

//       const saveHand = async () => {
//         try {
//           await fetch('/api/hands', {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify(entry),
//           });
//           const response = await fetch('/api/hands');
//           const data = await response.json();
//           setHandHistories(data);
//         } catch (error) {
//           console.error("Failed to save hand history:", error);
//         }
//       };

//       if (state.handId && !handHistories.some(h => h.id === state.handId)) {
//         saveHand();
//       }
//     }
//   }, [state.handOver, state.handId, state.players, state.shortActionLog, state.communityCards, state.pot, handHistories]);

//   const handleStart = (players: PlayerType[]) => {
//     setInitialPlayers(players);
//     dispatch({ type: 'START_HAND', payload: { players: players } });
//   };

//   const playerPositions = [
//     { top: '50%', left: '0', transform: 'translateY(-50%)' }, // Player 5 (left)
//     { top: '0', left: '25%', transform: 'translateX(-50%)' }, // Player 6 (top-left)
//     { top: '0', left: '75%', transform: 'translateX(-50%)' }, // Player 1 (top-right)
//     { top: '50%', right: '0', transform: 'translateY(-50%)' }, // Player 2 (right)
//     { bottom: '0', right: '25%', transform: 'translateX(50%)' }, // Player 3 (bottom-right)
//     { bottom: '0', left: '25%', transform: 'translateX(-50%)' }, // Player 4 (bottom-left) -> user
//   ];

//   const mappedPlayers = [4, 5, 0, 1, 2, 3];

//   const currentPot = useMemo(() => {
//     return state.pot + state.players.reduce((acc, p) => acc + p.bet, 0)
//   }, [state.pot, state.players]);

//   return (
//     <div className="grid grid-cols-1 lg:grid-cols-[1fr_2.5fr_1fr] gap-4 max-w-screen-2xl mx-auto">
//       <ActionLog log={state.actionLog} />

//       <div className="flex flex-col gap-4">
//         <SetupControls players={initialPlayers} onStart={handleStart} handOver={state.handOver} />
//         <div className="relative aspect-[16/10] bg-primary/20 border-2 border-primary/50 rounded-full p-8 flex items-center justify-center">
//           <div className="absolute w-[75%] h-[75%] border-2 border-dashed border-primary/50 rounded-full"></div>
//           {state.players.map((player, index) => {
//             const posIndex = mappedPlayers.indexOf(index);
//             return (
//               <div key={player.id} className="absolute" style={playerPositions[posIndex]}>
//                 <Player
//                   player={player}
//                   isActive={state.activePlayerIndex === player.id && state.stage !== 'showdown'}
//                 />
//               </div>
//             );
//           })}

//           <Board
//             cards={state.communityCards}
//             pot={currentPot}
//             stage={state.stage}
//             winnerDescription={state.handWinnerDescription}
//           />
//         </div>
//         <Controls state={state} dispatch={dispatch} />
//       </div>

//       <HandHistory histories={handHistories} />
//     </div>
//   );
// };

// export default PokerTable;
