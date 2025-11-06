'use client';
export const SUITS = ['s', 'c', 'h', 'd'] as const;
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;

export type Suit = typeof SUITS[number];
export type Rank = typeof RANKS[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type Hand = [Card, Card] | [];

export interface Player {
  // lastAction: string;
  id: number;
  name: string;
  stack: number;
  hand: Hand;
  bet: number;
  totalBet: number; // Total bet in the current hand across all rounds
  status: 'playing' | 'folded' | 'all-in' | 'out';
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  winnings: number;
  bestHand?: HandEvaluation;
  hasActedInRound?: boolean;
}

export type GameStage = 'setup' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface GameState {
  players: Player[];
  deck: Card[];
  communityCards: Card[];
  pot: number;
  stage: GameStage;
  activePlayerIndex: number;
  lastRaiserIndex: number | null;
  currentBet: number;
  smallBlind: number;
  bigBlind: number;
  actionLog: string[];
  shortActionLog: string[];
  handId: string;
  handWinnerDescription: string;
  handOver: boolean;
}

export type Action =
  | { type: 'START_HAND'; payload: { players: Player[] } }
  | { type: 'FOLD' }
  | { type: 'CHECK' }
  | { type: 'CALL' }
  | { type: 'BET'; payload: { amount: number } }
  | { type: 'RAISE'; payload: { amount: number } };

export const HAND_RANKS = [
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
  'Five of a Kind', // Though not possible in this variant
] as const;

export type HandRank = typeof HAND_RANKS[number];

export interface HandEvaluation {
  rank: HandRank;
  rankValue: number;
  handValues: number[];
  handCards: Card[];
  description: string;
}

export interface HandHistoryPlayerState {
  id: string;
  name: string;
  stack: number;
  cards: string; // Corrected: should be a single string like "AsKd"
  winnings: number;
}

export interface HandHistoryEntry {
  id: string;
  dealer: string;
  smallBlind: string;
  bigBlind: string;
  players: HandHistoryPlayerState[];
  actions: string[];
  communityCards: string[];
  finalPot: number;
}
