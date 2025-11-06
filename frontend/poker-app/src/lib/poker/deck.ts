import type { Card, Suit, Rank } from './types';
import { SUITS, RANKS } from './types';

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCards(deck: Card[], numPlayers: number): { hands: Card[][]; newDeck: Card[] } {
  const deckCopy = [...deck];
  const hands: Card[][] = Array(numPlayers).fill(0).map(() => []);
  
  // Deal two cards to each player
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < numPlayers; j++) {
      const card = deckCopy.pop();
      if (card) {
        hands[j].push(card);
      }
    }
  }
  
  return { hands, newDeck: deckCopy };
}
