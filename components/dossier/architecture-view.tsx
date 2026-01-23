'use client';

import { ArchitectureCanvas } from './architecture-canvas';
import { ArchitectureLegend } from './architecture-legend';
import type { Iteration, CodeFile } from './types';

interface ArchitectureViewProps {
  iteration: Iteration;
  onUpdateFileDescription?: (fileId: string, description: string) => void;
  onFileClick?: (file: CodeFile) => void;
}

export function ArchitectureView({ 
  iteration,
  onUpdateFileDescription,
  onFileClick,
}: ArchitectureViewProps) {
  const codeFiles = iteration.codeFiles || [];
  const dataFlows = iteration.dataFlows || [];

  // Flatten all cards from all epics
  const allCards = iteration.epics.flatMap((epic) =>
    epic.activities.flatMap((activity) => activity.cards)
  );

  if (codeFiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        <p>No architecture data available for this iteration.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ArchitectureLegend />
      <ArchitectureCanvas
        codeFiles={codeFiles}
        dataFlows={dataFlows}
        cards={allCards}
        epics={iteration.epics}
        onUpdateFileDescription={onUpdateFileDescription}
        onFileClick={onFileClick}
      />
    </div>
  );
}
