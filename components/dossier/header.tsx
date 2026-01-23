'use client';

import { Zap, Share2, Settings, Eye, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DossierHeaderProps {
  viewMode: 'functionality' | 'architecture';
  onViewModeChange: (mode: 'functionality' | 'architecture') => void;
  agentStatus: 'idle' | 'building' | 'reviewing';
}

export function Header({ viewMode, onViewModeChange, agentStatus }: DossierHeaderProps) {
  const statusColors = {
    idle: 'text-muted-foreground',
    building: 'text-green-400 animate-pulse',
    reviewing: 'text-yellow-400',
  };

  return (
    <header className="border-b border-grid-line bg-background px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-foreground">
            DOSSIER
          </h1>
          <div className="text-xs uppercase tracking-widest font-mono text-muted-foreground">
            AI-Native Product Building Platform
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Agent Status */}
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${statusColors[agentStatus]} ${agentStatus === 'building' ? 'animate-pulse' : ''}`} />
            <span className="text-xs uppercase tracking-widest font-mono text-foreground">
              {agentStatus === 'idle' && 'Ready'}
              {agentStatus === 'building' && 'Building'}
              {agentStatus === 'reviewing' && 'Reviewing'}
            </span>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 border border-grid-line rounded px-2 py-1">
            <Button
              variant={viewMode === 'functionality' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('functionality')}
              className="h-6 px-2 text-xs uppercase tracking-widest font-mono"
            >
              <Eye className="h-3 w-3 mr-1" />
              Functionality
            </Button>
            <div className="w-px h-4 bg-grid-line" />
            <Button
              variant={viewMode === 'architecture' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('architecture')}
              className="h-6 px-2 text-xs uppercase tracking-widest font-mono"
            >
              <Database className="h-3 w-3 mr-1" />
              Architecture
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-2 bg-transparent">
              <Share2 className="h-3 w-3" />
              <span className="text-xs uppercase tracking-widest font-mono">Share</span>
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-2 bg-transparent">
              <Settings className="h-3 w-3" />
            </Button>
            <Button className="h-8 gap-2 bg-primary text-primary-foreground">
              <Zap className="h-3 w-3" />
              <span className="text-xs uppercase tracking-widest font-mono">Build All</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
