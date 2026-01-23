'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, MoreVertical, BookOpen, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProjectInfo {
  name: string;
  description: string;
  status: 'active' | 'planning' | 'completed';
  collaborators: string[];
}

interface LeftSidebarProps {
  isCollapsed: boolean;
  onToggle: (collapsed: boolean) => void;
  project: ProjectInfo;
}

export function LeftSidebar({ isCollapsed, onToggle, project }: LeftSidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['overview', 'context', 'schemas'])
  );

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const statusColors = {
    active: 'bg-green-900 text-green-50',
    planning: 'bg-yellow-900 text-yellow-50',
    completed: 'bg-gray-700 text-gray-50',
  };

  if (isCollapsed) {
    return (
      <div className="w-12 border-r border-grid-line bg-background flex flex-col items-center py-4 gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggle(false)}
          className="h-8 w-8 p-0"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const contextTags = ['Research', 'Design', 'Analytics', 'API Docs'];
  const schemas = ['User Schema', 'Product Schema', 'Event Schema'];

  return (
    <div className="w-64 border-r border-grid-line bg-background overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-grid-line">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1">
            <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
              {project.name}
            </h2>
            <span className={`inline-block mt-2 px-2 py-1 text-xs uppercase tracking-wider font-mono ${statusColors[project.status]}`}>
              {project.status}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggle(true)}
            className="h-6 w-6 p-0"
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mt-2">
          {project.description}
        </p>
      </div>

      {/* Overview Section */}
      <div className="border-b border-grid-line">
        <button
          onClick={() => toggleSection('overview')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary transition-colors"
        >
          <span className="text-xs uppercase tracking-wider font-mono font-bold">Overview</span>
          {expandedSections.has('overview') ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          )}
        </button>
        {expandedSections.has('overview') && (
          <div className="px-4 pb-4 space-y-3 border-t border-grid-line pt-3">
            <div>
              <p className="text-xs uppercase tracking-wider font-mono text-muted-foreground mb-1">
                Collaborators
              </p>
              <div className="flex gap-1">
                {project.collaborators.map((collab, i) => (
                  <div
                    key={i}
                    className="h-6 w-6 rounded-full bg-accent text-primary text-xs flex items-center justify-center font-bold"
                  >
                    {collab[0]}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Context Section */}
      <div className="border-b border-grid-line">
        <button
          onClick={() => toggleSection('context')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary transition-colors"
        >
          <span className="text-xs uppercase tracking-wider font-mono font-bold">
            Context Tags ({contextTags.length})
          </span>
          {expandedSections.has('context') ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          )}
        </button>
        {expandedSections.has('context') && (
          <div className="px-4 pb-4 space-y-2 border-t border-grid-line pt-3">
            {contextTags.map((tag) => (
              <div
                key={tag}
                className="flex items-center gap-2 p-2 rounded border border-grid-line hover:bg-secondary cursor-pointer transition-colors"
              >
                <Tag className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-mono text-foreground">{tag}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Schemas Section */}
      <div className="border-b border-grid-line">
        <button
          onClick={() => toggleSection('schemas')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary transition-colors"
        >
          <span className="text-xs uppercase tracking-wider font-mono font-bold">
            Schemas ({schemas.length})
          </span>
          {expandedSections.has('schemas') ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          )}
        </button>
        {expandedSections.has('schemas') && (
          <div className="px-4 pb-4 space-y-2 border-t border-grid-line pt-3">
            {schemas.map((schema) => (
              <div
                key={schema}
                className="flex items-center gap-2 p-2 rounded border border-grid-line hover:bg-secondary cursor-pointer transition-colors"
              >
                <BookOpen className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-mono text-foreground">{schema}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
