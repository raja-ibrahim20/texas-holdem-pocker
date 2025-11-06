'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { HandHistoryEntry } from '@/lib/poker/types';
import { Separator } from '@/components/ui/separator';

interface HandHistoryProps {
  histories: HandHistoryEntry[];
}

const HandHistory = ({ histories }: HandHistoryProps) => {
  const reversedHistories = [...histories].reverse();


  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-headline">Hand History</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[70vh] pr-4">
          <Accordion type="single" collapsible className="w-full">
            {reversedHistories.map((history, index) => (
              <AccordionItem value={`item-${index}`} key={history.id}>
                <AccordionTrigger>
                  Hand #{history.id.substring(0, 8)}...
                </AccordionTrigger>
                <AccordionContent>
                  <div className="text-xs space-y-1 text-muted-foreground font-mono">
                    <p>Hand #{history.id}</p>
                    <p>Stack {history.players[0]?.stack}; Dealer: {history.dealer}; Small Blind: {history.smallBlind}; Big Blind: {history.bigBlind}</p>
                    <p>Hands: {history.players.map(p => `${p.name}: ${p.cards}`).join('; ')}</p>
                    <p>Actions: {history.actions.join('')}</p>
                    <p>Winnings: {history.players.map(p => `${p.name}: ${p.winnings > 0 ? '+' : ''}${p.winnings}`).join('; ')}</p>

                    <Separator className="my-2" />

                    <p><span className="font-semibold">Community:</span> {history.communityCards.join(' ')}</p>
                    <p><span className="font-semibold">Final Pot:</span> {history.finalPot}</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default HandHistory;

// 'use client';
// import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// import { ScrollArea } from '@/components/ui/scroll-area';
// import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
// import type { HandHistoryEntry } from '@/lib/poker/types';

// interface HandHistoryProps {
//   histories: HandHistoryEntry[];
// }

// const HandHistory = ({ histories }: HandHistoryProps) => {
//   const reversedHistories = [...histories];

//   return (
//     <Card className="h-full">
//       <CardHeader>
//         <CardTitle className="font-headline">Hand History</CardTitle>
//       </CardHeader>
//       <CardContent>
//         <ScrollArea className="h-[70vh] pr-4">
//           <Accordion type="single" collapsible className="w-full">
//             {reversedHistories.map((history, index) => (
//               <AccordionItem value={`item-${index}`} key={history.id}>
//                 <AccordionTrigger>
//                   Hand #{history.id.substring(0, 8)}
//                 </AccordionTrigger>
//                 <AccordionContent>
//                   <div className="text-xs space-y-1 text-muted-foreground">
//                     <p><span className="font-semibold text-foreground">Dealer:</span> {history.dealer}</p>
//                     <p><span className="font-semibold text-foreground">Blinds:</span> {history.smallBlind} (SB), {history.bigBlind} (BB)</p>
//                     <p><span className="font-semibold text-foreground">Community:</span> {history.communityCards.join(' ')}</p>
//                     <p><span className="font-semibold text-foreground">Actions:</span> {history.actions.join(' ')}</p>
//                     <p><span className="font-semibold text-foreground">Final Pot:</span> {history.finalPot}</p>

//                     <div className='pt-2'>
//                       <p className="font-semibold text-foreground">Players:</p>
//                       <ul className='pl-4 list-disc'>
//                         {history.players.map(p => (
//                           <li key={p.name}>
//                             {p.name}: Stack {p.stack}, Cards: {p.cards}, Winnings: {p.winnings > 0 ? '+' : ''}{p.winnings}
//                           </li>
//                         ))}
//                       </ul>
//                     </div>

//                   </div>
//                 </AccordionContent>
//               </AccordionItem>
//             ))}
//           </Accordion>
//         </ScrollArea>
//       </CardContent>
//     </Card>
//   );
// };

// export default HandHistory;
