'use client';

import { useState } from 'react';
import { Header } from '@/components/dossier/header';
import { LeftSidebar } from '@/components/dossier/left-sidebar';
import { IterationBlock } from '@/components/dossier/iteration-block';
import { RightPanel } from '@/components/dossier/right-panel';
import { MessageSquare, Bot, Clock, Sparkles } from 'lucide-react';
import type { Iteration, ContextDoc, CodeFile, ProjectContext } from '@/components/dossier/types';

// Sample data structure with iterations
const sampleIterations: Iteration[] = [
  {
    id: 'iteration-1',
    phase: 'mvp',
    label: 'MVP',
    description: 'Core lead capture, quoting, and job scheduling',
    epics: [
      {
        id: 'epic-1',
        title: 'Lead Management',
        color: 'yellow',
        activities: [
          {
            id: 'activity-1',
            epicId: 'epic-1',
            title: 'Capturing new leads',
            cards: [
              {
                id: 'card-1',
                activityId: 'activity-1',
                title: 'Lead intake form with customer details',
                description: 'Capture name, address, phone, service type',
                status: 'active',
                priority: 1,
                contextDocs: [
                  {
                    id: 'doc-1',
                    name: 'Lead Data Model',
                    type: 'doc',
                    title: 'Lead Entity Schema',
                    content: `# Lead Data Model

## Required Fields
- customer_name: string
- phone: string (validated format)
- email: string (optional)
- address: { street, city, state, zip }
- service_type: enum (lawn_care, plumbing, electrical, hvac, cleaning)
- source: enum (website, phone, referral, advertisement)

## Status Flow
new -> contacted -> qualified -> converted | lost

## Notes
- Leads can have multiple contact attempts logged
- Property details captured for service estimation`,
                  },
                  {
                    id: 'doc-2',
                    name: 'Address Validation',
                    type: 'design',
                    title: 'Google Places Integration',
                    content: `# Address Autocomplete

## Implementation
- Use Google Places Autocomplete API
- Validate service area coverage
- Store lat/lng for routing optimization
- Cache frequent addresses`,
                  },
                ],
                requirements: ['Form validation', 'Address autocomplete', 'Phone formatting'],
                knownFacts: [{ id: 'kf-1', text: 'Using Google Places for address validation', source: 'Tech spec' }],
                assumptions: [{ id: 'a-1', text: 'Service area is within 50 mile radius' }],
                questions: [{ id: 'q-1', text: 'Should we capture property size for lawn care leads?' }],
                codeFileIds: ['file-1', 'file-2'],
                testFileIds: ['file-6', 'file-7'],
              },
              {
                id: 'card-2',
                activityId: 'activity-1',
                title: 'Lead assignment to team members',
                description: 'Route leads based on service type and availability',
                status: 'questions',
                priority: 2,
                contextDocs: [],
                requirements: ['Team member profiles', 'Service specializations', 'Workload balancing'],
                knownFacts: [],
                assumptions: [],
                questions: [{ id: 'q-2', text: 'Should assignment be automatic or manual review first?' }],
                quickAnswer: 'Start with manual assignment, add auto-assignment in V2 based on rules.',
                codeFileIds: ['file-3'],
              },
            ],
          },
        ],
      },
      {
        id: 'epic-2',
        title: 'Quoting',
        color: 'blue',
        activities: [
          {
            id: 'activity-2',
            epicId: 'epic-2',
            title: 'Creating and sending quotes',
            cards: [
              {
                id: 'card-3',
                activityId: 'activity-2',
                title: 'Quote builder with line items',
                description: 'Build quotes with services, materials, labor',
                status: 'review',
                priority: 1,
                contextDocs: [],
                requirements: ['Line item editor', 'Tax calculation', 'Discount support'],
                knownFacts: [],
                assumptions: [],
                questions: [],
                codeFileIds: ['file-4'],
                testFileIds: ['file-8'],
              },
              {
                id: 'card-4',
                activityId: 'activity-2',
                title: 'Email quote to customer',
                description: 'Send branded PDF quote via email',
                status: 'todo',
                priority: 2,
                contextDocs: [],
                requirements: ['PDF generation', 'Email delivery', 'Acceptance link'],
                knownFacts: [],
                assumptions: [],
                questions: [],
                codeFileIds: ['file-5'],
              },
            ],
          },
        ],
      },
      {
        id: 'epic-3',
        title: 'Scheduling',
        color: 'green',
        activities: [
          {
            id: 'activity-3',
            epicId: 'epic-3',
            title: 'Booking jobs',
            cards: [
              {
                id: 'card-5',
                activityId: 'activity-3',
                title: 'Calendar view with drag-drop scheduling',
                description: 'Visual scheduler for team assignments',
                status: 'todo',
                priority: 1,
                contextDocs: [],
                requirements: ['Week/day views', 'Drag-drop jobs', 'Team member lanes'],
                knownFacts: [],
                assumptions: [],
                questions: [],
                codeFileIds: ['file-9'],
              },
            ],
          },
        ],
      },
    ],
    codeFiles: [
      { 
        id: 'file-1', 
        path: '/app/components/LeadForm.tsx', 
        name: 'LeadForm.tsx', 
        type: 'component', 
        cardIds: ['card-1'], 
        epicIds: ['epic-1'],
        description: 'Lead intake form with validation',
        code: `'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AddressAutocomplete } from './AddressAutocomplete';

interface LeadFormData {
  customerName: string;
  phone: string;
  email?: string;
  address: string;
  serviceType: 'lawn_care' | 'plumbing' | 'electrical' | 'hvac' | 'cleaning';
  notes?: string;
}

export function LeadForm({ onSubmit }: { onSubmit: (data: LeadFormData) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<LeadFormData>();

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <input {...register('customerName', { required: true })} placeholder="Customer Name" />
      <input {...register('phone', { required: true })} placeholder="Phone" type="tel" />
      <AddressAutocomplete {...register('address', { required: true })} />
      <select {...register('serviceType', { required: true })}>
        <option value="lawn_care">Lawn Care</option>
        <option value="plumbing">Plumbing</option>
        <option value="electrical">Electrical</option>
      </select>
      <button type="submit">Create Lead</button>
    </form>
  );
}`
      },
      { 
        id: 'file-2', 
        path: '/api/leads/route.ts', 
        name: 'route.ts', 
        type: 'api', 
        cardIds: ['card-1'], 
        epicIds: ['epic-1'],
        description: 'Lead CRUD API endpoints',
        code: `import { db } from '@/lib/db';
import { leads } from '@/lib/schema';

export async function POST(req: Request) {
  const data = await req.json();
  
  const lead = await db.insert(leads).values({
    customerName: data.customerName,
    phone: data.phone,
    email: data.email,
    address: data.address,
    serviceType: data.serviceType,
    status: 'new',
    createdAt: new Date(),
  }).returning();

  return Response.json({ lead: lead[0] });
}

export async function GET() {
  const allLeads = await db.select().from(leads).orderBy(leads.createdAt);
  return Response.json({ leads: allLeads });
}`
      },
      { 
        id: 'file-3', 
        path: '/app/components/LeadAssignment.tsx', 
        name: 'LeadAssignment.tsx', 
        type: 'component', 
        cardIds: ['card-2'], 
        epicIds: ['epic-1'],
        description: 'Team member assignment dropdown',
        code: `'use client';

import { useState } from 'react';
import { useTeamMembers } from '@/hooks/useTeamMembers';

export function LeadAssignment({ leadId, currentAssignee }: { leadId: string; currentAssignee?: string }) {
  const { members } = useTeamMembers();
  const [assignee, setAssignee] = useState(currentAssignee);

  const handleAssign = async (memberId: string) => {
    await fetch(\`/api/leads/\${leadId}/assign\`, {
      method: 'POST',
      body: JSON.stringify({ assigneeId: memberId }),
    });
    setAssignee(memberId);
  };

  return (
    <select value={assignee} onChange={(e) => handleAssign(e.target.value)}>
      <option value="">Unassigned</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  );
}`
      },
      { 
        id: 'file-4', 
        path: '/app/components/QuoteBuilder.tsx', 
        name: 'QuoteBuilder.tsx', 
        type: 'component', 
        cardIds: ['card-3'], 
        epicIds: ['epic-2'],
        description: 'Quote line item editor',
        code: `'use client';

import { useState } from 'react';

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export function QuoteBuilder({ leadId }: { leadId: string }) {
  const [items, setItems] = useState<LineItem[]>([]);
  const [taxRate] = useState(0.08);

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const addItem = () => {
    setItems([...items, { id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: 0 }]);
  };

  return (
    <div className="quote-builder">
      <h2>Quote for Lead #{leadId}</h2>
      {items.map((item) => (
        <div key={item.id} className="line-item">
          <input placeholder="Description" />
          <input type="number" placeholder="Qty" />
          <input type="number" placeholder="Price" />
        </div>
      ))}
      <button onClick={addItem}>Add Line Item</button>
      <div className="totals">
        <p>Subtotal: \${subtotal.toFixed(2)}</p>
        <p>Tax: \${tax.toFixed(2)}</p>
        <p>Total: \${total.toFixed(2)}</p>
      </div>
    </div>
  );
}`
      },
      { 
        id: 'file-5', 
        path: '/api/quotes/send/route.ts', 
        name: 'route.ts', 
        type: 'api', 
        cardIds: ['card-4'], 
        epicIds: ['epic-2'],
        description: 'Quote email delivery endpoint',
        code: `import { generateQuotePDF } from '@/lib/pdf';
import { sendEmail } from '@/lib/email';

export async function POST(req: Request) {
  const { quoteId, recipientEmail } = await req.json();
  
  // Generate PDF
  const pdfBuffer = await generateQuotePDF(quoteId);
  
  // Send email with PDF attachment
  await sendEmail({
    to: recipientEmail,
    subject: 'Your Quote from ServicePro',
    template: 'quote',
    attachments: [{ filename: 'quote.pdf', content: pdfBuffer }],
  });

  return Response.json({ success: true });
}`
      },
      { 
        id: 'file-6', 
        path: '/tests/lead-form.test.ts', 
        name: 'lead-form.test.ts', 
        type: 'util', 
        cardIds: ['card-1'], 
        epicIds: ['epic-1'],
        description: 'Lead form validation tests',
        code: `import { render, screen, fireEvent } from '@testing-library/react';
import { LeadForm } from '@/app/components/LeadForm';

describe('LeadForm', () => {
  it('validates required fields', async () => {
    render(<LeadForm onSubmit={jest.fn()} />);
    fireEvent.click(screen.getByText('Create Lead'));
    expect(await screen.findByText('Customer name is required')).toBeInTheDocument();
  });

  it('formats phone number correctly', () => {
    render(<LeadForm onSubmit={jest.fn()} />);
    const phoneInput = screen.getByPlaceholder('Phone');
    fireEvent.change(phoneInput, { target: { value: '5551234567' } });
    expect(phoneInput).toHaveValue('(555) 123-4567');
  });
});`
      },
      { 
        id: 'file-7', 
        path: '/tests/lead-api.test.ts', 
        name: 'lead-api.test.ts', 
        type: 'util', 
        cardIds: ['card-1'], 
        epicIds: ['epic-1'],
        description: 'Lead API integration tests',
        code: `import { POST, GET } from '@/api/leads/route';

describe('Leads API', () => {
  it('creates a new lead', async () => {
    const req = new Request('http://localhost/api/leads', {
      method: 'POST',
      body: JSON.stringify({ customerName: 'John Doe', phone: '555-1234' }),
    });
    const res = await POST(req);
    const data = await res.json();
    expect(data.lead.customerName).toBe('John Doe');
  });

  it('returns all leads', async () => {
    const res = await GET();
    const data = await res.json();
    expect(Array.isArray(data.leads)).toBe(true);
  });
});`
      },
      { 
        id: 'file-8', 
        path: '/tests/quote-builder.test.ts', 
        name: 'quote-builder.test.ts', 
        type: 'util', 
        cardIds: ['card-3'], 
        epicIds: ['epic-2'],
        description: 'Quote builder calculation tests',
        code: `import { render, screen, fireEvent } from '@testing-library/react';
import { QuoteBuilder } from '@/app/components/QuoteBuilder';

describe('QuoteBuilder', () => {
  it('calculates totals correctly', () => {
    render(<QuoteBuilder leadId="123" />);
    fireEvent.click(screen.getByText('Add Line Item'));
    // Add item with qty=2, price=100
    expect(screen.getByText('Subtotal: $200.00')).toBeInTheDocument();
    expect(screen.getByText('Tax: $16.00')).toBeInTheDocument();
    expect(screen.getByText('Total: $216.00')).toBeInTheDocument();
  });
});`
      },
      { 
        id: 'file-9', 
        path: '/app/components/JobScheduler.tsx', 
        name: 'JobScheduler.tsx', 
        type: 'component', 
        cardIds: ['card-5'], 
        epicIds: ['epic-3'],
        description: 'Drag-drop job scheduling calendar',
        code: `'use client';

import { useState } from 'react';
import { DndContext, DragEndEvent } from '@dnd-kit/core';

export function JobScheduler() {
  const [jobs, setJobs] = useState([]);
  const [view, setView] = useState<'week' | 'day'>('week');

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over) {
      // Update job time slot
      console.log('Move job', active.id, 'to', over.id);
    }
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="scheduler">
        <div className="view-toggle">
          <button onClick={() => setView('week')}>Week</button>
          <button onClick={() => setView('day')}>Day</button>
        </div>
        <div className="calendar-grid">
          {/* Time slots and job cards */}
        </div>
      </div>
    </DndContext>
  );
}`
      },
    ],
    dataFlows: [
      { id: 'flow-1', fromFileId: 'file-1', toFileId: 'file-2', direction: 'output', label: 'create lead' },
      { id: 'flow-2', fromFileId: 'file-3', toFileId: 'file-2', direction: 'output', label: 'assign lead' },
      { id: 'flow-3', fromFileId: 'file-4', toFileId: 'file-5', direction: 'output', label: 'send quote' },
    ],
  },
  {
    id: 'iteration-2',
    phase: 'v2',
    label: 'V2',
    description: 'Invoicing and payment collection',
    epics: [
      {
        id: 'epic-4',
        title: 'Billing',
        color: 'purple',
        activities: [
          {
            id: 'activity-4',
            epicId: 'epic-4',
            title: 'Invoicing completed work',
            cards: [
              {
                id: 'card-6',
                activityId: 'activity-4',
                title: 'Invoice generation from jobs',
                description: 'Convert completed jobs to invoices',
                status: 'todo',
                priority: 1,
                contextDocs: [],
                requirements: ['Job-to-invoice conversion', 'Payment terms', 'Due dates'],
                knownFacts: [],
                assumptions: [{ id: 'a-2', text: 'Invoices generated after job completion' }],
                questions: [],
                codeFileIds: ['file-10'],
              },
            ],
          },
        ],
      },
    ],
    codeFiles: [
      { id: 'file-10', path: '/api/invoices/route.ts', name: 'route.ts', type: 'api', cardIds: ['card-6'], epicIds: ['epic-4'] },
    ],
    dataFlows: [],
  },
];

export default function DossierPage() {
  const [appMode, setAppMode] = useState<'ideation' | 'active'>('ideation');
  const [viewMode, setViewMode] = useState<'functionality' | 'architecture'>('functionality');
  const [agentStatus, setAgentStatus] = useState<'idle' | 'building' | 'reviewing'>('idle');
  const [userRequest, setUserRequest] = useState('');
  
  // Project context - shows users what spawned this map
  const projectContext: ProjectContext = {
    userRequest: userRequest || "Build a field service management app like Jobber - capture leads, send quotes, schedule jobs, and invoice customers",
    generatedAt: "Just now",
    activeAgents: 3,
    lastUpdate: "Just now",
  };
  
  const handleIdeationComplete = (request: string) => {
    setUserRequest(request);
    setAppMode('active');
    setAgentStatus('building');
  };
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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
        onToggleMobileSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
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
            status: appMode === 'ideation' ? 'planning' : 'active',
            collaborators: ['You', 'AI Agent'],
          }}
          isIdeationMode={appMode === 'ideation'}
          onIdeationComplete={handleIdeationComplete}
          isMobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        {/* Center - Iteration Blocks or Empty State */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {appMode === 'ideation' ? (
            /* Empty state during ideation */
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="text-center max-w-md px-4 md:px-6">
                <div className="inline-flex items-center justify-center h-12 w-12 md:h-16 md:w-16 rounded-full bg-secondary mb-4 md:mb-6">
                  <Sparkles className="h-6 w-6 md:h-8 md:w-8 text-muted-foreground" />
                </div>
                <h2 className="text-lg md:text-xl font-semibold text-foreground mb-2 md:mb-3">Describe your idea</h2>
                <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                  <span className="md:hidden">Tap the menu to open the Agent chat and describe what you want to build.</span>
                  <span className="hidden md:inline">Use the Agent chat in the left panel to describe what you want to build. I'll ask a few questions, then generate an implementation roadmap.</span>
                </p>
                <div className="mt-4 md:mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                  <span>Waiting for your input...</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Project Context Banner - Fixed at top */}
              <div className="shrink-0 bg-secondary/80 backdrop-blur border-b border-border px-4 md:px-6 py-3 md:py-4">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 md:gap-6">
                  {/* User's original request */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">
                      <MessageSquare className="h-3 w-3" />
                      Your Request
                    </div>
                    <p className="text-xs md:text-sm text-foreground font-medium leading-relaxed line-clamp-2 md:line-clamp-none">
                      "{projectContext.userRequest}"
                    </p>
                  </div>
                  
                  {/* Agent status */}
                  <div className="flex items-center gap-3 md:gap-4 shrink-0">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Bot className="h-3.5 w-3.5 text-green-500" />
                        <span className="text-green-500 font-mono font-bold">{projectContext.activeAgents}</span>
                        <span className="hidden sm:inline text-muted-foreground">agents working</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span className="hidden sm:inline">Updated</span> {projectContext.lastUpdate}
                    </div>
                  </div>
                </div>
                
                {/* Explanation - hidden on mobile */}
                <p className="hidden md:block text-[11px] text-muted-foreground mt-3 leading-relaxed">
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
            </>
          )}
        </div>

        {/* Right Panel - Files/Terminal/Docs (Collapsible, hidden on mobile) */}
        {rightPanelOpen && (
        <div className="hidden lg:block">
          <RightPanel
            isOpen={rightPanelOpen}
            onClose={() => setRightPanelOpen(false)}
            activeDoc={selectedDoc}
            activeFile={selectedFile}
            activeTab={rightPanelTab}
            onTabChange={setRightPanelTab}
          />
        </div>
        )}
      </div>
    </div>
  );
}
