'use client';

import { useState } from 'react';
import { ActivityColumn } from './activity-column';
import type { Epic, ContextDoc, CodeFile } from './types';
import { MessageSquare, Bot, Clock } from 'lucide-react'; // Importing the undeclared variables

interface StoryMapCanvasProps {
  epics: Epic[];
  projectContext: ContextDoc; // Declaring projectContext in the props
  expandedCardId?: string | null;
  onExpandCard?: (cardId: string | null) => void;
  onCardAction?: (cardId: string, action: string) => void;
  onUpdateCardDescription?: (cardId: string, description: string) => void;
  onUpdateQuickAnswer?: (cardId: string, quickAnswer: string) => void;
  onSelectDoc?: (doc: ContextDoc) => void;
  onSelectFile?: (file: CodeFile) => void;
  codeFiles?: CodeFile[];
}

export function StoryMapCanvas({
  epics,
  projectContext, // Using the declared projectContext
  expandedCardId: controlledExpandedCardId,
  onExpandCard: controlledOnExpandCard,
  onCardAction,
  onUpdateCardDescription,
  onUpdateQuickAnswer,
  onSelectDoc,
  onSelectFile,
  codeFiles,
}: StoryMapCanvasProps) {
  const [uncontrolledExpandedCardId, setUncontrolledExpandedCardId] = useState<string | null>(null);

  // Use controlled or uncontrolled state
  const expandedCardId = controlledExpandedCardId ?? uncontrolledExpandedCardId;
  const handleExpandCard = controlledOnExpandCard ?? setUncontrolledExpandedCardId;

  const handleCardAction = (cardId: string, action: string) => {
    onCardAction?.(cardId, action);
  };

  // Flatten all activities from all epics into a single horizontal flow
  // Each activity knows which epic it belongs to for labeling
  const allActivities = epics.flatMap((epic) =>
    epic.activities.map((activity) => ({
      ...activity,
      epicTitle: epic.title,
      epicId: epic.id,
    }))
  );

  return (
    <div className="flex-1 overflow-x-auto overflow-y-auto bg-background">
      {/* Horizontal Flow Header - User Journey */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-3">
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-muted-foreground uppercase tracking-widest">User Journey</span>
          <span className="text-foreground">→</span>
        </div>
      </div>
      
      {/* Single Horizontal Row - All Activities */}
      <div className="flex gap-6 p-6 min-w-max">
        {allActivities.map((activity, index) => (
          <div key={activity.id} className="flex items-start gap-6">
            <div className="flex flex-col">
              {/* Epic Label above activity */}
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2 px-1">
                {activity.epicTitle}
              </div>
              <ActivityColumn
                activity={activity}
                expandedCardId={expandedCardId}
                onExpandCard={handleExpandCard}
                onCardAction={handleCardAction}
                onUpdateCardDescription={onUpdateCardDescription}
                onUpdateQuickAnswer={onUpdateQuickAnswer}
                onSelectDoc={onSelectDoc}
                onSelectFile={onSelectFile}
                codeFiles={codeFiles}
              />
            </div>
            {/* Arrow between activities */}
            {index < allActivities.length - 1 && (
              <div className="flex items-center h-24 text-muted-foreground/50">
                <span className="text-lg">→</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
