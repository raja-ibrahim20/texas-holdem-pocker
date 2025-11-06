import type { Card, HandEvaluation, HandRank } from './types';
import { RANKS, HAND_RANKS } from './types';

const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

function getRankValue(card: Card): number {
  return RANK_VALUES[card.rank];
}

function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => getRankValue(b) - getRankValue(a));
}

function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];

  const [first, ...rest] = arr;
  const combsWithFirst = getCombinations(rest, k - 1).map(comb => [first, ...comb]);
  const combsWithoutFirst = getCombinations(rest, k);

  return [...combsWithFirst, ...combsWithoutFirst];
}

function evaluate5CardHand(hand: Card[]): HandEvaluation {
  const sortedHand = sortCards(hand);
  const values = sortedHand.map(getRankValue);
  const suits = sortedHand.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = values.every((v, i) => i === 0 || v === values[i - 1] - 1) ||
                     ([14, 5, 4, 3, 2].every(v => values.includes(v))); // Ace-low straight

  const rankCounts: { [key: number]: number } = {};
  values.forEach(v => {
    rankCounts[v] = (rankCounts[v] || 0) + 1;
  });
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const rankKeys = Object.keys(rankCounts).map(Number).sort((a, b) => b - a);

  // Tie-breaking sorted ranks
  const sortedRankKeysByCount = rankKeys.sort((a, b) => {
    if (rankCounts[a] !== rankCounts[b]) {
      return rankCounts[b] - rankCounts[a];
    }
    return b - a;
  });

  if (isStraight && isFlush) {
    const handValues = values[0] === 14 && values[4] === 2 ? [5] : [values[0]];
    return {
      rank: 'Straight Flush', rankValue: 8, handValues, handCards: sortedHand,
      description: `Straight Flush, ${RANKS[handValues[0]-2]}-high`
    };
  }

  if (counts[0] === 4) {
    return {
      rank: 'Four of a Kind', rankValue: 7, handValues: sortedRankKeysByCount, handCards: sortedHand,
      description: `Four of a Kind, ${RANKS[sortedRankKeysByCount[0]-2]}s`
    };
  }

  if (counts[0] === 3 && counts[1] === 2) {
    return {
      rank: 'Full House', rankValue: 6, handValues: sortedRankKeysByCount, handCards: sortedHand,
      description: `Full House, ${RANKS[sortedRankKeysByCount[0]-2]}s full of ${RANKS[sortedRankKeysByCount[1]-2]}s`
    };
  }

  if (isFlush) {
    return {
      rank: 'Flush', rankValue: 5, handValues: values, handCards: sortedHand,
      description: `Flush, ${RANKS[values[0]-2]}-high`
    };
  }

  if (isStraight) {
    const handValues = values[0] === 14 && values[4] === 2 ? [5] : [values[0]];
    return {
      rank: 'Straight', rankValue: 4, handValues, handCards: sortedHand,
      description: `Straight, ${RANKS[handValues[0]-2]}-high`
    };
  }

  if (counts[0] === 3) {
    return {
      rank: 'Three of a Kind', rankValue: 3, handValues: sortedRankKeysByCount, handCards: sortedHand,
      description: `Three of a Kind, ${RANKS[sortedRankKeysByCount[0]-2]}s`
    };
  }

  if (counts[0] === 2 && counts[1] === 2) {
    return {
      rank: 'Two Pair', rankValue: 2, handValues: sortedRankKeysByCount, handCards: sortedHand,
      description: `Two Pair, ${RANKS[sortedRankKeysByCount[0]-2]}s and ${RANKS[sortedRankKeysByCount[1]-2]}s`
    };
  }

  if (counts[0] === 2) {
    return {
      rank: 'One Pair', rankValue: 1, handValues: sortedRankKeysByCount, handCards: sortedHand,
      description: `One Pair, ${RANKS[sortedRankKeysByCount[0]-2]}s`
    };
  }

  return {
    rank: 'High Card', rankValue: 0, handValues: values, handCards: sortedHand,
    description: `High Card, ${RANKS[values[0]-2]}`
  };
}

function compareEvaluations(a: HandEvaluation, b: HandEvaluation): number {
  if (a.rankValue !== b.rankValue) {
    return b.rankValue - a.rankValue;
  }
  for (let i = 0; i < Math.max(a.handValues.length, b.handValues.length); i++) {
    const valA = a.handValues[i] || 0;
    const valB = b.handValues[i] || 0;
    if (valA !== valB) {
      return valB - valA;
    }
  }
  return 0;
}

export function evaluateBestHand(sevenCards: Card[]): HandEvaluation {
  if (sevenCards.length < 5) throw new Error('Not enough cards to evaluate.');
  if (sevenCards.length > 7) throw new Error('Too many cards to evaluate.');
  
  const fiveCardCombinations = getCombinations(sevenCards, 5);
  let bestEvaluation: HandEvaluation | null = null;

  for (const combo of fiveCardCombinations) {
    const evaluation = evaluate5CardHand(combo);
    if (!bestEvaluation || compareEvaluations(bestEvaluation, evaluation) > 0) {
      bestEvaluation = evaluation;
    }
  }

  return bestEvaluation!;
}

export function findWinners(players: any[], communityCards: Card[]): { winners: any[], bestHand: HandEvaluation } {
  const activePlayers = players.filter(p => p.status !== 'folded');
  if (activePlayers.length === 0) return { winners: [], bestHand: {} as HandEvaluation };
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    const handEval = evaluateBestHand([...winner.hand, ...communityCards]);
    winner.bestHand = handEval;
    return { winners: [winner], bestHand: handEval };
  }

  let bestEval: HandEvaluation | null = null;
  let winners: any[] = [];

  for (const player of activePlayers) {
    const allCards = [...player.hand, ...communityCards];
    const evaluation = evaluateBestHand(allCards);
    player.bestHand = evaluation;

    if (!bestEval) {
      bestEval = evaluation;
      winners = [player];
    } else {
      const comparison = compareEvaluations(bestEval, evaluation);
      if (comparison > 0) {
        bestEval = evaluation;
        winners = [player];
      } else if (comparison === 0) {
        winners.push(player);
      }
    }
  }
  return { winners, bestHand: bestEval! };
}
