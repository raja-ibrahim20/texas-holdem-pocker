import type { Card } from './types';

export function cardToString(card: Card): string {
  if (!card) return '';
  return `${card.rank}${card.suit}`;
}

export function getNextPlayerIndex(
  currentIndex: number,
  numPlayers: number,
  foldedPlayers: boolean[],
  allInPlayers?: boolean[]
): number {
  let nextIndex = (currentIndex + 1) % numPlayers;
  while (foldedPlayers[nextIndex] || (allInPlayers && allInPlayers[nextIndex])) {
    if (nextIndex === currentIndex) return -1; // All other players are folded/all-in
    nextIndex = (nextIndex + 1) % numPlayers;
  }
  return nextIndex;
}

export const SUIT_SYMBOLS: Record<string, string> = {
  s: '♠',
  d: '♦',
  c: '♣',
  h: '♥',
};

export const SUIT_COLORS: Record<string, string> = {
  s: 'text-foreground',
  d: 'text-blue-500',
  c: 'text-green-500',
  h: 'text-red-500',
};
