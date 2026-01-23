'use client';

import { useCallback, useMemo } from 'react';
import { FileNode } from './file-node';
import type { CodeFile, DataFlow, Card, CardStatus, EpicColor, Epic } from './types';

interface ArchitectureCanvasProps {
  codeFiles: CodeFile[];
  dataFlows: DataFlow[];
  cards: Card[];
  epics: Epic[];
  onUpdateFileDescription?: (fileId: string, description: string) => void;
  onFileClick?: (file: CodeFile) => void;
}

interface FileLayout {
  x: number;
  y: number;
}

export function ArchitectureCanvas({
  codeFiles,
  dataFlows,
  cards,
  epics,
  onUpdateFileDescription,
  onFileClick,
}: ArchitectureCanvasProps) {
  // Create a map of card id to status and epic color
  const cardMetadataMap = useMemo(() => {
    const map = new Map<
      string,
      { status: CardStatus; epicColor?: EpicColor }
    >();

    epics.forEach((epic) => {
      epic.activities.forEach((activity) => {
        activity.cards.forEach((card) => {
          map.set(card.id, { status: card.status, epicColor: epic.color });
        });
      });
    });

    return map;
  }, [cards, epics]);

  // Simple grid layout for files
  const filePositions = useMemo(() => {
    const positions: Record<string, FileLayout> = {};
    const cols = Math.ceil(Math.sqrt(codeFiles.length));
    const rowHeight = 220;
    const colWidth = 380;

    codeFiles.forEach((file, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      positions[file.id] = {
        x: col * colWidth + 20,
        y: row * rowHeight + 20,
      };
    });

    return positions;
  }, [codeFiles]);

  // Draw connection lines
  const renderDataFlows = useCallback(() => {
    return (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 0 }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="rgba(148, 163, 184, 0.5)" />
          </marker>
          <marker
            id="arrowhead-bidirectional"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="rgba(100, 200, 255, 0.5)" />
          </marker>
        </defs>

        {dataFlows.map((flow) => {
          const fromPos = filePositions[flow.fromFileId];
          const toPos = filePositions[flow.toFileId];

          if (!fromPos || !toPos) return null;

          const fromX = fromPos.x + 100;
          const fromY = fromPos.y + 60;
          const toX = toPos.x + 100;
          const toY = toPos.y + 60;

          const isReverse = flow.direction === 'bidirectional' ? 'none' : 'url(#arrowhead)';

          return (
            <g key={flow.id}>
              {/* Main line */}
              <line
                x1={fromX}
                y1={fromY}
                x2={toX}
                y2={toY}
                stroke="rgba(148, 163, 184, 0.3)"
                strokeWidth="2"
                markerEnd={isReverse}
              />

              {/* Reverse arrow if bidirectional */}
              {flow.direction === 'bidirectional' && (
                <polygon
                  points={`${toX},${toY} ${toX - 5},${toY - 3} ${toX - 5},${toY + 3}`}
                  fill="rgba(100, 200, 255, 0.5)"
                />
              )}

              {/* Label - no background box */}
              {flow.label && (
                <text
                  x={(fromX + toX) / 2}
                  y={(fromY + toY) / 2 - 8}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="12"
                  fontFamily="monospace"
                  fontWeight="500"
                  fill="rgba(100, 116, 139, 0.8)"
                >
                  {flow.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  }, [dataFlows, filePositions]);

  const canvasHeight = Math.ceil(Math.sqrt(codeFiles.length)) * 240 + 40;
  const canvasWidth = Math.ceil(Math.sqrt(codeFiles.length)) * 400 + 40;

  return (
    <div className="relative w-full bg-background overflow-auto border-t border-grid-line">
      <div
        className="relative"
        style={{
          width: `${canvasWidth}px`,
          height: `${canvasHeight}px`,
          minHeight: '400px',
        }}
      >
        {/* Render connection lines */}
        {renderDataFlows()}

        {/* Render file nodes */}
        {codeFiles.map((file) => {
          const position = filePositions[file.id];
          const statuses = file.cardIds
            .map((cardId) => ({
              cardId,
              status: cardMetadataMap.get(cardId)?.status || 'todo',
              epicColor: cardMetadataMap.get(cardId)?.epicColor,
            }))
            .filter((s) => s);

          return (
            <FileNode
              key={file.id}
              file={file}
              statuses={statuses}
              position={position}
              onUpdateDescription={onUpdateFileDescription}
              onClick={onFileClick}
            />
          );
        })}
      </div>
    </div>
  );
}
