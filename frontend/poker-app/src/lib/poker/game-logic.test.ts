import { gameReducer, createInitialState } from './game-logic';
import type { GameState, Player, Action, Card } from './types';

// Mock the uuid package to return a predictable ID
jest.mock('uuid', () => ({
    v4: () => 'test-hand-id',
}));


describe('gameReducer winner calculation', () => {

    test('should correctly award pot to the winner in a simple all-in showdown', () => {
        let state = createInitialState(2);

        // --- Provide a GameState ---
        state.stage = 'river';
        state.pot = 0;
        state.communityCards = [
            { rank: '2', suit: 'h' }, { rank: '7', suit: 'd' }, { rank: 'J', suit: 'c' },
            { rank: 'Q', suit: 'h' }, { rank: '4', suit: 's' },
        ] as Card[];

        // Player 1 (Winner)
        state.players[0].hand = [{ rank: 'A', suit: 's' }, { rank: 'A', suit: 'c' }] as [Card, Card];
        state.players[0].totalBet = 2000;
        state.players[0].stack = 0;
        state.players[0].status = 'all-in';

        // Player 2 (Loser)
        state.players[1].hand = [{ rank: 'K', suit: 's' }, { rank: 'K', suit: 'c' }] as [Card, Card];
        state.players[1].totalBet = 2000;
        state.players[1].stack = 0;
        state.players[1].status = 'all-in';

        // Manually set the pot for simplicity
        state.pot = state.players[0].totalBet + state.players[1].totalBet;

        // --- Ask who won and what the winnings are ---
        const finalState = gameReducer(state, { type: 'CALL' }); // Any action to trigger the endHand logic

        const winner = finalState.players.find(p => p.name === 'Player 1');

        // --- Assertions ---
        expect(winner?.winnings).toBe(4000);
        expect(finalState.handWinnerDescription).toContain('Player 1 wins a pot of 4000');
    });

    test('should handle a multi-way all-in with a side pot', () => {
        let state = createInitialState(3);

        // --- Provide a GameState ---
        state.stage = 'river';
        state.pot = 0;
        state.communityCards = [
            { rank: '2', suit: 'h' }, { rank: '3', suit: 'd' }, { rank: '4', suit: 'c' },
            { rank: '7', suit: 'h' }, { rank: '8', suit: 's' },
        ] as Card[];

        // Player 1 (Short stack, wins main pot)
        state.players[0].hand = [{ rank: 'A', suit: 's' }, { rank: 'A', suit: 'c' }] as [Card, Card];
        state.players[0].totalBet = 500;
        state.players[0].stack = 0;
        state.players[0].status = 'all-in';

        // Player 2 (Medium stack, wins side pot)
        state.players[1].hand = [{ rank: 'K', suit: 's' }, { rank: 'K', suit: 'c' }] as [Card, Card];
        state.players[1].totalBet = 1000;
        state.players[1].stack = 0;
        state.players[1].status = 'all-in';

        // Player 3 (Big stack, loses)
        state.players[2].hand = [{ rank: 'Q', suit: 's' }, { rank: 'Q', suit: 'c' }] as [Card, Card];
        state.players[2].totalBet = 1000;
        state.players[2].stack = 1000;
        state.players[2].status = 'all-in';

        // Manually set pot
        state.pot = state.players.reduce((sum, p) => sum + p.totalBet, 0); // 500 + 1000 + 1000 = 2500

        // --- Ask who won and what the winnings are ---
        const finalState = gameReducer(state, { type: 'CALL' });

        const p1 = finalState.players.find(p => p.name === 'Player 1');
        const p2 = finalState.players.find(p => p.name === 'Player 2');
        const p3 = finalState.players.find(p => p.name === 'Player 3');

        // --- Assertions ---
        // Main Pot: 500*3 = 1500, won by Player 1
        expect(p1?.winnings).toBe(1500);

        // Side Pot: 500*2 = 1000, won by Player 2
        expect(p2?.winnings).toBe(1000);

        // Player 3 loses
        expect(p3?.winnings).toBe(0);
    });

});
