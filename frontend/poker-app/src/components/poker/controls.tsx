'use client';
import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { BIG_BLIND_SIZE } from '@/lib/poker/game-logic';
import type { GameState, Action } from '@/lib/poker/types';
import { Minus, Plus } from 'lucide-react';

interface ControlsProps {
  state: GameState;
  dispatch: React.Dispatch<Action>;
}

const Controls = ({ state, dispatch }: ControlsProps) => {
  const { players, activePlayerIndex, currentBet, stage } = state;
  const player = players[activePlayerIndex];

  const [betAmount, setBetAmount] = useState(state.bigBlind);

  const canCheck = player ? player.bet === currentBet : false;
  const canCall = player ? currentBet > player.bet && player.stack > 0 : false;
  const callAmount = player ? Math.min(currentBet - player.bet, player.stack) : 0;
  
  const minRaise = useMemo(() => {
    const lastRaiseAmount = currentBet - (state.players.find(p => p.id === state.lastRaiserIndex)?.bet || 0);
    const minRaiseAmount = currentBet + Math.max(lastRaiseAmount, state.bigBlind);
    return minRaiseAmount;
  }, [currentBet, state.bigBlind, state.lastRaiserIndex, state.players]);
  
  const canRaise = player ? player.stack + player.bet > currentBet : false;

  useEffect(() => {
    if (currentBet === 0) {
      setBetAmount(state.bigBlind);
    } else {
      setBetAmount(minRaise);
    }
  }, [currentBet, state.bigBlind, minRaise]);

  const handleBetChange = (value: number) => {
    const snappedValue = Math.round(value / BIG_BLIND_SIZE) * BIG_BLIND_SIZE;
    setBetAmount(Math.max(snappedValue, currentBet > 0 ? minRaise : BIG_BLIND_SIZE));
  };
  
  if (stage === 'setup' || stage === 'showdown' || !player) {
    return <div className="h-[120px]"></div>;
  }

  const maxBet = player.stack + player.bet;

  return (
    <div className="p-4 rounded-lg bg-card border flex flex-col gap-4 items-center">
      <h3 className="text-lg font-bold font-headline">{player.name}'s Turn</h3>
      <div className="flex gap-2 w-full">
        <Button variant="destructive" onClick={() => dispatch({ type: 'FOLD' })} className="flex-1">Fold</Button>
        <Button variant="secondary" onClick={() => dispatch({ type: 'CHECK' })} disabled={!canCheck} className="flex-1">Check</Button>
        <Button variant="outline" onClick={() => dispatch({ type: 'CALL' })} disabled={!canCall} className="flex-1">Call {callAmount > 0 ? callAmount : ''}</Button>
        <Button variant="outline" onClick={() => dispatch({ type: 'RAISE', payload: {amount: player.stack + player.bet } })} className="flex-1 text-accent border-accent hover:bg-accent/10">All-in</Button>
      </div>
      <div className="w-full flex flex-col gap-2">
        <div className="flex gap-2 items-center">
            <Button size="icon" variant="outline" onClick={() => handleBetChange(betAmount - BIG_BLIND_SIZE)}><Minus /></Button>
            <Input 
                type="number" 
                value={betAmount} 
                onChange={e => handleBetChange(Number(e.target.value))}
                className="text-center font-bold"
            />
            <Button size="icon" variant="outline" onClick={() => handleBetChange(betAmount + BIG_BLIND_SIZE)}><Plus /></Button>
            <Button
                variant="default"
                onClick={() => {
                    if (currentBet > 0) {
                        dispatch({ type: 'RAISE', payload: { amount: Math.min(betAmount, maxBet) } })
                    } else {
                        dispatch({ type: 'BET', payload: { amount: Math.min(betAmount, maxBet) } })
                    }
                }}
                disabled={currentBet > 0 ? !canRaise : player.stack === 0}
                className="flex-1"
            >
                {currentBet > 0 ? 'Raise' : 'Bet'} to {Math.min(betAmount, maxBet)}
            </Button>
        </div>
        <Slider
          min={currentBet > 0 ? minRaise : BIG_BLIND_SIZE}
          max={maxBet}
          step={BIG_BLIND_SIZE}
          value={[betAmount]}
          onValueChange={(value) => setBetAmount(value[0])}
          disabled={player.stack === 0}
        />
      </div>
    </div>
  );
};

export default Controls;
