'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Bot, User, Send, Github, Check, FolderOpen, Folder, FileCode, ChevronRight, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChatPreviewPanel } from '@/components/dossier/chat-preview-panel';
import { useProjectFiles, type FileNode } from '@/lib/hooks/use-project-files';
import { githubOAuthStartHref, GITHUB_OAUTH_REPO_PICKER_EVENT } from '@/lib/github/oauth-client';

function repoUrlToDisplayName(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+/, '').replace(/\.git$/, '');
    return path || url;
  } catch {
    return url;
  }
}

interface ProjectInfo {
  name: string;
  description: string | null;
  status: 'active' | 'planning' | 'completed';
  repo_url?: string | null;
}

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
}

function normalizePreviewErrors(
  errs: string[] | Array<{ action: unknown; reason: string }> | undefined
): Array<{ action: unknown; reason: string }> | undefined {
  if (!errs?.length) return undefined;
  const first = errs[0];
  if (typeof first === 'object' && first !== null && 'reason' in first) {
    return errs as Array<{ action: unknown; reason: string }>;
  }
  return (errs as string[]).map((msg) => ({ action: null as unknown, reason: msg }));
}

interface ChatPreviewResponse {
  status?: "success" | "error";
  responseType?: "clarification" | "actions" | "mixed";
  message?: string;
  actions?: Array<{ id: string; action_type: string; target_ref: unknown; payload: unknown }>;
  preview?: {
    added: { workflows: string[]; activities: string[]; cards: string[] };
    modified: { cards: string[]; artifacts: string[] };
    reordered: string[];
    summary: string;
  } | null;
  errors?: string[] | Array<{ action: unknown; reason: string }>;
  metadata?: { tokens: number; model: string };
}

interface LeftSidebarProps {
  isCollapsed: boolean;
  onToggle: (collapsed: boolean) => void;
  project: ProjectInfo;
  projectId?: string;
  /** Controlled width in pixels for the expanded sidebar */
  width?: number;
  /** Called when user accepts preview and actions are applied (map should refresh) */
  onPlanningApplied?: () => void | Promise<void>;
  /** Called when map data has changed (e.g. workflows scaffolded) so parent can refetch without implying user approval */
  onMapChanged?: () => void | Promise<void>;
  /** Called when planning state changes (thinking or populating) so parent can show global indicators */
  onPlanningStateChange?: (isPlanning: boolean) => void;
  /** Called when user edits the project name, description, context fields, or repo link. May return a Promise that resolves to true if the update succeeded. */
  onProjectUpdate?: (updates: {
    name?: string;
    description?: string | null;
    customer_personas?: string | null;
    tech_stack?: string | null;
    deployment?: string | null;
    design_inspiration?: string | null;
    repo_url?: string | null;
    default_branch?: string;
  }) => void | Promise<boolean | void>;
  /** Open the API keys dialog (e.g. when GitHub token is missing). */
  onOpenApiKeys?: () => void;
}

function FileTreeNode({ node, depth = 0, selectedFiles, onToggleFile }: { node: FileNode; depth?: number; selectedFiles: string[]; onToggleFile: (path: string) => void }) {
  const [isOpen, setIsOpen] = useState(depth < 1);
  const isSelected = selectedFiles.includes(node.path);
  return (
    <div>
      <button
        type="button"
        onClick={() => node.type === 'folder' ? setIsOpen(!isOpen) : onToggleFile(node.path)}
        className={`w-full flex items-center gap-1 py-1 px-1 hover:bg-secondary text-left text-[11px] ${isSelected ? 'bg-primary/10 text-primary' : ''}`}
        style={{ paddingLeft: `${depth * 8 + 4}px` }}
      >
        {node.type === 'folder' ? (
          <>{isOpen ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}{isOpen ? <FolderOpen className="h-3 w-3" /> : <Folder className="h-3 w-3" />}</>
        ) : (
          <><span className="w-2.5" /><FileCode className="h-3 w-3" /></>
        )}
        <span className="truncate flex-1">{node.name}</span>
        {node.type === 'file' && isSelected && <Check className="h-2.5 w-2.5" />}
      </button>
      {node.type === 'folder' && isOpen && node.children?.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} selectedFiles={selectedFiles} onToggleFile={onToggleFile} />
      ))}
    </div>
  );
}

export function LeftSidebar({ isCollapsed, onToggle, project, projectId, width, onPlanningApplied, onMapChanged, onPlanningStateChange, onProjectUpdate, onOpenApiKeys }: LeftSidebarProps) {
  const { data: projectFiles } = useProjectFiles(projectId);
  const contextFileTree = projectFiles && projectFiles.length > 0 ? projectFiles : [];

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['chat', 'github'])
  );
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const THINKING_PHRASES = ['Thinking…', 'Working on it…'];
  const [thinkingPhraseIndex, setThinkingPhraseIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Planning LLM state
  const [pendingPreview, setPendingPreview] = useState<ChatPreviewResponse['preview'] | null>(null);
  const [pendingActions, setPendingActions] = useState<ChatPreviewResponse['actions']>([]);
  const [pendingErrors, setPendingErrors] = useState<ChatPreviewResponse['errors']>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [restoredFromStorage, setRestoredFromStorage] = useState(false);

  // Streaming / two-phase state — persisted so a page refresh between scaffold and populate doesn't lose the confirmation
  const populateStorageKey = projectId ? `dossier_populate_confirm_${projectId}` : null;

  const [populateConfirmWorkflowIds, setPopulateConfirmWorkflowIdsRaw] = useState<string[] | null>(() => {
    if (typeof window === 'undefined' || !projectId) return null;
    try {
      const raw = localStorage.getItem(`dossier_populate_confirm_${projectId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ids: string[]; message: string };
      return Array.isArray(parsed.ids) ? parsed.ids : null;
    } catch {
      return null;
    }
  });

  const [populateOriginalMessage, setPopulateOriginalMessageRaw] = useState<string>(() => {
    if (typeof window === 'undefined' || !projectId) return '';
    try {
      const raw = localStorage.getItem(`dossier_populate_confirm_${projectId}`);
      if (!raw) return '';
      const parsed = JSON.parse(raw) as { ids: string[]; message: string };
      return typeof parsed.message === 'string' ? parsed.message : '';
    } catch {
      return '';
    }
  });

  const setPopulateConfirmWorkflowIds = useCallback((ids: string[] | null) => {
    setPopulateConfirmWorkflowIdsRaw(ids);
    if (!populateStorageKey) return;
    if (ids === null) {
      localStorage.removeItem(populateStorageKey);
      setPopulateOriginalMessageRaw("");
    }
    // storage is written together with populateOriginalMessage via useEffect below
  }, [populateStorageKey]);

  // Sync both fields to localStorage whenever either changes
  useEffect(() => {
    if (!populateStorageKey) return;
    if (populateConfirmWorkflowIds === null) {
      localStorage.removeItem(populateStorageKey);
    } else {
      localStorage.setItem(populateStorageKey, JSON.stringify({ ids: populateConfirmWorkflowIds, message: populateOriginalMessage }));
    }
  }, [populateConfirmWorkflowIds, populateOriginalMessage, populateStorageKey]);

  const [isPopulating, setIsPopulating] = useState(false);
  const [populateProgress, setPopulateProgress] = useState<{ current: number; total: number; workflowTitle?: string } | null>(null);
  
  // Inline editing state for project header
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [draftName, setDraftName] = useState(project.name);
  const [draftDesc, setDraftDesc] = useState(project.description ?? '');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLTextAreaElement>(null);

  // If populateConfirmWorkflowIds was restored from localStorage (page refresh between scaffold and populate),
  // synthesize the preview panel so the user can still click Accept.
  useEffect(() => {
    if (restoredFromStorage) return;
    setRestoredFromStorage(true);
    if (populateConfirmWorkflowIds?.length && pendingPreview === null) {
      const wfIds = populateConfirmWorkflowIds;
      setPendingPreview({
        added: { workflows: wfIds, activities: [], cards: [] },
        modified: { cards: [], artifacts: [] },
        reordered: [],
        summary: `Populate ${wfIds.length} workflow(s) with activities and cards?`,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setIsThinking(false);
    setIsPopulating(false);
    setPopulateProgress(null);
  }, [projectId]);

  useEffect(() => { setDraftName(project.name); }, [project.name]);
  useEffect(() => { setDraftDesc(project.description ?? ''); }, [project.description]);
  useEffect(() => { if (editingName) nameInputRef.current?.focus(); }, [editingName]);
  useEffect(() => { if (editingDesc) descInputRef.current?.focus(); }, [editingDesc]);

  useEffect(() => {
    if (isThinking || isPopulating) {
      setExpandedSections(prev => (prev.has('chat') ? prev : new Set([...prev, 'chat'])));
    }
  }, [isThinking, isPopulating]);

  useEffect(() => {
    onPlanningStateChange?.(isThinking || isPopulating);
  }, [isThinking, isPopulating, onPlanningStateChange]);

  useEffect(() => {
    const active = isThinking || isPopulating;
    const showThinkingPhrase = active && !(isPopulating && populateProgress);
    if (!showThinkingPhrase) return;
    const id = window.setInterval(() => {
      setThinkingPhraseIndex((i) => (i + 1) % THINKING_PHRASES.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, [isThinking, isPopulating, populateProgress, THINKING_PHRASES.length]);

  const commitName = useCallback(() => {
    setEditingName(false);
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === project.name) { setDraftName(project.name); return; }
    onProjectUpdate?.({ name: trimmed });
  }, [draftName, project.name, onProjectUpdate]);

  const commitDesc = useCallback(() => {
    setEditingDesc(false);
    const trimmed = draftDesc.trim();
    if (trimmed === (project.description ?? '')) return;
    onProjectUpdate?.({ description: trimmed || null });
  }, [draftDesc, project.description, onProjectUpdate]);

  // GitHub connect dialog state
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectMode, setConnectMode] = useState<'link' | 'create'>('link');
  const [repos, setRepos] = useState<Array<{ full_name: string; html_url: string; private: boolean; default_branch?: string }>>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPrivate, setCreatePrivate] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [reposErrorKind, setReposErrorKind] = useState<'no_token' | 'bad_token' | 'other' | null>(null);
  const [connectSubmitting, setConnectSubmitting] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [selectedContextFiles, setSelectedContextFiles] = useState<string[]>([]);
  /** True when /api/github/user succeeds but this project has no repo_url yet */
  const [githubSignedInNoRepo, setGithubSignedInNoRepo] = useState<boolean | null>(null);

  const repoUrl = project.repo_url ?? null;
  const githubConnected = !!repoUrl;
  const repoName = repoUrlToDisplayName(repoUrl);

  useEffect(() => {
    if (githubConnected) {
      setGithubSignedInNoRepo(null);
      return;
    }
    let cancelled = false;
    setGithubSignedInNoRepo(null);
    fetch('/api/github/user')
      .then((r) => {
        if (!cancelled) setGithubSignedInNoRepo(r.ok);
      })
      .catch(() => {
        if (!cancelled) setGithubSignedInNoRepo(false);
      });
    return () => {
      cancelled = true;
    };
  }, [githubConnected]);

  const openConnectDialog = useCallback(() => {
    setConnectError(null);
    setReposErrorKind(null);
    setConnectDialogOpen(true);
    if (connectMode === 'link') {
      setReposLoading(true);
      setRepos([]);
      fetch('/api/github/repos')
        .then(async (r) => {
          const data = (await r.json().catch(() => ({}))) as {
            error?: string;
            repos?: Array<{ full_name: string; html_url: string; private: boolean }>;
          };
          if (!r.ok) {
            if (r.status === 503) setReposErrorKind('no_token');
            else if (r.status === 401) setReposErrorKind('bad_token');
            else setReposErrorKind('other');
            setConnectError(typeof data.error === 'string' ? data.error : 'Failed to load repositories.');
            setRepos([]);
            return;
          }
          setReposErrorKind(null);
          setConnectError(null);
          setRepos(data.repos ?? []);
        })
        .catch(() => {
          setReposErrorKind('other');
          setConnectError('Failed to load repositories.');
        })
        .finally(() => setReposLoading(false));
    } else {
      setCreateName('');
      setCreatePrivate(false);
    }
  }, [connectMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      if (project.repo_url?.trim()) return;
      setExpandedSections((prev) => {
        const next = new Set(prev);
        next.add('github');
        return next;
      });
      openConnectDialog();
    };
    window.addEventListener(GITHUB_OAUTH_REPO_PICKER_EVENT, handler);
    return () => window.removeEventListener(GITHUB_OAUTH_REPO_PICKER_EVENT, handler);
  }, [project.repo_url, openConnectDialog]);

  const linkRepo = useCallback(
    async (htmlUrl: string, defaultBranch?: string) => {
      setConnectSubmitting(true);
      setConnectError(null);
      try {
        const result = await onProjectUpdate?.({ repo_url: htmlUrl, default_branch: defaultBranch });
        if (result !== false) setConnectDialogOpen(false);
        else setConnectError('Failed to link repository.');
      } catch {
        setConnectError('Failed to link repository.');
      }
      setConnectSubmitting(false);
    },
    [onProjectUpdate]
  );

  const createAndLinkRepo = useCallback(async () => {
    const name = createName.trim();
    if (!name) {
      setConnectError('Enter a repository name.');
      return;
    }
    setConnectSubmitting(true);
    setConnectError(null);
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, private: createPrivate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConnectError(data.error ?? 'Failed to create repository.');
        setConnectSubmitting(false);
        return;
      }
      const linked = await onProjectUpdate?.({ repo_url: data.html_url, default_branch: data.default_branch });
      if (linked !== false) setConnectDialogOpen(false);
      else setConnectError('Repository created but failed to link to project.');
    } catch {
      setConnectError('Failed to create repository.');
    }
    setConnectSubmitting(false);
  }, [createName, createPrivate, onProjectUpdate]);

  const disconnectRepo = useCallback(() => {
    onProjectUpdate?.({ repo_url: null });
  }, [onProjectUpdate]);

  const handleSyncWithGitHub = useCallback(async () => {
    if (!projectId) return;
    setSyncLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/repo/sync`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      const msg = data?.error ?? (res.ok ? '' : 'Sync failed.');
      const { toast } = await import('sonner');
      if (res.ok) {
        toast.success(`Local ${data.branch ?? 'main'} synced with GitHub.`);
        await onPlanningApplied?.();
      } else {
        toast.error(msg || 'Sync failed.');
      }
    } catch {
      const { toast } = await import('sonner');
      toast.error('Sync failed.');
    } finally {
      setSyncLoading(false);
    }
  }, [projectId, onPlanningApplied]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);

  const addMessage = (role: 'user' | 'agent', content: string) => {
    if (!content?.trim()) return;
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages(prev => [...prev, { id, role, content }]);
  };

  const lastRefetchRef = useRef<number>(0);
  const throttledPlanningApplied = useCallback(() => {
    const now = Date.now();
    if (now - lastRefetchRef.current < 800) return;
    lastRefetchRef.current = now;
    onPlanningApplied?.();
  }, [onPlanningApplied]);

  const handleSubmit = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    addMessage('user', text);
    setInput('');
    setIsThinking(true);

    if (!projectId) {
      setIsThinking(false);
      addMessage('agent', 'No project selected. Please select or create a project first.');
      return;
    }

    // `messages` is the pre-submit snapshot, so the current turn is not included in history.
    const conversationHistory = messages
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationHistory }),
      });

      const data = await res.json().catch(() => null) as (ChatPreviewResponse & {
        applied?: number;
        workflow_ids_created?: string[];
      }) | null;

      if (!data) {
        addMessage('agent', `Server returned a non-JSON response (${res.status}). Check server logs.`);
        return;
      }

      if (!res.ok) {
        addMessage('agent', data.message ?? 'Planning service error. Try again.');
        return;
      }

      if (data.responseType === 'clarification') {
        addMessage('agent', data.message || 'Could you tell me more about what you want to build?');
      } else if (data.workflow_ids_created?.length) {
        addMessage('agent', data.message || `Created ${data.workflow_ids_created.length} workflow(s).`);
        await onMapChanged?.();
        addMessage('agent', `Your workflows are set up. Next, **review and approve the project** using the Approve Project button above the map. This creates core product documents (architecture, data contracts, design system) and sets up the directory structure. After that, you can populate each workflow with activities and cards.`);
      } else if ((data.applied ?? 0) > 0) {
        addMessage('agent', data.message || `Applied ${data.applied} change(s).`);
        await onPlanningApplied?.();
      } else if (data.message) {
        addMessage('agent', data.message);
      } else {
        addMessage('agent', "I wasn't able to generate a structure yet. Could you tell me more?");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Planning service unavailable. Check your connection.';
      addMessage('agent', msg);
    } finally {
      setIsThinking(false);
    }
  };

  const handleAcceptPreview = async () => {
    if (!projectId) return;

    if (populateConfirmWorkflowIds?.length) {
      setPendingPreview(null);
      setPopulateConfirmWorkflowIds(null);
      setIsPopulating(true);
      const workflowIds = [...populateConfirmWorkflowIds];
      const total = workflowIds.length;

      for (let i = 0; i < workflowIds.length; i++) {
        const wfId = workflowIds[i];
        setPopulateProgress({ current: i + 1, total });

        try {
          const res = await fetch(`/api/projects/${projectId}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: populateOriginalMessage || 'Populate this workflow with activities and cards',
              mode: 'populate',
              workflow_id: wfId,
            }),
          });
          const data = (await res.json().catch(() => null)) as { status?: string; message?: string; applied?: number } | null;
          if (!data || !res.ok) {
            addMessage('agent', data?.message ?? `Failed to populate workflow ${i + 1}/${total}.`);
            continue;
          }
          throttledPlanningApplied();
        } catch {
          addMessage('agent', `Error populating workflow ${i + 1}/${total}.`);
        }
      }

      setPopulateProgress(null);
      setIsPopulating(false);
      addMessage('agent', `Populated ${total} workflow(s) with activities and cards.`);
      onPlanningApplied?.();
      return;
    }

    if (!pendingActions?.length) return;
    setIsApplying(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions: pendingActions }),
      });
      const data = await res.json().catch(() => null);
      if (data && res.ok && (data.applied ?? 0) > 0) {
        setPendingPreview(null);
        setPendingActions([]);
        setPendingErrors([]);
        onPlanningApplied?.();
        addMessage('agent', `Applied ${data.applied ?? (pendingActions?.length ?? 0)} change(s).`);
      } else {
        addMessage('agent', data.message ?? data.details?.validation?.[0] ?? 'Failed to apply changes.');
      }
    } catch {
      addMessage('agent', 'Failed to apply changes. Try again.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleCancelPreview = () => {
    setPendingPreview(null);
    setPendingActions([]);
    setPendingErrors([]);
    setPopulateConfirmWorkflowIds(null);
  };

  const toggleContextFile = (path: string) => {
    setSelectedContextFiles(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);
  };

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
          className="h-8 w-8 p-0 relative"
        >
          <ChevronUp className="h-4 w-4" />
          {(isThinking || isPopulating) && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary animate-pulse" aria-hidden />
          )}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="border-r border-grid-line bg-background overflow-y-auto flex flex-col"
      style={{ width: width ?? 256, flexShrink: 0 }}
    >
      {/* Header — editable project name & description */}
      <div className="p-4 border-b border-grid-line">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            {editingName ? (
              <input
                ref={nameInputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setDraftName(project.name); setEditingName(false); } }}
                className="w-full font-mono text-sm font-bold uppercase tracking-wider text-foreground bg-secondary border border-grid-line rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="group flex items-center gap-1.5 text-left w-full"
              >
                <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground truncate">
                  {project.name}
                </h2>
                <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            )}
            <span className={`inline-block mt-2 px-2 py-1 text-xs uppercase tracking-wider font-mono ${statusColors[project.status]}`}>
              {project.status}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggle(true)}
            className="h-6 w-6 p-0 shrink-0"
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
        </div>
        {editingDesc ? (
          <textarea
            ref={descInputRef}
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
            onBlur={commitDesc}
            onKeyDown={(e) => { if (e.key === 'Escape') { setDraftDesc(project.description ?? ''); setEditingDesc(false); } }}
            rows={3}
            className="w-full text-xs text-foreground leading-relaxed mt-2 bg-secondary border border-grid-line rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
            placeholder="Describe your project..."
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingDesc(true)}
            className="group flex items-start gap-1.5 text-left w-full mt-2"
          >
            <p className="text-xs text-muted-foreground leading-relaxed flex-1">
              {project.description || 'Click to add a description...'}
            </p>
            <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
          </button>
        )}
      </div>


      {/* Agent Chat Section */}
      <div className="border-b border-grid-line flex-1 flex flex-col min-h-0">
        <button
          onClick={() => toggleSection('chat')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary transition-colors shrink-0"
        >
          <div className="flex items-center gap-2">
            <Bot className={`h-3.5 w-3.5 ${(isThinking || isPopulating) ? 'animate-pulse' : ''}`} />
            <span className="text-xs uppercase tracking-wider font-mono font-bold">Agent</span>
            {(isThinking || isPopulating) && (
              <span className="text-[10px] text-muted-foreground font-normal normal-case tracking-normal">
                {isPopulating && populateProgress
                  ? `Populating ${populateProgress.current}/${populateProgress.total}…`
                  : 'Creating map…'}
              </span>
            )}
          </div>
          {expandedSections.has('chat') ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>
        {expandedSections.has('chat') && (
          <div className="flex-1 flex flex-col min-h-0 border-t border-grid-line">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-[200px]">
              {messages.length === 0 && (
                <div className="text-center py-4">
                  <Bot className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-[11px] text-muted-foreground">Describe your idea or request changes</p>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                    {msg.role === 'user' ? <User className="h-2.5 w-2.5" /> : <Bot className="h-2.5 w-2.5" />}
                  </div>
                  <div className={`max-w-[85%] rounded px-2 py-1.5 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                    <p className="text-[11px] leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))}
              {(isThinking || isPopulating) && (
                <div className="flex gap-2">
                  <div className="h-5 w-5 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <Bot className="h-2.5 w-2.5 animate-pulse" />
                  </div>
                  <div className="bg-secondary rounded px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="flex gap-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground ml-1">
                        {isPopulating && populateProgress
                          ? `Populating workflow ${populateProgress.current}/${populateProgress.total}…`
                          : THINKING_PHRASES[thinkingPhraseIndex]}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {pendingPreview && (
                <ChatPreviewPanel
                  preview={pendingPreview}
                  errors={normalizePreviewErrors(pendingErrors)}
                  onAccept={handleAcceptPreview}
                  onCancel={handleCancelPreview}
                  isApplying={isApplying || isPopulating}
                />
              )}
              <div ref={messagesEndRef} />
            </div>
            
            {/* Input */}
            <div className="p-3 border-t border-grid-line">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSubmit())}
                  placeholder="Describe your idea or ask for changes..."
                  className="flex-1 px-2 py-1.5 text-xs bg-secondary border border-grid-line rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
                  disabled={isThinking || isPopulating}
                />
                <Button size="sm" className="h-7 w-7 p-0" onClick={handleSubmit} disabled={!input.trim() || isThinking || isPopulating}>
                  <Send className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* GitHub Section */}
      <div className="border-b border-grid-line">
        <button
          onClick={() => toggleSection('github')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary transition-colors"
        >
          <div className="flex items-center gap-2">
            <Github className="h-3.5 w-3.5" />
            <span className="text-xs uppercase tracking-wider font-mono font-bold">Repository</span>
          </div>
          {expandedSections.has('github') ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>
        {expandedSections.has('github') && (
          <div className="px-3 pb-3 border-t border-grid-line pt-3">
            {githubConnected ? (
              <>
                <div className="flex items-center gap-2 px-2 py-1.5 bg-secondary rounded border border-grid-line mb-2">
                  <Github className="h-3 w-3 shrink-0" />
                  <span className="text-[11px] font-mono flex-1 truncate">{repoName}</span>
                  <Check className="h-3 w-3 shrink-0 text-green-500" />
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Select files for context:
                </p>
                <div className="border border-grid-line rounded bg-background max-h-32 overflow-y-auto">
                  {contextFileTree.map((node) => (
                    <FileTreeNode key={node.path} node={node} selectedFiles={selectedContextFiles} onToggleFile={toggleContextFile} />
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-[10px] h-6 mt-2"
                  onClick={handleSyncWithGitHub}
                  disabled={!projectId || syncLoading}
                >
                  {syncLoading ? (
                    <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1.5" />
                  )}
                  Sync with GitHub
                </Button>
                <Button variant="ghost" size="sm" className="w-full text-[10px] h-6 mt-1 text-muted-foreground" onClick={disconnectRepo}>
                  Disconnect repository
                </Button>
              </>
            ) : (
              <>
                <p className="text-[10px] text-muted-foreground mb-2">
                  {githubSignedInNoRepo === true
                    ? 'GitHub is signed in. Choose a repository for this project — you’ll return to the map after you pick one.'
                    : githubSignedInNoRepo === false
                      ? 'Sign in to GitHub from Setup or API keys, then link a repository to use code as context.'
                      : 'Checking GitHub connection…'}
                </p>
                <Button variant="outline" size="sm" className="w-full text-[11px] h-7 bg-transparent" onClick={openConnectDialog}>
                  <Github className="h-3 w-3 mr-1.5" />
                  {githubSignedInNoRepo === true ? 'Choose repository' : 'Link repository'}
                </Button>
              </>
            )}
          </div>
        )}

        <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
          <DialogContent className="sm:max-w-md" showCloseButton={true}>
            <DialogHeader>
              <DialogTitle>Link a GitHub repository</DialogTitle>
              <DialogDescription>
                Choose a repo for this project (you’ll land back on the map when done), or create a new one. Credentials (OAuth or a PAT in{' '}
                <code className="text-[10px] bg-muted px-0.5 rounded">GITHUB_TOKEN</code>) stay on this machine
                under <code className="text-[10px] bg-muted px-0.5 rounded">~/.dossier/config</code>. Revoke access in{' '}
                <a
                  href={
                    process.env.NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID
                      ? `https://github.com/settings/connections/applications/${process.env.NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID}`
                      : 'https://github.com/settings/applications'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  GitHub settings
                </a>
                .
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 py-2">
              <Button
                variant={connectMode === 'link' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setConnectMode('link'); setConnectError(null); }}
              >
                Link existing
              </Button>
              <Button
                variant={connectMode === 'create' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setConnectMode('create'); setConnectError(null); setCreateName(''); setCreatePrivate(false); }}
              >
                Create new
              </Button>
            </div>
            {connectError && (
              <p className="text-xs text-destructive">{connectError}</p>
            )}
            {!reposLoading && reposErrorKind === 'no_token' && (
              <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">GitHub isn&apos;t connected yet.</p>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => {
                      window.location.href = githubOAuthStartHref('/');
                    }}
                  >
                    <Github className="h-3 w-3 mr-1.5" />
                    Connect GitHub
                  </Button>
                  {onOpenApiKeys && (
                    <Button type="button" size="sm" variant="outline" className="w-full text-xs" onClick={() => onOpenApiKeys()}>
                      Open API keys
                    </Button>
                  )}
                </div>
              </div>
            )}
            {!reposLoading && reposErrorKind === 'bad_token' && (
              <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Session expired or token revoked. Reconnect GitHub.</p>
                <Button
                  type="button"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    window.location.href = githubOAuthStartHref('/');
                  }}
                >
                  <Github className="h-3 w-3 mr-1.5" />
                  Reconnect GitHub
                </Button>
              </div>
            )}
            {connectMode === 'link' && (
              <div className="border border-grid-line rounded bg-background max-h-48 overflow-y-auto">
                {reposLoading ? (
                  <p className="p-3 text-xs text-muted-foreground">Loading repositories…</p>
                ) : repos.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    {reposErrorKind ? 'Fix the connection above, then reopen this dialog.' : 'No repositories found.'}
                  </p>
                ) : (
                  <ul className="py-1">
                    {repos.map((r) => (
                      <li key={r.full_name}>
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] hover:bg-secondary"
                          onClick={() => linkRepo(r.html_url, r.default_branch)}
                          disabled={connectSubmitting}
                        >
                          <Github className="h-3 w-3 shrink-0" />
                          <span className="font-mono truncate flex-1">{r.full_name}</span>
                          {r.private && <span className="text-[10px] text-muted-foreground">Private</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {connectMode === 'create' && (
              <div className="space-y-2">
                <label className="text-xs font-medium">Repository name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="my-app"
                  className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs font-mono"
                />
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createPrivate}
                    onChange={(e) => setCreatePrivate(e.target.checked)}
                  />
                  Private repository
                </label>
                <DialogFooter showCloseButton={false}>
                  <Button variant="outline" size="sm" onClick={() => setConnectDialogOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={createAndLinkRepo} disabled={connectSubmitting || !createName.trim()}>
                    {connectSubmitting ? 'Creating…' : 'Create and connect'}
                  </Button>
                </DialogFooter>
              </div>
            )}
            {connectMode === 'link' && !reposLoading && repos.length > 0 && (
              <p className="text-[10px] text-muted-foreground">Click a repository to link it to this project.</p>
            )}
          </DialogContent>
        </Dialog>
      </div>

    </div>
  );
}
