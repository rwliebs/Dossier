"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronRight,
  ChevronDown,
  FileCode,
  Folder,
  FolderOpen,
  FileText,
  GitBranch,
  X,
  Copy,
  ExternalLink,
  Plus,
  Minus,
  Pencil,
} from "lucide-react";
import type { ContextArtifact } from "@/lib/types/ui";
import {
  useProjectFiles,
  type FileNode,
  type ProjectFilesSource,
} from "@/lib/hooks/use-project-files";
import { Skeleton } from "@/components/ui/skeleton";

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeDoc: ContextArtifact | null;
  activeTab: "files" | "docs" | "chat";
  onTabChange: (tab: "files" | "docs" | "chat") => void;
  /** When set, files tab shows live project file tree from planned files */
  projectId?: string;
  /** Controlled width in pixels */
  width?: number;
  /** Project docs to show in the Docs tab list when no doc is selected */
  docsList?: ContextArtifact[];
  /** Called when user selects a doc from the list; pass null to clear selection */
  onSelectDoc?: (doc: ContextArtifact | null) => void;
  /** When set, files tab shows this card's feature branch; null = the project's base branch */
  filesBranchCardId?: string | null;
  /** Called when user switches branch context (null = the project's base branch) */
  onFilesBranchChange?: (cardId: string | null) => void;
  /** The project's default branch name (for example `master`), shown as the Files tab base branch */
  baseBranch?: string;
  /** Card title when filesBranchCardId is set (for display) */
  filesBranchCardTitle?: string;
}

function StatusIndicator({ status }: { status?: FileNode["status"] }) {
  if (!status || status === "unchanged") return null;
  if (status === "added")
    return <Plus className="h-3 w-3 text-green-600 flex-shrink-0" />;
  if (status === "modified")
    return <Pencil className="h-3 w-3 text-amber-600 flex-shrink-0" />;
  if (status === "deleted")
    return <Minus className="h-3 w-3 text-red-600 flex-shrink-0" />;
  return null;
}

function FileTreeNode({
  node,
  depth = 0,
  onFileClick,
}: {
  node: FileNode;
  depth?: number;
  onFileClick?: (path: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(depth < 2);

  const handleClick = () => {
    if (node.type === "folder") {
      setIsOpen(!isOpen);
    } else if (onFileClick) {
      onFileClick(node.path);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
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
        <StatusIndicator status={node.status} />
        <span className="text-xs text-foreground truncate">{node.name}</span>
      </button>
      {node.type === "folder" && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileClick={onFileClick}
            />
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
  activeTab,
  onTabChange,
  projectId,
  width,
  docsList = [],
  onSelectDoc,
  filesBranchCardId = null,
  onFilesBranchChange,
  filesBranchCardTitle,
  baseBranch,
}: RightPanelProps) {
  const filesSource: ProjectFilesSource = "repo";
  const [selectedRepoFilePath, setSelectedRepoFilePath] = useState<string | null>(null);
  const [selectedRepoFileContent, setSelectedRepoFileContent] = useState<string | null>(null);
  const [repoFileLoading, setRepoFileLoading] = useState(false);

  const {
    data: projectFiles,
    loading: filesLoading,
    error: filesError,
    fetchFileContent,
  } = useProjectFiles(projectId, filesSource, filesBranchCardId ?? undefined);

  const fileTree = projectFiles && projectFiles.length > 0 ? projectFiles : [];

  const handleRepoFileClick = useCallback(
    async (path: string) => {
      if (!fetchFileContent) return;
      setSelectedRepoFilePath(path);
      setRepoFileLoading(true);
      setSelectedRepoFileContent(null);
      try {
        const content = await fetchFileContent(path);
        setSelectedRepoFileContent(content ?? "");
      } finally {
        setRepoFileLoading(false);
      }
    },
    [fetchFileContent]
  );

  if (!isOpen) return null;

  return (
    <div
      className="border-l border-border bg-background flex flex-col"
      style={{ width: width ?? 320, flexShrink: 0 }}
    >
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
          <div className="h-full flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground min-w-0">
                <GitBranch className="h-3 w-3 flex-shrink-0" />
                {filesBranchCardId ? (
                  <span className="truncate flex items-center gap-1.5">
                    <span>feature</span>
                    {filesBranchCardTitle && (
                      <>
                        <span className="text-foreground/40">•</span>
                        <span className="text-foreground truncate">{filesBranchCardTitle}</span>
                      </>
                    )}
                  </span>
                ) : (
                  <span>{baseBranch ?? ""}</span>
                )}
                {filesLoading && projectId && (
                  <>
                    <span className="text-foreground/40">•</span>
                    <Skeleton className="h-3 w-16 rounded" />
                  </>
                )}
              </div>
              {filesBranchCardId && onFilesBranchChange && (
                <button
                  type="button"
                  onClick={() => onFilesBranchChange(null)}
                  className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground flex-shrink-0"
                  aria-label={`Switch to ${baseBranch ?? "base"} branch`}
                >
                  Show {baseBranch ?? "base"}
                </button>
              )}
            </div>
            {filesError && (
              <div className="px-3 py-2 text-xs text-destructive">
                {filesError}
              </div>
            )}
            <div className="flex-1 flex overflow-hidden min-h-0">
              <ScrollArea className="flex-1 min-w-0">
                <div className="py-2">
                  {filesLoading && projectId ? (
                    <div className="space-y-2 px-3 py-2">
                      <p className="text-[10px] text-muted-foreground animate-in fade-in duration-200">Loading files…</p>
                      <div className="space-y-1">
                      <Skeleton className="h-6 w-32 rounded" />
                      <Skeleton className="h-6 w-40 rounded ml-3" />
                      <Skeleton className="h-6 w-36 rounded ml-3" />
                      <Skeleton className="h-6 w-28 rounded ml-6" />
                      <Skeleton className="h-6 w-24 rounded" />
                    </div>
                    </div>
                  ) : (
                    fileTree.map((node) => (
                      <FileTreeNode
                        key={node.path}
                        node={node}
                        onFileClick={
                          filesSource === "repo" ? handleRepoFileClick : undefined
                        }
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
              {filesSource === "repo" && selectedRepoFilePath && (
                <div className="w-1/2 border-l border-border flex flex-col min-w-0">
                  <div className="px-2 py-1.5 border-b border-border text-[10px] font-mono text-muted-foreground truncate">
                    {selectedRepoFilePath}
                  </div>
                  <ScrollArea className="flex-1 p-2">
                    {repoFileLoading ? (
                      <Skeleton className="h-4 w-full rounded" />
                    ) : (
                      <pre className="text-xs font-mono whitespace-pre-wrap break-words text-foreground">
                        {selectedRepoFileContent ?? "No content in this file."}
                      </pre>
                    )}
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "docs" && (
          <ScrollArea className="h-full">
            {activeDoc ? (
              <div className="p-4 space-y-3">
                {docsList.length > 0 && onSelectDoc && (
                  <button
                    type="button"
                    onClick={() => onSelectDoc(null)}
                    className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1"
                  >
                    ← All docs
                  </button>
                )}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-mono font-bold text-sm text-foreground">{activeDoc.title ?? activeDoc.name}</h3>
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
                    <p className="text-muted-foreground">No content in this document.</p>
                  )}
                </div>
              </div>
            ) : docsList.length > 0 ? (
              <div className="p-3 space-y-4">
                {(() => {
                  const projectDocs = docsList.filter((d) => !d.id.startsWith("ref:"));
                  const referenceDocs = docsList.filter((d) => d.id.startsWith("ref:"));
                  const DocButton = ({ doc }: { doc: (typeof docsList)[0] }) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => onSelectDoc?.(doc)}
                      className="block w-full text-left text-xs px-3 py-2 rounded-md border border-border bg-background hover:bg-accent/50 hover:border-accent-foreground/20 transition-colors text-foreground"
                    >
                      <span className="font-medium truncate block">{doc.title ?? doc.name}</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{doc.type}</span>
                    </button>
                  );
                  return (
                    <>
                      {projectDocs.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-2">
                            Project documents
                          </p>
                          <div className="space-y-1">
                            {projectDocs.map((doc) => (
                              <DocButton key={doc.id} doc={doc} />
                            ))}
                          </div>
                        </div>
                      )}
                      {referenceDocs.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-2">
                            Reference docs
                          </p>
                          <div className="space-y-1">
                            {referenceDocs.map((doc) => (
                              <DocButton key={doc.id} doc={doc} />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-[220px] animate-in fade-in duration-300">
                  <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Select a context doc to view
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    Pick one from the list, or add one via the Agent chat.
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
