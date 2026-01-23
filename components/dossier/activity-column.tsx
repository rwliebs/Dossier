'use client';

import { ImplementationCard } from './implementation-card';
import type { UserActivity, ContextDoc, CodeFile } from './types';

interface ActivityColumnProps {
  activity: UserActivity;
  expandedCardId: string | null;
  onExpandCard: (cardId: string) => void;
  onCardAction: (cardId: string, action: string) => void;
  onUpdateCardDescription?: (cardId: string, description: string) => void;
  onUpdateQuickAnswer?: (cardId: string, quickAnswer: string) => void;
  onSelectDoc?: (doc: ContextDoc) => void;
  onSelectFile?: (file: CodeFile) => void;
  codeFiles?: CodeFile[];
}

export function ActivityColumn({
  activity,
  expandedCardId,
  onExpandCard,
  onCardAction,
  onUpdateCardDescription,
  onUpdateQuickAnswer,
  onSelectDoc,
  onSelectFile,
  codeFiles = [],
}: ActivityColumnProps) {
  // Sort cards by priority (top to bottom = highest to lowest)
  const sortedCards = [...activity.cards].sort((a, b) => a.priority - b.priority);

  return (
    <div className="flex flex-col min-w-72 max-w-80">
      {/* Activity Header */}
      <div className="border-b-2 border-foreground pb-2 mb-4">
        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-foreground">
          {activity.title}
        </h3>
      </div>

      {/* Cards Stacked Vertically by Priority */}
      <div className="space-y-3">
        {sortedCards.map((card) => (
          <ImplementationCard
            key={card.id}
            card={card}
            isExpanded={expandedCardId === card.id}
            onExpand={onExpandCard}
            onAction={onCardAction}
            onUpdateDescription={onUpdateCardDescription || (() => {})}
            onUpdateQuickAnswer={onUpdateQuickAnswer || (() => {})}
            onSelectDoc={onSelectDoc}
            onSelectFile={onSelectFile}
            codeFiles={codeFiles}
          />
        ))}
      </div>
    </div>
  );
}
