'use client';
import type { Player as PlayerType } from '@/lib/poker/types';
import { Badge } from '@/components/ui/badge';
import Card from './card';

interface PlayerProps {
  player: PlayerType;
  isActive: boolean;
}

const Player = ({ player, isActive }: PlayerProps) => {
  // In simulation, show cards even if folded to review hand.
  // Opacity will indicate folded status.
  const showCards = player.hand && player.hand.length > 0;
  const isFolded = player.status === 'folded';
  
  return (
    <div className={`flex flex-col items-center p-2 rounded-lg transition-all duration-300 ${isActive ? 'bg-accent/20 ring-2 ring-accent' : 'bg-background/50'} ${isFolded ? 'opacity-50' : ''}`}>
      <div className="text-sm font-bold font-headline">{player.name}</div>
      <div className="text-xs text-accent">{player.stack}</div>
      <div className="flex gap-1 my-1 min-h-[44px]">
        {player.hand.map((card, index) => (
          <Card key={index} card={card} isVisible={showCards} />
        ))}
      </div>
      <div className="flex gap-1 items-center h-5">
        {player.isDealer && <Badge variant="destructive">D</Badge>}
        {player.isSmallBlind && <Badge variant="secondary">SB</Badge>}
        {player.isBigBlind && <Badge variant="secondary">BB</Badge>}
        {player.bet > 0 && <div className="text-xs font-bold text-primary-foreground bg-primary/80 rounded-full px-2 py-0.5">{player.bet}</div>}
      </div>
    </div>
  );
};

export default Player;
