'use client';

import { useState } from 'react';
import { ChevronRight, Zap } from 'lucide-react';
import { StoryMapCanvas } from './story-map-canvas';
import { ArchitectureView } from './architecture-view';
import { Button } from '@/components/ui/button';
import type { Iteration, ContextDoc, CodeFile } from './types';

interface IterationBlockProps {
  iteration: Iteration;
  viewMode: 'functionality' | 'architecture';
  expandedCardId: string | null;
  onExpandCard: (cardId: string | null) => void;
  onCardAction: (cardId: string, action: string) => void;
  onUpdateCardDescription?: (cardId: string, description: string) => void;
  onUpdateQuickAnswer?: (cardId: string, quickAnswer: string) => void;
  onUpdateFileDescription?: (fileId: string, description: string) => void;
  onSelectDoc?: (doc: ContextDoc) => void;
  onFileClick?: (file: CodeFile) => void;
}

export function IterationBlock({
  iteration,
  viewMode,
  expandedCardId,
  onExpandCard,
  onCardAction,
  onUpdateCardDescription,
  onUpdateQuickAnswer,
  onUpdateFileDescription,
  onSelectDoc,
  onFileClick,
}: IterationBlockProps) {
  // Count cards by status
  const allCards = iteration.epics.flatMap((epic) =>
    epic.activities.flatMap((activity) => activity.cards)
  );

  const statusCounts = {
    todo: allCards.filter((c) => c.status === 'todo').length,
    active: allCards.filter((c) => c.status === 'active').length,
    questions: allCards.filter((c) => c.status === 'questions').length,
    review: allCards.filter((c) => c.status === 'review').length,
    production: allCards.filter((c) => c.status === 'production').length,
  };

  const totalPending = statusCounts.todo + statusCounts.active + statusCounts.questions;

  return (
    <div className="border-b border-grid-line last:border-b-0">
      {/* Iteration Header */}
      <div className="bg-secondary/50 border-b border-grid-line px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="font-mono text-lg font-bold uppercase tracking-widest text-foreground">
                {iteration.label}
              </h2>
              <p className="text-xs text-muted-foreground">{iteration.description}</p>
            </div>

            {/* Status counts */}
            <div className="flex gap-4 mt-3 text-xs font-mono">
              {statusCounts.active > 0 && (
                <div className="text-green-400">
                  <span className="font-bold">{statusCounts.active}</span> active
                </div>
              )}
              {statusCounts.questions > 0 && (
                <div className="text-yellow-400">
                  <span className="font-bold">{statusCounts.questions}</span> blocked
                </div>
              )}
              {statusCounts.review > 0 && (
                <div className="text-blue-400">
                  <span className="font-bold">{statusCounts.review}</span> review
                </div>
              )}
              {statusCounts.production > 0 && (
                <div className="text-green-600">
                  <span className="font-bold">{statusCounts.production}</span> live
                </div>
              )}
              {statusCounts.todo > 0 && (
                <div className="text-muted-foreground">
                  <span className="text-foreground font-bold">{statusCounts.todo}</span> pending
                </div>
              )}
            </div>
          </div>

          {/* Build button for iteration */}
          {totalPending > 0 && (
            <Button className="h-8 gap-2 bg-primary text-primary-foreground whitespace-nowrap">
              <Zap className="h-3 w-3" />
              <span className="text-xs uppercase tracking-widest font-mono">Build {iteration.label}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Content based on view mode */}
      <div className="overflow-x-auto">
        {viewMode === 'functionality' ? (
          <StoryMapCanvas
            epics={iteration.epics}
            expandedCardId={expandedCardId}
            onExpandCard={onExpandCard}
            onCardAction={onCardAction}
            onUpdateCardDescription={onUpdateCardDescription}
            onUpdateQuickAnswer={onUpdateQuickAnswer}
            onSelectDoc={onSelectDoc}
            onSelectFile={onFileClick}
            codeFiles={iteration.codeFiles}
          />
        ) : (
          <ArchitectureView 
            iteration={iteration} 
            onUpdateFileDescription={onUpdateFileDescription}
            onFileClick={onFileClick}
          />
        )}
      </div>
    </div>
  );
}
