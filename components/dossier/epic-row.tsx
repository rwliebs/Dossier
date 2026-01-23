'use client';

import { ActivityColumn } from './activity-column';
import type { Epic, ContextDoc, CodeFile } from './types';

interface EpicRowProps {
  epic: Epic;
  expandedCardId: string | null;
  onExpandCard: (cardId: string) => void;
  onCardAction: (cardId: string, action: string) => void;
  onUpdateCardDescription?: (cardId: string, description: string) => void;
  onUpdateQuickAnswer?: (cardId: string, quickAnswer: string) => void;
  onSelectDoc?: (doc: ContextDoc) => void;
  onSelectFile?: (file: CodeFile) => void;
  codeFiles?: CodeFile[];
}

export function EpicRow({ 
  epic, 
  expandedCardId, 
  onExpandCard, 
  onCardAction,
  onUpdateCardDescription,
  onUpdateQuickAnswer,
  onSelectDoc,
  onSelectFile,
  codeFiles,
}: EpicRowProps) {
  return (
    <div className="border-l-2 border-border pl-6 pr-8 py-6 bg-background">
      {/* Epic Title - Now neutral without color */}
      <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-muted-foreground mb-8">
        {epic.title}
      </h2>

      {/* Activities (horizontal row of columns) */}
      <div className="flex gap-8 overflow-x-auto pb-2">
        {epic.activities.map((activity) => (
          <ActivityColumn
            key={activity.id}
            activity={activity}
            expandedCardId={expandedCardId}
            onExpandCard={onExpandCard}
            onCardAction={onCardAction}
            onUpdateCardDescription={onUpdateCardDescription}
            onUpdateQuickAnswer={onUpdateQuickAnswer}
            onSelectDoc={onSelectDoc}
            onSelectFile={onSelectFile}
            codeFiles={codeFiles}
          />
        ))}
      </div>
    </div>
  );
}
