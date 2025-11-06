'use client';
import { cn } from '@/lib/utils';
import type { Card as CardType } from '@/lib/poker/types';
import { SUIT_SYMBOLS, SUIT_COLORS } from '@/lib/poker/utils';

interface CardProps {
  card?: CardType;
  isVisible: boolean;
}

const Card = ({ card, isVisible }: CardProps) => {
  if (!isVisible) {
    return (
      <div className="w-8 h-11 rounded bg-primary flex items-center justify-center">
        <div className="w-6 h-9 rounded-sm border-2 border-primary-foreground/50 bg-primary/80"></div>
      </div>
    );
  }

  if (!card) {
    return <div className="w-8 h-11 rounded bg-muted/20"></div>;
  }
  
  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const suitColor = SUIT_COLORS[card.suit];

  return (
    <div className={cn("w-8 h-11 rounded bg-card flex flex-col items-center justify-center font-bold border", suitColor)}>
      <div className="text-sm leading-none">{card.rank}</div>
      <div className="text-lg leading-none">{suitSymbol}</div>
    </div>
  );
};

export default Card;
