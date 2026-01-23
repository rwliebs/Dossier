'use client';

import { useState } from 'react';
import React from "react"

import { FileText, Code, Zap, Package, Edit2, Check, X } from 'lucide-react';
import type { CodeFile, CardStatus, EpicColor } from './types';

interface FileNodeProps {
  file: CodeFile;
  statuses: { cardId: string; status: CardStatus; epicColor?: EpicColor }[];
  isHighlighted?: boolean;
  position: { x: number; y: number };
  onUpdateDescription?: (fileId: string, description: string) => void;
  onClick?: (file: CodeFile) => void;
}

const fileTypeIcon: Record<string, React.ReactNode> = {
  component: <Code className="h-3 w-3" />,
  api: <Zap className="h-3 w-3" />,
  service: <Package className="h-3 w-3" />,
  hook: <Code className="h-3 w-3" />,
  util: <FileText className="h-3 w-3" />,
  schema: <FileText className="h-3 w-3" />,
  middleware: <Zap className="h-3 w-3" />,
};

const statusColors: Record<CardStatus, string> = {
  todo: 'bg-gray-500',
  active: 'bg-green-500',
  questions: 'bg-yellow-500',
  review: 'bg-blue-500',
  production: 'bg-green-700',
};

const epicColorToBg: Record<EpicColor | string, string> = {
  yellow: 'bg-yellow-400/20 border-yellow-400',
  blue: 'bg-blue-400/20 border-blue-400',
  purple: 'bg-purple-400/20 border-purple-400',
  green: 'bg-green-400/20 border-green-400',
  orange: 'bg-orange-400/20 border-orange-400',
  pink: 'bg-pink-400/20 border-pink-400',
};

export function FileNode({ 
  file, 
  statuses, 
  isHighlighted, 
  position,
  onUpdateDescription,
  onClick,
}: FileNodeProps) {
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(file.description || '');
  const uniqueStatuses = Array.from(
    new Map(statuses.map((s) => [s.status, s])).values()
  );

  // Get primary epic color for border
  const primaryEpicColor = statuses[0]?.epicColor || 'blue';
  const borderClass = epicColorToBg[primaryEpicColor];

  const handleSaveDescription = () => {
    onUpdateDescription?.(file.id, editedDescription);
    setIsEditingDescription(false);
  };

  const handleCancelEdit = () => {
    setEditedDescription(file.description || '');
    setIsEditingDescription(false);
  };

  return (
    <div
      className={`absolute flex flex-col gap-1 p-3 rounded border transition-all cursor-pointer hover:shadow-md ${
        isHighlighted
          ? `${borderClass} shadow-lg ring-2 ring-foreground`
          : `bg-card border-grid-line hover:border-muted-foreground`
      }`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '240px',
      }}
      onClick={() => onClick?.(file)}
    >
      {/* File Header */}
      <div className="flex items-center gap-1 mb-1">
        <div className="text-muted-foreground">{fileTypeIcon[file.type] || fileTypeIcon.util}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono font-bold text-foreground truncate">{file.name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{file.path}</p>
        </div>
      </div>

      {/* Description */}
      {isEditingDescription ? (
        <div className="space-y-2 text-xs mb-2">
          <textarea
            value={editedDescription}
            onChange={(e) => setEditedDescription(e.target.value)}
            className="w-full text-xs p-2 bg-background border border-grid-line rounded text-foreground placeholder-muted-foreground"
            placeholder="Describe this file and its purpose..."
            rows={2}
          />
          <div className="flex gap-1">
            <button
              onClick={handleSaveDescription}
              className="flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono bg-green-600 text-white rounded hover:bg-green-700"
            >
              <Check className="h-2.5 w-2.5" />
            </button>
            <button
              onClick={handleCancelEdit}
              className="flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono bg-muted text-foreground rounded hover:bg-muted-foreground"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      ) : (
        <div 
          className="group/desc flex items-start gap-1 mb-2"
        >
          <p className="text-[10px] text-muted-foreground flex-1 line-clamp-2">
            {file.description || 'No description'}
          </p>
          <button
            onClick={() => setIsEditingDescription(true)}
            className="opacity-0 group-hover/desc:opacity-100 transition-opacity p-0.5 hover:bg-secondary rounded flex-shrink-0"
          >
            <Edit2 className="h-2.5 w-2.5 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Status Tags */}
      <div className="flex flex-wrap gap-1">
        {uniqueStatuses.map((s) => (
          <div
            key={s.cardId}
            className={`h-2 w-2 rounded-full ${statusColors[s.status]} inline-block`}
            title={`${s.cardId}: ${s.status}`}
          />
        ))}
      </div>

      {/* Functionality Labels */}
      <div className="text-[9px] text-muted-foreground space-y-0.5 border-t border-grid-line pt-1">
        {statuses.slice(0, 2).map((s) => (
          <div key={s.cardId} className="line-clamp-1">
            {s.cardId}
          </div>
        ))}
        {statuses.length > 2 && (
          <div className="text-[8px] italic">+{statuses.length - 2} more</div>
        )}
      </div>
    </div>
  );
}
