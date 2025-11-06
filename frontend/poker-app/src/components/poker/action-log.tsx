'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEffect, useRef } from 'react';
import { Separator } from '@/components/ui/separator';
import React from 'react';

interface ActionLogProps {
  log: string[];
}

const ActionLog = ({ log }: ActionLogProps) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
        const viewport = scrollAreaRef.current.querySelector('div');
        if (viewport) {
            viewport.scrollTop = viewport.scrollHeight;
        }
    }
  }, [log]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-headline">Play Log</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[70vh] pr-4" ref={scrollAreaRef}>
            <div className="space-y-2">
            {log.map((action, index) => (
                <React.Fragment key={index}>
                {action.startsWith('---') ? (
                    <div className="py-2">
                        <Separator />
                        <p className="text-sm font-bold text-accent text-center pt-2">
                            {action.replace(/---/g, '').trim()}
                        </p>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                    {action}
                    </p>
                )}
                </React.Fragment>
            ))}
            </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default ActionLog;
