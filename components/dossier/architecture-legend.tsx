'use client';

import { Code, Zap, Package, FileText } from 'lucide-react';

export function ArchitectureLegend() {
  const statusColors = {
    todo: 'bg-gray-500',
    active: 'bg-green-500',
    questions: 'bg-yellow-500',
    review: 'bg-blue-500',
    production: 'bg-green-700',
  };

  const fileTypes = [
    { icon: Code, label: 'Component' },
    { icon: Zap, label: 'API Route' },
    { icon: Package, label: 'Service' },
    { icon: FileText, label: 'Utility' },
  ];

  return (
    <div className="flex flex-wrap gap-6 px-6 py-4 border-b border-grid-line text-xs font-mono">
      {/* File Types */}
      <div className="flex items-center gap-4">
        <span className="uppercase tracking-widest text-muted-foreground font-bold">File Types:</span>
        <div className="flex gap-4">
          {fileTypes.map((ft) => (
            <div key={ft.label} className="flex items-center gap-2">
              <ft.icon className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">{ft.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Status Indicators */}
      <div className="flex items-center gap-4">
        <span className="uppercase tracking-widest text-muted-foreground font-bold">Status:</span>
        <div className="flex gap-4">
          {Object.entries(statusColors).map(([status, color]) => (
            <div key={status} className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${color}`} />
              <span className="text-muted-foreground capitalize">{status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Data Flow */}
      <div className="flex items-center gap-4">
        <span className="uppercase tracking-widest text-muted-foreground font-bold">Data Flow:</span>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <svg width="30" height="12" className="flex-shrink-0">
              <line x1="0" y1="6" x2="24" y2="6" stroke="rgba(148, 163, 184, 0.3)" strokeWidth="2" />
              <polygon points="24,6 20,4 20,8" fill="rgba(148, 163, 184, 0.5)" />
            </svg>
            <span className="text-muted-foreground">Input/Output</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="30" height="12" className="flex-shrink-0">
              <line x1="0" y1="6" x2="24" y2="6" stroke="rgba(100, 200, 255, 0.3)" strokeWidth="2" />
              <polygon points="24,6 20,4 20,8" fill="rgba(100, 200, 255, 0.5)" />
              <polygon points="0,6 4,4 4,8" fill="rgba(100, 200, 255, 0.5)" />
            </svg>
            <span className="text-muted-foreground">Bidirectional</span>
          </div>
        </div>
      </div>
    </div>
  );
}
