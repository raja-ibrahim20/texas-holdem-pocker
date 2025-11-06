'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import type { Player } from '@/lib/poker/types';

interface SetupControlsProps {
  players: Player[];
  onStart: (players: Player[]) => void;
  handOver: boolean;
}

const SetupControls = ({ players: initialPlayers, onStart, handOver }: SetupControlsProps) => {
  const [players, setPlayers] = useState<Player[]>(initialPlayers);

  useEffect(() => {
    setPlayers(initialPlayers);
  }, [initialPlayers])

  const handleStackChange = (playerId: number, value: number) => {
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, stack: value } : p));
  };

  const setAllStacks = (value: number) => {
    setPlayers(prev => prev.map(p => ({ ...p, stack: value })));
  }

  const isSetup = handOver || players.every(p => p.hand.length === 0);

  return (
    <Card>
      <CardContent className="p-4 flex gap-4 items-center">
        <div className="flex-1 grid grid-cols-3 gap-2">
          {players.map(player => (
            <div key={player.id} className="flex items-center gap-2">
              <Label htmlFor={`stack-${player.id}`} className="text-sm">{player.name}</Label>
              <Input
                id={`stack-${player.id}`}
                type="number"
                value={player.stack}
                onChange={(e) => handleStackChange(player.id, parseInt(e.target.value) || 0)}
                className="w-24 h-8"
                disabled={!isSetup}
              />
            </div>
          ))}
        </div>
        <div className='flex items-center gap-2'>
          <Input
            type="number"
            defaultValue={2000}
            onChange={e => setAllStacks(parseInt(e.target.value) || 0)}
            className="w-24 h-8"
            placeholder="All Stacks"
            disabled={!isSetup}
          />
        </div>
        <Button onClick={() => onStart(players)} className="font-bold h-8" disabled={!isSetup}>
          {/* {isSetup ? 'Start Hand' : 'Hand in Progress'}
             */}
          {handOver ? 'Start Hand' : 'Restart Hand'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default SetupControls;
