"use client";

import { useState } from "react";
import {
  ChevronRight,
  FileText,
  FolderOpen,
  GitBranch,
  History,
  Layers,
  Plus,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  status: "active" | "draft" | "archived";
  nodeCount: number;
}

const projects: Project[] = [
  { id: "1", name: "SaaS Dashboard", status: "active", nodeCount: 8 },
  { id: "2", name: "Mobile App v2", status: "active", nodeCount: 6 },
  { id: "3", name: "API Platform", status: "draft", nodeCount: 4 },
];

const navItems = [
  { icon: Layers, label: "Flows", count: 3 },
  { icon: FileText, label: "Context", count: 18 },
  { icon: GitBranch, label: "Schemas", count: 6 },
  { icon: Users, label: "Team", count: null },
  { icon: History, label: "History", count: null },
];

export function Sidebar() {
  const [selectedProject, setSelectedProject] = useState("1");
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(true);

  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-background">
      {/* Search */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 bg-muted px-3 py-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="font-mono text-[9px] text-muted-foreground border border-border px-1">/</kbd>
        </div>
      </div>

      {/* Projects */}
      <div className="px-3 py-3">
        <button
          type="button"
          onClick={() => setIsProjectsExpanded(!isProjectsExpanded)}
          className="flex w-full items-center gap-1.5 px-1 py-1.5 text-[9px] font-medium uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 transition-transform",
              isProjectsExpanded && "rotate-90"
            )}
          />
          Projects
        </button>
        {isProjectsExpanded && (
          <div className="mt-1 space-y-0.5">
            {projects.map((project) => (
              <button
                type="button"
                key={project.id}
                onClick={() => setSelectedProject(project.id)}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-xs transition-colors",
                  selectedProject === project.id
                    ? "bg-foreground text-background"
                    : "text-foreground hover:bg-muted"
                )}
              >
                <FolderOpen className="h-3 w-3 shrink-0" />
                <span className="flex-1 truncate text-left">{project.name}</span>
                <span
                  className={cn(
                    "font-mono text-[9px]",
                    selectedProject === project.id
                      ? "text-background/60"
                      : "text-muted-foreground"
                  )}
                >
                  {project.nodeCount}
                </span>
              </button>
            ))}
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              <span>New Project</span>
            </button>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-border" />

      {/* Navigation */}
      <nav className="flex-1 p-3">
        <div className="space-y-0.5">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.label}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <item.icon className="h-3 w-3" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.count !== null && (
                <span className="font-mono text-[9px]">{item.count}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings className="h-3 w-3" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
