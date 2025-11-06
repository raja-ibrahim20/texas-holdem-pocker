'use client';
import type { Card as CardType, GameStage } from '@/lib/poker/types';
import Card from './card';
import { Card as UICard, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface BoardProps {
  cards: CardType[];
  pot: number;
  stage: GameStage;
  winnerDescription: string;
}

const Board = ({ cards, pot, stage, winnerDescription }: BoardProps) => {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <UICard className="bg-background/70 backdrop-blur-sm">
        <CardHeader className="p-2 pb-0">
            <CardDescription>Pot</CardDescription>
          <CardTitle className="text-2xl font-headline">{pot}</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
            <div className="flex gap-2 justify-center min-h-[56px] items-center">
                {Array.from({ length: 5 }).map((_, index) => (
                    <Card key={index} card={cards[index]} isVisible={!!cards[index]} />
                ))}
            </div>
            {stage === 'showdown' && (
                <p className="text-sm text-accent mt-2 font-semibold animate-pulse">{winnerDescription}</p>
            )}
        </CardContent>
      </UICard>
    </div>
  );
};

export default Board;
