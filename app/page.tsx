'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/dossier/header';
import { LeftSidebar } from '@/components/dossier/left-sidebar';
import { WorkflowBlock } from '@/components/dossier/workflow-block';
import { RightPanel } from '@/components/dossier/right-panel';
import { ConfirmDeleteDialog } from '@/components/dossier/confirm-delete-dialog';
import { Sparkles, PanelRightOpen } from 'lucide-react';
import type { ContextArtifact, CardKnowledgeForDisplay } from '@/lib/types/ui';
import { useMapSnapshot, useCardKnowledge, useCardPlannedFiles, useCardContextArtifacts, useArtifacts, useProjectFiles, useSubmitAction, useTriggerBuild, fetchRefDocContent } from '@/lib/hooks';
import { useProjects } from '@/lib/hooks/use-projects';
import { MapErrorBoundary } from '@/components/dossier/map-error-boundary';
import { ChatErrorBoundary } from '@/components/dossier/chat-error-boundary';
import { MapSkeleton } from '@/components/dossier/map-skeleton';
import {
  GITHUB_OAUTH_REPO_PICKER_EVENT,
  GITHUB_OAUTH_REOPEN_KEYS_SESSION,
} from '@/lib/github/oauth-client';

const PROJECT_STORAGE_KEY = 'dossier_project_id';

const MAP_LOADING_MESSAGES = [
  'Loading map…',
  'Structuring workflows…',
  'Preparing your canvas…',
];

function getStoredProjectId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(PROJECT_STORAGE_KEY) ?? '';
}

function setStoredProjectId(id: string): void {
  if (typeof window === 'undefined') return;
  if (id) localStorage.setItem(PROJECT_STORAGE_KEY, id);
  else localStorage.removeItem(PROJECT_STORAGE_KEY);
}

function DossierPageInner() {
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get('project');
  const defaultProjectId = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? '';
  const [projectIdState, setProjectIdState] = useState<string>(() => getStoredProjectId() || defaultProjectId);
  const { data: projects } = useProjects();

  useEffect(() => {
    if (urlProjectId && urlProjectId !== projectIdState) {
      setStoredProjectId(urlProjectId);
      setProjectIdState(urlProjectId);
      return;
    }
    const stored = getStoredProjectId();
    if (stored && stored !== projectIdState) {
      setProjectIdState(stored);
      return;
    }
    if (!projectIdState && projects?.length) {
      const firstId = projects[0].id;
      setStoredProjectId(firstId);
      setProjectIdState(firstId);
    }
  }, [projects, projectIdState, urlProjectId]);

  const projectId = projectIdState || defaultProjectId;

  const [viewMode, setViewMode] = useState<'functionality' | 'architecture'>('functionality');
  const [agentStatus, setAgentStatus] = useState<'idle' | 'building' | 'reviewing'>('idle');
  const { data: snapshot, loading: mapLoading, error: mapError, refetch } = useMapSnapshot(
    projectId || undefined
  );

  // hasContent: true only when activities have been populated (not just scaffolded)
  const hasContent = snapshot?.workflows?.some((wf) => wf.activities.length > 0) ?? false;
  // appMode drives which layout to show — active whenever workflows exist so the canvas can render empty-state guidance
  const appMode = (snapshot?.workflows?.length ?? 0) > 0 ? 'active' : 'ideation';
  const { submit: submitAction } = useSubmitAction(appMode === 'active' ? projectId : undefined);
  const { triggerBuild, resumeBlocked } = useTriggerBuild(appMode === 'active' ? projectId : undefined);

  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const { data: cardKnowledge, loading: cardKnowledgeLoading, refetch: refetchCardKnowledge } = useCardKnowledge(
    appMode === 'active' ? projectId : undefined,
    expandedCardId ?? undefined
  );
  const { data: cardPlannedFiles, loading: cardPlannedFilesLoading, refetch: refetchCardPlannedFiles } = useCardPlannedFiles(
    appMode === 'active' ? projectId : undefined,
    expandedCardId ?? undefined
  );
  const { data: cardContextArtifacts, loading: cardContextArtifactsLoading, refetch: refetchCardContextArtifacts } = useCardContextArtifacts(
    appMode === 'active' ? projectId : undefined,
    expandedCardId ?? undefined
  );
  const { data: projectArtifacts, refetch: refetchArtifacts } = useArtifacts(appMode === 'active' ? projectId : undefined);
  const { data: projectFilesTree } = useProjectFiles(appMode === 'active' ? projectId : undefined);
  const cardKnowledgeLoadingState = cardKnowledgeLoading || cardPlannedFilesLoading || cardContextArtifactsLoading;

  const getCardKnowledgeLoading = useCallback(
    (cardId: string): boolean =>
      cardId === expandedCardId && cardKnowledgeLoadingState,
    [expandedCardId, cardKnowledgeLoadingState]
  );

  const getCardKnowledge = useCallback(
    (cardId: string): CardKnowledgeForDisplay | undefined => {
      if (cardId !== expandedCardId) return undefined;
      const card = snapshot?.workflows
        .flatMap((wf) => wf.activities.flatMap((a) => a.cards))
        .find((c) => c.id === cardId);
      const out: CardKnowledgeForDisplay = {};
      out.requirements = cardKnowledge?.requirements ?? [];
      out.contextArtifacts = cardContextArtifacts ?? [];
      out.plannedFiles = cardPlannedFiles ?? [];
      if (cardKnowledge?.facts?.length) out.facts = cardKnowledge.facts;
      if (cardKnowledge?.assumptions?.length) out.assumptions = cardKnowledge.assumptions;
      if (cardKnowledge?.questions?.length) out.questions = cardKnowledge.questions;
      if (card?.quick_answer != null) out.quickAnswer = card.quick_answer;
      return out;
    },
    [expandedCardId, cardKnowledge, cardContextArtifacts, cardPlannedFiles, snapshot]
  );

  function flattenFilePaths(nodes: { path?: string; type?: string; children?: unknown[] }[] | null, acc: string[] = []): string[] {
    if (!nodes) return acc;
    for (const n of nodes) {
      if (n.type === 'file' && n.path) acc.push(n.path);
      if (n.children?.length) flattenFilePaths(n.children as { path?: string; type?: string; children?: unknown[] }[], acc);
    }
    return acc;
  }
  const availableFilePaths = projectFilesTree ? flattenFilePaths(projectFilesTree) : [];

  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [apiKeysOpen, setApiKeysOpen] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<'files' | 'docs' | 'chat'>('files');
  const [selectedDoc, setSelectedDoc] = useState<ContextArtifact | null>(null);
  const [filesBranchCardId, setFilesBranchCardId] = useState<string | null>(null);

  const handleSelectProjectId = useCallback((id: string) => {
    setStoredProjectId(id);
    setProjectIdState(id);
    setExpandedCardId(null);
    setFilesBranchCardId(null);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('github_oauth') !== 'success') return;
    try {
      if (sessionStorage.getItem(GITHUB_OAUTH_REOPEN_KEYS_SESSION) === '1') {
        sessionStorage.removeItem(GITHUB_OAUTH_REOPEN_KEYS_SESSION);
        setApiKeysOpen(true);
      } else {
        queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent(GITHUB_OAUTH_REPO_PICKER_EVENT));
        });
      }
    } catch {
      /* ignore */
    }
    void import('sonner').then(({ toast }) => {
      toast.success('GitHub connected.');
    });
    const url = new URL(window.location.href);
    url.searchParams.delete('github_oauth');
    window.history.replaceState({}, '', url.pathname + url.search);
  }, []);

  const [mapLoadingMessageIndex, setMapLoadingMessageIndex] = useState(0);
  useEffect(() => {
    if (!mapLoading) return;
    const id = window.setInterval(() => {
      setMapLoadingMessageIndex((i) => (i + 1) % MAP_LOADING_MESSAGES.length);
    }, 2500);
    return () => window.clearInterval(id);
  }, [mapLoading]);

  const LEFT_WIDTH_KEY = 'dossier_left_sidebar_width';
  const RIGHT_WIDTH_KEY = 'dossier_right_panel_width';
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 256;
    return Number(localStorage.getItem(LEFT_WIDTH_KEY)) || 256;
  });
  const [rightWidth, setRightWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 320;
    return Number(localStorage.getItem(RIGHT_WIDTH_KEY)) || 320;
  });

  const dragging = useRef<'left' | 'right' | null>(null);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const handleResizeMouseDown = useCallback((side: 'left' | 'right', e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = side;
    dragStartX.current = e.clientX;
    dragStartWidth.current = side === 'left' ? leftWidth : rightWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (dragging.current === 'left') {
        const delta = ev.clientX - dragStartX.current;
        const next = Math.max(180, Math.min(520, dragStartWidth.current + delta));
        setLeftWidth(next);
        localStorage.setItem(LEFT_WIDTH_KEY, String(next));
      } else if (dragging.current === 'right') {
        const delta = dragStartX.current - ev.clientX;
        const next = Math.max(220, Math.min(640, dragStartWidth.current + delta));
        setRightWidth(next);
        localStorage.setItem(RIGHT_WIDTH_KEY, String(next));
      }
    };

    const onMouseUp = () => {
      dragging.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [leftWidth, rightWidth]);

  const handleBuildCard = useCallback(
    async (cardId: string) => {
      setBuildingCardId(cardId);
      try {
        const result = await triggerBuild({ scope: 'card', card_id: cardId });
        const { toast } = await import('sonner');
        if (result.outcomeType === 'decision_required') {
          toast.warning(result.message ?? result.error ?? 'Decision required before build can continue');
        } else if (result.runId && result.outcomeType === 'success') {
          toast.success(result.message ?? 'Build started — agent is working');
          setFilesBranchCardId(cardId);
          setRightPanelTab('files');
          setRightPanelOpen(true);
          refetch();
        } else {
          toast.error(result.message ?? result.error ?? 'Failed to trigger build');
        }
      } finally {
        setBuildingCardId(null);
      }
    },
    [triggerBuild, refetch]
  );

  const handleResumeBlockedCard = useCallback(
    async (cardId: string) => {
      setBuildingCardId(cardId);
      try {
        const result = await resumeBlocked(cardId);
        const { toast } = await import('sonner');
        if (result.outcomeType === 'success') {
          toast.success(result.message ?? 'Build resumed — agent is working');
          setFilesBranchCardId(cardId);
          setRightPanelTab('files');
          setRightPanelOpen(true);
          refetch();
        } else {
          toast.error(result.message ?? result.error ?? 'Failed to resume build');
        }
      } finally {
        setBuildingCardId(null);
      }
    },
    [resumeBlocked, refetch]
  );

  const handleShowCardFiles = useCallback((cardId: string) => {
    setFilesBranchCardId(cardId);
    setRightPanelTab('files');
    setRightPanelOpen(true);
  }, []);

  const handleCardAction = useCallback(
    (cardId: string, action: string) => {
      if (action === 'build') {
        handleBuildCard(cardId);
        return;
      }
      if (action === 'monitor' || action === 'test') {
        setFilesBranchCardId(cardId);
        setRightPanelTab('files');
        setRightPanelOpen(true);
      } else if (action === 'reply') {
        setExpandedCardId(cardId);
      } else if (action === 'merge') {
        const repoUrl = snapshot?.project?.repo_url;
        if (!projectId) return;
        import('sonner').then(({ toast }) => {
          fetch(`/api/projects/${projectId}/cards/${cardId}/push`, { method: 'POST' })
            .then(async (res) => {
              const body = await res.json().catch(() => ({}));
              const msg = body?.error ?? (res.ok ? '' : 'Push failed.');
              if (res.ok) {
                if (repoUrl) window.open(repoUrl, '_blank', 'noopener,noreferrer');
                toast.success('Branch pushed to GitHub. Create a pull request there to merge.');
              } else {
                toast.error(msg || 'Push failed.');
              }
            })
            .catch(() => toast.error('Push failed.'));
        });
      }
    },
    [projectId, snapshot?.project?.repo_url, handleBuildCard]
  );

  const [populatingWorkflowId, setPopulatingWorkflowId] = useState<string | null>(null);
  const handlePopulateWorkflow = useCallback(
    async (workflowId: string, workflowTitle: string, workflowDescription: string | null) => {
      if (!projectId) return;
      setPopulatingWorkflowId(workflowId);
      try {
        const parts: string[] = [`Add activities and cards for ${workflowTitle}`];
        if (workflowDescription) parts.push(`Workflow: ${workflowDescription}`);
        if (snapshot?.project?.description) parts.push(`Project: ${snapshot.project.description}`);
        const message = parts.join('. ');
        const res = await fetch(`/api/projects/${projectId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, mode: 'populate', workflow_id: workflowId }),
        });
        let data: {
          status?: string;
          message?: string;
          applied?: number;
          error?: string;
        };
        try {
          data = await res.json();
        } catch {
          const { toast } = await import('sonner');
          toast.error(`Populate failed (${res.status}): server returned a non-JSON response.`);
          setPopulatingWorkflowId(null);
          return;
        }
        if (!res.ok) {
          const msg = data.message ?? data.error ?? `Populate failed (${res.status})`;
          const { toast } = await import('sonner');
          toast.error(msg);
          setPopulatingWorkflowId(null);
          return;
        }
        if ((data.applied ?? 0) === 0) {
          const { toast } = await import('sonner');
          toast.warning(
            'No activities or cards were generated. Ensure the project has a description and try again. If it persists, try adding more context in the Agent chat or use a stronger model (e.g. Sonnet).'
          );
        }
        refetch();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Populate failed';
        const { toast } = await import('sonner');
        toast.error(msg);
      } finally {
        setPopulatingWorkflowId(null);
      }
    },
    [projectId, snapshot?.project?.description, refetch]
  );

  const [finalizingProject, setFinalizingProject] = useState(false);
  const [finalizeProgress, setFinalizeProgress] = useState('');
  const [finalizingCardId, setFinalizingCardId] = useState<string | null>(null);
  const [buildingCardId, setBuildingCardId] = useState<string | null>(null);
  const [cardFinalizeProgress, setCardFinalizeProgress] = useState('');
  const previousBuildStatesRef = useRef<Map<string, string | null>>(new Map());
  const previousCardsFingerprintRef = useRef<string | null>(null);

  const hasActiveBuilds = snapshot?.workflows.some((wf) =>
    wf.activities.some((activity) =>
      activity.cards.some((card) =>
        card.build_state === 'queued' || card.build_state === 'running' || card.build_state === 'blocked'
      )
    )
  ) ?? false;

  const hadActiveBuildsRef = useRef(false);
  useEffect(() => {
    if (hasActiveBuilds) hadActiveBuildsRef.current = true;
  }, [hasActiveBuilds]);

  useEffect(() => {
    if (!projectId || !hasActiveBuilds) {
      // When transitioning from active to inactive, do one final refetch to catch completion
      if (hadActiveBuildsRef.current && !hasActiveBuilds) {
        hadActiveBuildsRef.current = false;
        refetch();
      }
      return;
    }
    const intervalId = window.setInterval(() => {
      refetch();
    }, 2000);
    return () => window.clearInterval(intervalId);
  }, [projectId, hasActiveBuilds, refetch]);

  useEffect(() => {
    if (!snapshot) return;
    const nextStates = new Map<string, string | null>();
    const transitionMessages: Array<{ type: 'success' | 'error' | 'decision_required'; text: string }> = [];

    for (const workflow of snapshot.workflows) {
      for (const activity of workflow.activities) {
        for (const card of activity.cards) {
          const prev = previousBuildStatesRef.current.get(card.id) ?? null;
          const next = card.build_state ?? null;
          nextStates.set(card.id, next);

          if (prev === next) continue;
          if (next === 'completed' && prev && prev !== 'completed') {
            transitionMessages.push({
              type: 'success',
              text: `"${card.title}" build completed.`,
            });
          } else if (next === 'failed' && prev && prev !== 'failed') {
            transitionMessages.push({
              type: 'error',
              text: `"${card.title}" build failed. Open the card for details.`,
            });
          } else if (next === 'blocked' && prev && prev !== 'blocked') {
            transitionMessages.push({
              type: 'decision_required',
              text: `"${card.title}" needs a decision. Open the card questions and provide guidance.`,
            });
          }
        }
      }
    }

    previousBuildStatesRef.current = nextStates;
    if (transitionMessages.length === 0) return;

    void import('sonner').then(({ toast }) => {
      for (const msg of transitionMessages) {
        if (msg.type === 'success') toast.success(msg.text);
        else if (msg.type === 'decision_required') toast.warning(msg.text);
        else toast.error(msg.text);
      }
    });
  }, [snapshot]);

  // When snapshot changes and card content (not build_state) has changed, prompt user to refresh.
  // build_state is excluded so build transitions only trigger the specific toasts above, not this generic one.
  useEffect(() => {
    if (!snapshot) return;
    const fingerprint = JSON.stringify(
      snapshot.workflows.flatMap((wf) =>
        wf.activities.flatMap((a) =>
          a.cards.map((c) => ({
            id: c.id,
            quick_answer: c.quick_answer,
            finalized_at: c.finalized_at,
            last_built_at: c.last_built_at,
          }))
        )
      )
    );
    const prev = previousCardsFingerprintRef.current;
    previousCardsFingerprintRef.current = fingerprint;
    if (prev !== null && prev !== fingerprint) {
      void import('sonner').then(({ toast }) => {
        toast.info('Map has been updated', {
          action: {
            label: 'Refresh',
            onClick: () => {
              refetch();
              refetchArtifacts();
              if (expandedCardId) {
                refetchCardKnowledge();
                refetchCardPlannedFiles();
                refetchCardContextArtifacts();
              }
            },
          },
        });
      });
    }
  }, [snapshot, expandedCardId, refetch, refetchArtifacts, refetchCardKnowledge, refetchCardPlannedFiles, refetchCardContextArtifacts]);

  const handleFinalizeProject = useCallback(
    async () => {
      if (!projectId) return;
      setFinalizingProject(true);
      setFinalizeProgress('Approving…');
      try {
        const res = await fetch(`/api/projects/${projectId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Finalize project', mode: 'finalize' }),
        });
        let data: {
          status?: string;
          message?: string;
          artifacts_created?: number;
          failed_docs?: string[];
          error?: string;
        };
        try {
          data = await res.json();
        } catch {
          const { toast } = await import('sonner');
          toast.error(`Approve failed (${res.status}): server returned a non-JSON response. Check server logs.`);
          return;
        }
        if (!res.ok) {
          const msg = data.message ?? data.error ?? `Approve failed (${res.status})`;
          const failedDocs = data.failed_docs?.length ? ` Failed docs: ${data.failed_docs.join(', ')}.` : '';
          const { toast } = await import('sonner');
          toast.error(`${msg}${failedDocs} Check server logs to investigate.`);
          return;
        }
        const count = data.artifacts_created ?? 0;
        const expectedCount = 5;
        if (count === 0) {
          const { toast } = await import('sonner');
          toast.warning('No context documents were generated.');
        } else if (count < expectedCount) {
          const { toast } = await import('sonner');
          toast.warning(
            `Created ${count} of ${expectedCount} documents. One may have failed (e.g. Data Contracts) — check Docs tab.`
          );
        } else {
          const { toast } = await import('sonner');
          toast.success(`Approved: ${count} context documents created`);
        }
        refetch();
        refetchArtifacts();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Approve failed';
        const { toast } = await import('sonner');
        toast.error(msg);
      } finally {
        setFinalizingProject(false);
        setFinalizeProgress('');
      }
    },
    [projectId, refetch, refetchArtifacts]
  );

  const handleFinalizeCard = useCallback(
    async (cardId: string) => {
      if (!projectId) {
        const { toast } = await import('sonner');
        toast.error('No project selected');
        return;
      }
      setFinalizingCardId(cardId);
      setCardFinalizeProgress('Starting card approval…');
      try {
        const res = await fetch(`/api/projects/${projectId}/cards/${cardId}/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const msg = (err as { message?: string }).message
            ?? (err as { error?: string }).error
            ?? `Approve failed (${res.status})`;
          const { toast } = await import('sonner');
          toast.error(msg);
          return;
        }
        const { streamSSEEvents } = await import('@/lib/api/sse');
        let streamError = '';
        let testGenerated = false;
        let contextDocsGenerated = 0;
        for await (const { event: eventType, data } of streamSSEEvents(res.body ?? null)) {
          if (eventType === 'finalize_progress' && data !== null && typeof data === 'object') {
            const d = data as { label?: string; step_index?: number; total_steps?: number };
            const stepLabel = d.total_steps
              ? `(${(d.step_index ?? 0) + 1}/${d.total_steps}) ${d.label ?? ''}`
              : d.label ?? '';
            setCardFinalizeProgress(stepLabel);
          }
          if (eventType === 'phase_complete' && data !== null && typeof data === 'object') {
            const d = data as { test_generated?: boolean; context_docs_generated?: number };
            testGenerated = d.test_generated ?? false;
            contextDocsGenerated = d.context_docs_generated ?? 0;
          }
          if (eventType === 'error' && data !== null && typeof data === 'object') {
            streamError = (data as { reason?: string }).reason ?? 'Approve failed';
          }
        }
        if (streamError) {
          const { toast } = await import('sonner');
          toast.error(streamError);
        } else {
          const { toast } = await import('sonner');
          const parts = ['Card approved'];
          if (testGenerated) parts.push('e2e test generated');
          if (contextDocsGenerated > 0) parts.push(`${contextDocsGenerated} context doc(s) generated`);
          toast.success(parts.join(' — '));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Approve failed';
        const { toast } = await import('sonner');
        toast.error(msg);
      } finally {
        setFinalizingCardId(null);
        setCardFinalizeProgress('');
        refetch();
        refetchArtifacts();
        refetchCardContextArtifacts();
        refetchCardPlannedFiles();
      }
    },
    [projectId, refetch, refetchArtifacts, refetchCardContextArtifacts, refetchCardPlannedFiles]
  );

  const handleUpdateCardDescription = useCallback(
    async (cardId: string, description: string) => {
      const result = await submitAction({
        actions: [
          {
            action_type: 'updateCard',
            target_ref: { card_id: cardId },
            payload: { description: description || null },
          },
        ],
      });
      if (result && result.applied > 0) refetch();
    },
    [submitAction, refetch]
  );

  const handleUpdateQuickAnswer = useCallback(
    async (cardId: string, quickAnswer: string) => {
      const result = await submitAction({
        actions: [
          {
            action_type: 'updateCard',
            target_ref: { card_id: cardId },
            payload: { quick_answer: quickAnswer || null },
          },
        ],
      });
      if (result && result.applied > 0) refetch();
    },
    [submitAction, refetch]
  );

  const handleUpdateRequirement = useCallback(
    async (cardId: string, requirementId: string, text: string) => {
      if (!projectId) return;
      const res = await fetch(
        `/api/projects/${projectId}/cards/${cardId}/requirements/${requirementId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        }
      );
      if (res.ok) {
        refetchCardKnowledge();
      }
    },
    [projectId, refetchCardKnowledge]
  );

  const handleAddRequirement = useCallback(
    async (cardId: string, text: string) => {
      if (!projectId) return;
      const res = await fetch(
        `/api/projects/${projectId}/cards/${cardId}/requirements`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, source: 'user' }),
        }
      );
      if (res.ok) {
        refetchCardKnowledge();
      }
    },
    [projectId, refetchCardKnowledge]
  );

  const handleLinkContextArtifact = useCallback(
    async (cardId: string, artifactId: string) => {
      const result = await submitAction({
        actions: [
          {
            action_type: 'linkContextArtifact',
            target_ref: { card_id: cardId },
            payload: { context_artifact_id: artifactId },
          },
        ],
      });
      if (result && result.applied > 0) {
        refetch();
        refetchCardContextArtifacts();
      }
    },
    [submitAction, refetch, refetchCardContextArtifacts]
  );

  const handleAddPlannedFile = useCallback(
    async (cardId: string, logicalFilePath: string) => {
      if (!projectId) return;
      const res = await fetch(
        `/api/projects/${projectId}/cards/${cardId}/planned-files`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            logical_file_name: logicalFilePath,
            artifact_kind: 'util',
            action: 'edit',
            intent_summary: 'Added by user',
          }),
        }
      );
      if (res.ok) {
        refetchCardPlannedFiles();
      }
    },
    [projectId, refetchCardPlannedFiles]
  );

  const handleUpdateFileDescription = useCallback((_fileId: string, _description: string) => {
    refetch();
  }, [refetch]);

  const [deleteDialog, setDeleteDialog] = useState<{
    entityType: 'workflow' | 'activity' | 'card';
    entityName: string;
    cascadeMessage?: string;
    onConfirm: () => boolean | Promise<boolean>;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleAddWorkflow = useCallback(
    async (title: string) => {
      if (!projectId || !submitAction) return;
      const workflows = snapshot?.workflows ?? [];
      const maxPosition = workflows.reduce(
        (max, workflow) => Math.max(max, workflow.position ?? -1),
        -1
      );
      const position = maxPosition + 1;
      const result = await submitAction({
        actions: [
          {
            action_type: 'createWorkflow',
            target_ref: { project_id: projectId },
            payload: { title, position },
          },
        ],
      });
      if (result && result.applied > 0) refetch();
      else if (result?.results?.[0]?.rejection_reason) {
        const { toast } = await import('sonner');
        toast.error(result.results[0].rejection_reason);
      }
    },
    [projectId, submitAction, snapshot?.workflows, refetch]
  );

  const handleAddActivity = useCallback(
    async (workflowId: string, title: string, position?: number) => {
      if (!projectId || !submitAction) return;
      const workflow = snapshot?.workflows?.find((wf) => wf.id === workflowId);
      const activities = workflow?.activities ?? [];
      const pos = position ?? activities.length;
      const result = await submitAction({
        actions: [
          {
            action_type: 'createActivity',
            target_ref: { workflow_id: workflowId },
            payload: { title, position: pos },
          },
        ],
      });
      if (result && result.applied > 0) refetch();
      else if (result?.results?.[0]?.rejection_reason) {
        const { toast } = await import('sonner');
        toast.error(result.results[0].rejection_reason);
      }
    },
    [projectId, submitAction, snapshot?.workflows, refetch]
  );

  const handleAddCard = useCallback(
    async (activityId: string, title: string, position?: number, priority?: number) => {
      if (!projectId || !submitAction) return;
      const pos = position ?? 0;
      const prio = priority ?? 0;
      const result = await submitAction({
        actions: [
          {
            action_type: 'createCard',
            target_ref: { workflow_activity_id: activityId },
            payload: { title, status: 'todo', priority: prio, position: pos },
          },
        ],
      });
      if (result && result.applied > 0) refetch();
      else if (result?.results?.[0]?.rejection_reason) {
        const { toast } = await import('sonner');
        toast.error(result.results[0].rejection_reason);
      }
    },
    [projectId, submitAction, refetch]
  );

  const performDelete = useCallback(
    async (action: { action_type: string; target_ref: Record<string, string> }): Promise<boolean> => {
      if (!projectId || !submitAction) return false;
      setIsDeleting(true);
      try {
        const result = await submitAction({
          actions: [{ ...action, payload: {} }],
        });
        if (result && result.applied > 0) {
          refetch();
          return true;
        }
        if (result?.results?.[0]?.rejection_reason) {
          const { toast } = await import('sonner');
          toast.error(result.results[0].rejection_reason);
        }
        return false;
      } finally {
        setIsDeleting(false);
      }
    },
    [projectId, submitAction, refetch]
  );

  const handleDeleteWorkflow = useCallback(
    (workflowId: string, workflowTitle: string, activityCount: number, cardCount: number) => {
      const cascade =
        activityCount > 0 || cardCount > 0
          ? `This will also delete ${activityCount} activit${activityCount === 1 ? 'y' : 'ies'} and ${cardCount} card${cardCount === 1 ? '' : 's'}.`
          : undefined;
      setDeleteDialog({
        entityType: 'workflow',
        entityName: workflowTitle,
        cascadeMessage: cascade,
        onConfirm: () =>
          performDelete({
            action_type: 'deleteWorkflow',
            target_ref: { workflow_id: workflowId },
          }),
      });
    },
    [performDelete]
  );

  const handleDeleteActivity = useCallback(
    (activityId: string, activityTitle: string, cardCount: number) => {
      const cascade =
        cardCount > 0
          ? `This will also delete ${cardCount} card${cardCount === 1 ? '' : 's'}.`
          : undefined;
      setDeleteDialog({
        entityType: 'activity',
        entityName: activityTitle,
        cascadeMessage: cascade,
        onConfirm: () =>
          performDelete({
            action_type: 'deleteActivity',
            target_ref: { workflow_activity_id: activityId },
          }),
      });
    },
    [performDelete]
  );

  const handleDeleteCard = useCallback(
    (cardId: string, cardTitle: string) => {
      setDeleteDialog({
        entityType: 'card',
        entityName: cardTitle,
        onConfirm: () =>
          performDelete({
            action_type: 'deleteCard',
            target_ref: { card_id: cardId },
          }),
      });
    },
    [performDelete]
  );

  const handleProjectUpdate = useCallback(
    async (updates: {
      name?: string;
      description?: string | null;
      customer_personas?: string | null;
      tech_stack?: string | null;
      deployment?: string | null;
      design_inspiration?: string | null;
      repo_url?: string | null;
      default_branch?: string;
    }) => {
      if (!projectId) return false;
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (res.ok) refetch();
        return res.ok;
      } catch {
        return false;
      }
    },
    [projectId, refetch]
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      {deleteDialog && (
        <ConfirmDeleteDialog
          open={true}
          onOpenChange={(open) => { if (!open) setDeleteDialog(null); }}
          entityType={deleteDialog.entityType}
          entityName={deleteDialog.entityName}
          cascadeMessage={deleteDialog.cascadeMessage}
          onConfirm={deleteDialog.onConfirm}
          isDeleting={isDeleting}
        />
      )}
      <Header
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        agentStatus={agentStatus}
        selectedProjectId={projectId}
        onSelectProjectId={handleSelectProjectId}
        onSaveCurrentProject={refetch}
        apiKeysOpen={apiKeysOpen}
        onApiKeysOpenChange={setApiKeysOpen}
      />

      <div className="flex flex-1 overflow-hidden">
        <ChatErrorBoundary>
        <LeftSidebar
          isCollapsed={leftSidebarCollapsed}
          onToggle={setLeftSidebarCollapsed}
          width={leftSidebarCollapsed ? undefined : leftWidth}
          project={{
            name: snapshot?.project?.name ?? 'Dossier',
            description: snapshot?.project?.description ?? null,
            status: appMode === 'ideation' ? 'planning' : 'active',
            repo_url: snapshot?.project?.repo_url ?? null,
          }}
          projectId={projectId || undefined}
          onPlanningApplied={async () => {
            setAgentStatus(hasContent ? 'reviewing' : 'building');
            await refetch();
            refetchArtifacts();
          }}
          onMapChanged={async () => {
            await refetch();
          }}
          onPlanningStateChange={setIsPlanning}
          onProjectUpdate={handleProjectUpdate}
          onOpenApiKeys={() => setApiKeysOpen(true)}
        />
        </ChatErrorBoundary>

        {!leftSidebarCollapsed && (
          <div
            className="w-1 flex-shrink-0 bg-transparent hover:bg-primary/40 active:bg-primary/60 cursor-col-resize transition-colors z-10"
            onMouseDown={(e) => handleResizeMouseDown('left', e)}
            title="Drag to resize"
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {appMode === 'ideation' ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md px-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-secondary mb-6">
                  <Sparkles className={`h-8 w-8 text-muted-foreground ${isPlanning ? 'animate-pulse' : ''}`} />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  {isPlanning ? 'Creating your map' : 'Describe your idea'}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {isPlanning
                    ? 'The planning agent is structuring your idea into workflows, activities, and cards.'
                    : 'Use the Agent chat in the left panel to describe what you want to build. The planning agent will generate workflows, activities, and cards for your implementation map.'}
                </p>
                {!isPlanning && (
                  <p className="mt-3 text-xs text-muted-foreground/90 italic">Your canvas is ready.</p>
                )}
                <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <div className={`h-2 w-2 rounded-full ${isPlanning ? 'bg-primary animate-pulse' : 'bg-yellow-500 animate-pulse'}`} />
                  <span>{isPlanning ? 'Creating your map…' : 'Waiting for your input…'}</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              {isPlanning && (
                <div className="flex-shrink-0 flex items-center justify-center gap-2 py-2 px-3 bg-primary/10 border-b border-grid-line text-xs text-muted-foreground">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  <span>Updating map…</span>
                </div>
              )}
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-auto scrollbar-map">
                {mapLoading && (
                  <div className="p-6 flex flex-col items-center gap-4">
                    <p key={mapLoadingMessageIndex} className="text-sm text-muted-foreground animate-in fade-in duration-300">
                      {MAP_LOADING_MESSAGES[mapLoadingMessageIndex]}
                    </p>
                    <MapSkeleton />
                  </div>
                )}
                {!mapLoading && mapError && (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center animate-in fade-in duration-300">
                    <p className="text-sm text-destructive">{mapError}</p>
                    <p className="text-xs text-muted-foreground max-w-sm">We couldn’t load the map. Check your connection and try again.</p>
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Retry
                    </button>
                  </div>
                )}
                {!mapLoading && !mapError && snapshot && (
                  <div className="min-h-0 opacity-100">
                  <MapErrorBoundary onRetry={refetch}>
                  <WorkflowBlock
                    snapshot={snapshot}
                    viewMode={viewMode}
                    expandedCardId={expandedCardId}
                    onExpandCard={setExpandedCardId}
                    onCardAction={handleCardAction}
                    onUpdateCardDescription={handleUpdateCardDescription}
                    onUpdateQuickAnswer={handleUpdateQuickAnswer}
                    onUpdateRequirement={handleUpdateRequirement}
                    onAddRequirement={handleAddRequirement}
                    onLinkContextArtifact={handleLinkContextArtifact}
                    onAddPlannedFile={handleAddPlannedFile}
                    availableArtifacts={projectArtifacts ?? []}
                    availableFilePaths={availableFilePaths}
                    onBuildCard={handleBuildCard}
                    onResumeBlockedCard={handleResumeBlockedCard}
                    onShowCardFiles={handleShowCardFiles}
                    buildingCardId={buildingCardId}
                    onFinalizeCard={handleFinalizeCard}
                    finalizingCardId={finalizingCardId}
                    cardFinalizeProgress={cardFinalizeProgress}
                    onPopulateWorkflow={handlePopulateWorkflow}
                    populatingWorkflowId={populatingWorkflowId}
                    onAddWorkflow={handleAddWorkflow}
                    onAddActivity={handleAddActivity}
                    onAddCard={handleAddCard}
                    onDeleteWorkflow={handleDeleteWorkflow}
                    onDeleteActivity={handleDeleteActivity}
                    onDeleteCard={handleDeleteCard}
                    onFinalizeProject={handleFinalizeProject}
                    finalizingProject={finalizingProject}
                    finalizeProgress={finalizeProgress}
                    onProjectUpdate={handleProjectUpdate}
                    onSelectDoc={(doc) => {
                      setSelectedDoc(doc);
                      setRightPanelTab('docs');
                      setRightPanelOpen(true);
                    }}
                    onUpdateFileDescription={handleUpdateFileDescription}
                    getCardKnowledge={getCardKnowledge}
                    getCardKnowledgeLoading={getCardKnowledgeLoading}
                  />
                  </MapErrorBoundary>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {!rightPanelOpen && (
          <button
            type="button"
            onClick={() => setRightPanelOpen(true)}
            className="flex-shrink-0 flex items-center justify-center w-8 min-h-[4rem] py-2 border-l border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Open panel"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        )}
        {rightPanelOpen && (
          <>
            <div
              className="w-1 flex-shrink-0 bg-transparent hover:bg-primary/40 active:bg-primary/60 cursor-col-resize transition-colors z-10"
              onMouseDown={(e) => handleResizeMouseDown('right', e)}
              title="Drag to resize"
            />
            <RightPanel
              isOpen={rightPanelOpen}
              onClose={() => setRightPanelOpen(false)}
              activeDoc={selectedDoc}
              activeTab={rightPanelTab}
              onTabChange={setRightPanelTab}
              projectId={appMode === 'active' ? projectId : undefined}
              width={rightWidth}
              docsList={projectArtifacts ?? []}
              filesBranchCardId={filesBranchCardId}
              onFilesBranchChange={setFilesBranchCardId}
              baseBranch={snapshot?.project?.default_branch}
              filesBranchCardTitle={
                filesBranchCardId && snapshot
                  ? snapshot.workflows
                      .flatMap((wf) => wf.activities.flatMap((a) => a.cards))
                      .find((c) => c.id === filesBranchCardId)?.title
                  : undefined
              }
              onSelectDoc={async (doc) => {
                if (!doc) {
                  setSelectedDoc(null);
                  setRightPanelTab('docs');
                  setRightPanelOpen(true);
                  return;
                }
                const refDoc = doc as ContextArtifact & { _refPath?: string };
                if (refDoc._refPath && refDoc.content == null) {
                  const content = await fetchRefDocContent(refDoc._refPath);
                  setSelectedDoc({ ...refDoc, content });
                } else {
                  setSelectedDoc(doc);
                }
                setRightPanelTab('docs');
                setRightPanelOpen(true);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default function DossierPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-screen flex items-center justify-center bg-background font-mono text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <DossierPageInner />
    </Suspense>
  );
}
