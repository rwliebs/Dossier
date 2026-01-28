'use client';

import { useState } from 'react';
import { Header } from '@/components/dossier/header';
import { LeftSidebar } from '@/components/dossier/left-sidebar';
import { IterationBlock } from '@/components/dossier/iteration-block';
import { RightPanel } from '@/components/dossier/right-panel';
import { MessageSquare, Bot, Clock } from 'lucide-react';
import type { Iteration, ContextDoc, CodeFile, ProjectContext } from '@/components/dossier/types';

// Sample data structure with iterations
const sampleIterations: Iteration[] = [
  {
    id: 'iteration-1',
    phase: 'mvp',
    label: 'MVP',
    description: 'Core dating coordination features',
    epics: [
      {
        id: 'epic-1',
        title: 'Showing partners when I\'m available',
        color: 'yellow',
        activities: [
          {
            id: 'activity-1',
            epicId: 'epic-1',
            title: 'Recording dating availability',
            cards: [
              {
                id: 'card-1',
                activityId: 'activity-1',
                title: 'Import a shared Google calendar',
                description: 'Allow users to sync availability from Google Calendar',
                status: 'active',
                priority: 1,
                contextDocs: [
                  {
                    id: 'doc-1',
                    name: 'Google Calendar API',
                    type: 'doc',
                    title: 'Google Calendar API Documentation',
                    content: `# Google Calendar API v3

## Overview
The Google Calendar API allows applications to perform read and write operations on Google Calendar data. This includes managing events, availability, and synchronization.

## Key Endpoints
- GET /calendars/{calendarId}/events
- POST /calendars/{calendarId}/events
- GET /calendars/{calendarId}

## Authentication
OAuth 2.0 is required for calendar access. Scopes needed:
- calendar.events
- calendar.readonly
- calendar.settings

## Rate Limits
- 1,000 requests per 100 seconds per user
- Implement exponential backoff for retries

## Sync Strategy
Use the 'syncToken' field to efficiently sync changes:
1. Store the syncToken from previous sync
2. Use syncToken in next request to get only changes
3. Handle full sync when syncToken expires`,
                  },
                  {
                    id: 'doc-2',
                    name: 'OAuth Setup',
                    type: 'design',
                    title: 'OAuth 2.0 Flow Design',
                    content: `# OAuth 2.0 Implementation

## User Flow
1. User clicks "Connect Google Calendar"
2. Redirected to Google consent screen
3. User authorizes access scopes
4. Redirect back with authorization code
5. Exchange code for access token
6. Store refresh token securely

## Implementation Details
- Use httpOnly cookies for token storage
- Refresh token before expiry (check remaining time)
- Handle permission denial gracefully
- Show clear error messages`,
                  },
                ],
                requirements: ['OAuth setup', 'Calendar sync', 'Token refresh'],
                knownFacts: [{ id: 'kf-1', text: 'Using Google Calendar API v3', source: 'Tech spec' }],
                assumptions: [{ id: 'a-1', text: 'Users have Google accounts' }],
                questions: [{ id: 'q-1', text: 'Should we sync all calendars or let users choose?' }],
                codeFileIds: ['file-1', 'file-2', 'file-3'],
              },
              {
                id: 'card-2',
                activityId: 'activity-1',
                title: 'Link to other users as partners, show availability',
                description: 'Share calendar view with partners',
                status: 'questions',
                priority: 2,
                contextDocs: [],
                requirements: ['User linking', 'Sharing permissions'],
                knownFacts: [],
                assumptions: [],
                questions: [{ id: 'q-2', text: 'How do we handle partner privacy? Full calendar or just busy times?' }],
                quickAnswer: 'Show only busy/free status, not event details. Implement with time-blocked view.',
                codeFileIds: ['file-2', 'file-4'],
              },
            ],
          },
        ],
      },
      {
        id: 'epic-2',
        title: 'Booking dates',
        color: 'blue',
        activities: [
          {
            id: 'activity-2',
            epicId: 'epic-2',
            title: 'Selecting and proposing dates',
            cards: [
              {
                id: 'card-3',
                activityId: 'activity-2',
                title: 'Scheduling & booking',
                description: 'Date picker and time slot selection',
                status: 'review',
                priority: 2,
                contextDocs: [],
                requirements: ['Date selection', 'Time slot availability'],
                knownFacts: [],
                assumptions: [],
                questions: [],
                codeFileIds: ['file-5'],
                testFileIds: ['file-8'],
              },
            ],
          },
        ],
      },
    ],
    codeFiles: [
      { 
        id: 'file-1', 
        path: '/app/components/Calendar.tsx', 
        name: 'Calendar.tsx', 
        type: 'component', 
        cardIds: ['card-1', 'card-3'], 
        epicIds: ['epic-1', 'epic-2'],
        description: 'Main calendar component for displaying availability',
        code: `'use client';

import { useState, useEffect } from 'react';
import { useCalendar } from '@/hooks/useCalendar';

export function Calendar() {
  const [events, setEvents] = useState([]);
  const { syncCalendar } = useCalendar();

  useEffect(() => {
    syncCalendar().then(setEvents);
  }, []);

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <h2>My Availability</h2>
      </div>
      <div className="calendar-grid">
        {events.map((event) => (
          <div key={event.id} className="event">
            {event.title}
          </div>
        ))}
      </div>
    </div>
  );
}`
      },
      { 
        id: 'file-2', 
        path: '/api/calendar/sync.ts', 
        name: 'sync.ts', 
        type: 'api', 
        cardIds: ['card-1', 'card-2'], 
        epicIds: ['epic-1'],
        description: 'API endpoint for syncing calendar data',
        code: `import { getServerSession } from 'next-auth/next';
import { fetchCalendarEvents } from '@/lib/services/google-calendar';

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { calendarId } = await req.json();
    const events = await fetchCalendarEvents(session.accessToken, calendarId);

    return Response.json({ success: true, events });
  } catch (error) {
    console.error('Sync failed:', error);
    return Response.json({ error: 'Sync failed' }, { status: 500 });
  }
}`
      },
      { 
        id: 'file-3', 
        path: '/lib/services/google-calendar.ts', 
        name: 'google-calendar.ts', 
        type: 'service', 
        cardIds: ['card-1'], 
        epicIds: ['epic-1'],
        description: 'Google Calendar API integration service',
        code: `import { google } from 'googleapis';

export async function fetchCalendarEvents(accessToken: string, calendarId: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth });
  const response = await calendar.events.list({
    calendarId,
    timeMin: new Date().toISOString(),
    maxResults: 100,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items || [];
}`
      },
      { 
        id: 'file-4', 
        path: '/app/hooks/usePartners.ts', 
        name: 'usePartners.ts', 
        type: 'hook', 
        cardIds: ['card-2'], 
        epicIds: ['epic-1'],
        description: 'Hook for managing partner availability state',
        code: `import { useState, useCallback } from 'react';
import { useSharedCalendar } from '@/context/SharedCalendarContext';

export function usePartners() {
  const [partners, setPartners] = useState([]);
  const { sharedCalendar } = useSharedCalendar();

  const addPartner = useCallback((email: string) => {
    // Request partner's availability
    return fetch('/api/partners/add', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }, []);

  return { partners, addPartner };
}`
      },
      { 
        id: 'file-5', 
        path: '/app/components/DatePicker.tsx', 
        name: 'DatePicker.tsx', 
        type: 'component', 
        cardIds: ['card-3'], 
        epicIds: ['epic-2'],
        description: 'Date picker component for scheduling',
        code: `'use client';

import { useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';

interface DatePickerProps {
  onDateSelect: (date: Date) => void;
}

export function DatePicker({ onDateSelect }: DatePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <button onClick={() => setOpen(!open)}>
      <CalendarIcon className="w-4 h-4" />
      Select Date
    </button>
  );
}`
      },
      { 
        id: 'file-6', 
        path: '/tests/calendar.test.ts', 
        name: 'calendar.test.ts', 
        type: 'util', 
        cardIds: ['card-1'], 
        epicIds: ['epic-1'],
        description: 'Calendar component unit tests',
        code: `import { render, screen } from '@testing-library/react';
import { Calendar } from '@/app/components/Calendar';

describe('Calendar', () => {
  it('renders calendar container', () => {
    render(<Calendar />);
    expect(screen.getByText('My Availability')).toBeInTheDocument();
  });

  it('displays events', () => {
    render(<Calendar />);
    // Mock events would be displayed
    expect(screen.queryByTestId('calendar-grid')).toBeInTheDocument();
  });

  it('syncs calendar on mount', async () => {
    render(<Calendar />);
    // Verify sync was called
    await screen.findByText('Synced');
  });
});`
      },
      { 
        id: 'file-7', 
        path: '/tests/calendar.integration.test.ts', 
        name: 'calendar.integration.test.ts', 
        type: 'util', 
        cardIds: ['card-1'], 
        epicIds: ['epic-1'],
        description: 'Calendar integration tests with API',
        code: `import { render, screen, waitFor } from '@testing-library/react';
import { Calendar } from '@/app/components/Calendar';

describe('Calendar Integration', () => {
  it('fetches and displays events from API', async () => {
    render(<Calendar />);
    
    await waitFor(() => {
      expect(screen.getByText('Team Meeting')).toBeInTheDocument();
    });
  });

  it('handles sync errors gracefully', async () => {
    render(<Calendar />);
    
    await waitFor(() => {
      expect(screen.getByText('Sync failed')).toBeInTheDocument();
    });
  });
});`
      },
      { 
        id: 'file-8', 
        path: '/tests/date-picker.test.ts', 
        name: 'date-picker.test.ts', 
        type: 'util', 
        cardIds: ['card-3'], 
        epicIds: ['epic-2'],
        description: 'Date picker unit and integration tests',
        code: `import { render, screen, fireEvent } from '@testing-library/react';
import { DatePicker } from '@/app/components/DatePicker';

describe('DatePicker', () => {
  it('renders date picker button', () => {
    render(<DatePicker onDateSelect={jest.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('calls onDateSelect when date is selected', () => {
    const onDateSelect = jest.fn();
    render(<DatePicker onDateSelect={onDateSelect} />);
    
    fireEvent.click(screen.getByRole('button'));
    expect(onDateSelect).toHaveBeenCalled();
  });

  it('selects valid dates only', () => {
    const onDateSelect = jest.fn();
    render(<DatePicker onDateSelect={onDateSelect} />);
    
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    
    // Should accept future dates
    expect(onDateSelect).toHaveBeenCalledWith(expect.any(Date));
  });
});`
      },
    ],
    dataFlows: [
      { id: 'flow-1', fromFileId: 'file-1', toFileId: 'file-2', direction: 'output', label: 'sync request' },
      { id: 'flow-2', fromFileId: 'file-2', toFileId: 'file-3', direction: 'output', label: 'oauth call' },
      { id: 'flow-3', fromFileId: 'file-2', toFileId: 'file-1', direction: 'input', label: 'calendar data' },
      { id: 'flow-4', fromFileId: 'file-4', toFileId: 'file-1', direction: 'bidirectional', label: 'partner state' },
    ],
  },
  {
    id: 'iteration-2',
    phase: 'v2',
    label: 'V2',
    description: 'Advanced scheduling and group coordination',
    epics: [
      {
        id: 'epic-3',
        title: 'Group availability',
        color: 'purple',
        activities: [
          {
            id: 'activity-3',
            epicId: 'epic-3',
            title: 'Coordinating with multiple partners',
            cards: [
              {
                id: 'card-4',
                activityId: 'activity-3',
                title: 'Multi-person calendar sync',
                description: 'Handle availability for groups',
                status: 'todo',
                priority: 1,
                contextDocs: [],
                requirements: ['Group calendar management', 'Conflict resolution'],
                knownFacts: [],
                assumptions: [{ id: 'a-2', text: 'V2 will focus on group coordination' }],
                questions: [],
                codeFileIds: ['file-6'],
              },
            ],
          },
        ],
      },
    ],
    codeFiles: [
      { id: 'file-6', path: '/api/groups/availability.ts', name: 'availability.ts', type: 'api', cardIds: ['card-4'], epicIds: ['epic-3'] },
    ],
    dataFlows: [],
  },
];

export default function DossierPage() {
  const [viewMode, setViewMode] = useState<'functionality' | 'architecture'>('functionality');
  const [agentStatus, setAgentStatus] = useState<'idle' | 'building' | 'reviewing'>('idle');
  
  // Project context - shows users what spawned this map
  const projectContext: ProjectContext = {
    userRequest: "Build a dating app that helps couples coordinate their schedules and find times to meet",
    generatedAt: "2 hours ago",
    activeAgents: 3,
    lastUpdate: "2 min ago",
  };
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<'files' | 'terminal' | 'docs'>('files');
  const [selectedDoc, setSelectedDoc] = useState<ContextDoc | null>(null);
  const [selectedFile, setSelectedFile] = useState<CodeFile | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [iterations, setIterations] = useState<Iteration[]>(sampleIterations);

  const handleCardAction = (cardId: string, action: string) => {
    // Find the card to get context
    const card = iterations.flatMap(i => i.epics).flatMap(e => e.activities).flatMap(a => a.cards).find(c => c.id === cardId);
    if (!card) return;

    if (action === 'monitor') {
      // Show the code file the agent is working on
      const codeFileId = card.codeFileIds?.[0];
      if (codeFileId) {
        const codeFile = iterations.flatMap(i => i.codeFiles).find(f => f.id === codeFileId);
        if (codeFile) {
          setSelectedFile(codeFile);
          setRightPanelTab('terminal');
          setRightPanelOpen(true);
        }
      }
    } else if (action === 'test') {
      // Show the test files for this card
      const testFileIds = card.testFileIds || [];
      if (testFileIds.length > 0) {
        const testFile = iterations.flatMap(i => i.codeFiles).find(f => f.id === testFileIds[0]);
        if (testFile) {
          setSelectedFile(testFile);
          setRightPanelTab('terminal');
          setRightPanelOpen(true);
        }
      }
    }
  };

  const handleUpdateCardDescription = (cardId: string, description: string) => {
    setIterations((prevIterations) =>
      prevIterations.map((iteration) => ({
        ...iteration,
        epics: iteration.epics.map((epic) => ({
          ...epic,
          activities: epic.activities.map((activity) => ({
            ...activity,
            cards: activity.cards.map((card) =>
              card.id === cardId ? { ...card, description } : card
            ),
          })),
        })),
      }))
    );
  };

  const handleUpdateQuickAnswer = (cardId: string, quickAnswer: string) => {
    setIterations((prevIterations) =>
      prevIterations.map((iteration) => ({
        ...iteration,
        epics: iteration.epics.map((epic) => ({
          ...epic,
          activities: epic.activities.map((activity) => ({
            ...activity,
            cards: activity.cards.map((card) =>
              card.id === cardId ? { ...card, quickAnswer } : card
            ),
          })),
        })),
      }))
    );
  };

  const handleUpdateFileDescription = (fileId: string, description: string) => {
    setIterations((prevIterations) =>
      prevIterations.map((iteration) => ({
        ...iteration,
        codeFiles: iteration.codeFiles?.map((file) =>
          file.id === fileId ? { ...file, description } : file
        ),
      }))
    );
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      {/* Header */}
      <Header 
        viewMode={viewMode} 
        onViewModeChange={setViewMode} 
        agentStatus={agentStatus} 
      />

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Collapsible */}
        <LeftSidebar
          isCollapsed={leftSidebarCollapsed}
          onToggle={setLeftSidebarCollapsed}
          project={{
            name: 'Dossier',
            description: 'Break vision into flow maps. Bundle context. Ship at AI speed.',
            status: 'active',
            collaborators: ['You', 'AI Agent'],
          }}
        />

        {/* Center - Iteration Blocks (vertically stacked, each with side-scrollable story map) */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {/* Project Context Banner - Fixed at top */}
          <div className="shrink-0 bg-secondary/80 backdrop-blur border-b border-border px-6 py-4">
            <div className="flex items-start justify-between gap-6">
              {/* User's original request */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">
                  <MessageSquare className="h-3 w-3" />
                  Your Request
                </div>
                <p className="text-sm text-foreground font-medium leading-relaxed">
                  "{projectContext.userRequest}"
                </p>
              </div>
              
              {/* Agent status */}
              <div className="flex items-center gap-4 shrink-0">
                <div className="flex items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Bot className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-green-500 font-mono font-bold">{projectContext.activeAgents}</span>
                    <span className="text-muted-foreground">agents working</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Updated {projectContext.lastUpdate}</span>
                </div>
              </div>
            </div>
            
            {/* Explanation */}
            <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
              This implementation map was generated from your request. Each card represents a task agents are working on. 
              <span className="text-foreground"> Click any card</span> to see details, provide answers, or guide the work.
            </p>
          </div>

          {/* Iterations */}
          <div className="flex-1 overflow-y-auto">
            {iterations.map((iteration) => (
              <IterationBlock
                key={iteration.id}
                iteration={iteration}
                viewMode={viewMode}
                expandedCardId={expandedCardId}
                onExpandCard={setExpandedCardId}
                onCardAction={handleCardAction}
                onUpdateCardDescription={handleUpdateCardDescription}
                onUpdateQuickAnswer={handleUpdateQuickAnswer}
                onUpdateFileDescription={handleUpdateFileDescription}
                onSelectDoc={(doc) => {
                  setSelectedDoc(doc);
                  setRightPanelTab('docs');
                  setRightPanelOpen(true);
                }}
                onFileClick={(file) => {
                  setSelectedFile(file);
                  setRightPanelTab('terminal');
                  setRightPanelOpen(true);
                }}
              />
            ))}
          </div>
        </div>

        {/* Right Panel - Files/Terminal/Docs (Collapsible) */}
        {rightPanelOpen && (
        <RightPanel
          isOpen={rightPanelOpen}
          onClose={() => setRightPanelOpen(false)}
          activeDoc={selectedDoc}
          activeFile={selectedFile}
          activeTab={rightPanelTab}
          onTabChange={setRightPanelTab}
        />
        )}
      </div>
    </div>
  );
}
