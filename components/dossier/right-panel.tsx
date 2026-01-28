"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronRight,
  ChevronDown,
  FileCode,
  Folder,
  FolderOpen,
  Terminal,
  FileText,
  GitBranch,
  X,
  Copy,
  ExternalLink,
  MessageSquare,
  Bot,
  User,
  Send,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { ContextDoc, CodeFile } from "./types";

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeDoc: ContextDoc | null;
  activeFile: CodeFile | null;
  activeTab: "files" | "terminal" | "docs" | "chat";
  onTabChange: (tab: "files" | "terminal" | "docs" | "chat") => void;
  // Chat/ideation props
  isIdeationMode?: boolean;
  onIdeationComplete?: (request: string) => void;
}

interface FileNode {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  path: string;
}

const mockFileTree: FileNode[] = [
  {
    name: "src",
    type: "folder",
    path: "/src",
    children: [
      {
        name: "components",
        type: "folder",
        path: "/src/components",
        children: [
          { name: "Header.tsx", type: "file", path: "/src/components/Header.tsx" },
          { name: "Sidebar.tsx", type: "file", path: "/src/components/Sidebar.tsx" },
          { name: "Card.tsx", type: "file", path: "/src/components/Card.tsx" },
        ],
      },
      {
        name: "pages",
        type: "folder",
        path: "/src/pages",
        children: [
          { name: "index.tsx", type: "file", path: "/src/pages/index.tsx" },
          { name: "dashboard.tsx", type: "file", path: "/src/pages/dashboard.tsx" },
        ],
      },
      {
        name: "api",
        type: "folder",
        path: "/src/api",
        children: [
          { name: "auth.ts", type: "file", path: "/src/api/auth.ts" },
          { name: "users.ts", type: "file", path: "/src/api/users.ts" },
        ],
      },
      { name: "utils.ts", type: "file", path: "/src/utils.ts" },
    ],
  },
  {
    name: "prisma",
    type: "folder",
    path: "/prisma",
    children: [
      { name: "schema.prisma", type: "file", path: "/prisma/schema.prisma" },
    ],
  },
  { name: "package.json", type: "file", path: "/package.json" },
  { name: "tsconfig.json", type: "file", path: "/tsconfig.json" },
];

const terminalLines = [
  { type: "input", content: "$ npm run dev" },
  { type: "output", content: "ready - started server on 0.0.0.0:3000" },
  { type: "output", content: "info  - Loaded env from .env.local" },
  { type: "input", content: "$ git status" },
  { type: "output", content: "On branch main" },
  { type: "output", content: "Changes not staged for commit:" },
  { type: "output", content: "  modified:   src/components/Header.tsx" },
  { type: "output", content: "  modified:   src/api/auth.ts" },
  { type: "input", content: "$ _" },
];

function FileTreeNode({
  node,
  depth = 0,
}: {
  node: FileNode;
  depth?: number;
}) {
  const [isOpen, setIsOpen] = useState(depth < 2);

  return (
    <div>
      <button
        type="button"
        onClick={() => node.type === "folder" && setIsOpen(!isOpen)}
        className="w-full flex items-center gap-1.5 py-1 px-2 hover:bg-accent/50 text-left group"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.type === "folder" ? (
          <>
            {isOpen ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
            {isOpen ? (
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </>
        ) : (
          <>
            <span className="w-3" />
            <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
          </>
        )}
        <span className="text-xs text-foreground truncate">{node.name}</span>
      </button>
      {node.type === "folder" && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function RightPanel({
  isOpen,
  onClose,
  activeDoc,
  activeFile,
  activeTab,
  onTabChange,
}: RightPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="w-80 border-l border-border bg-background flex flex-col">
      {/* Panel Header */}
      <div className="h-12 border-b border-border flex items-center justify-between px-3">
        <div className="flex items-center gap-1">
          <Button
            variant={activeTab === "files" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-[10px] uppercase tracking-wider"
            onClick={() => onTabChange("files")}
          >
            <GitBranch className="h-3 w-3 mr-1" />
            Files
          </Button>
          <Button
            variant={activeTab === "terminal" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-[10px] uppercase tracking-wider"
            onClick={() => onTabChange("terminal")}
          >
            <Terminal className="h-3 w-3 mr-1" />
            Terminal
          </Button>
          <Button
            variant={activeTab === "docs" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-[10px] uppercase tracking-wider"
            onClick={() => onTabChange("docs")}
          >
            <FileText className="h-3 w-3 mr-1" />
            Docs
          </Button>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "files" && (
          <ScrollArea className="h-full">
            <div className="py-2">
              <div className="px-3 pb-2 mb-2 border-b border-border">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <GitBranch className="h-3 w-3" />
                  <span>main</span>
                  <span className="text-foreground/40">•</span>
                  <span>2 modified</span>
                </div>
              </div>
              {mockFileTree.map((node) => (
                <FileTreeNode key={node.path} node={node} />
              ))}
            </div>
          </ScrollArea>
        )}

        {activeTab === "terminal" && (
          <div className="h-full bg-[#0a0a0a] p-4 font-mono text-xs overflow-auto">
            {activeFile && activeFile.code ? (
              <>
                <div className="text-green-400 mb-2">{`$ cat ${activeFile.path}`}</div>
                <div className="space-y-1 text-gray-300 whitespace-pre-wrap break-words">
                  {activeFile.code}
                </div>
                <div className="mt-4 text-green-400">$ _</div>
              </>
            ) : (
              <>
                {terminalLines.map((line, i) => (
                  <div
                    key={i}
                    className={`leading-relaxed ${
                      line.type === "input"
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {line.content}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === "docs" && (
          <ScrollArea className="h-full">
            {activeDoc ? (
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-mono font-bold text-sm text-foreground">{activeDoc.title}</h3>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                      {activeDoc.type}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Content rendering */}
                <div className="space-y-3 text-xs text-muted-foreground">
                  {activeDoc.content ? (
                    activeDoc.content.split('\n').map((line, idx) => {
                      if (line.startsWith('# ')) {
                        return (
                          <h2 key={idx} className="text-sm font-bold text-foreground mt-4 mb-2 uppercase tracking-widest">
                            {line.substring(2)}
                          </h2>
                        );
                      }
                      if (line.startsWith('## ')) {
                        return (
                          <h3 key={idx} className="text-xs font-bold text-foreground mt-3 mb-1">
                            {line.substring(3)}
                          </h3>
                        );
                      }
                      if (line.startsWith('- ')) {
                        return (
                          <div key={idx} className="ml-3">
                            • {line.substring(2)}
                          </div>
                        );
                      }
                      if (line.trim().length === 0) {
                        return <div key={idx} className="h-1" />;
                      }
                      if (line.startsWith('```')) {
                        return null;
                      }
                      return (
                        <div key={idx} className="leading-relaxed">
                          {line}
                        </div>
                      );
                    })
                  ) : (
                    <p>No content available</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Select a context doc to view
                  </p>
                </div>
              </div>
            )}
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
