export type CardStatus = 'todo' | 'active' | 'questions' | 'review' | 'production';
export type ViewMode = 'functionality' | 'architecture';
export type EpicColor = 'yellow' | 'blue' | 'purple' | 'green' | 'orange' | 'pink';
export type IterationPhase = 'mvp' | 'v2' | 'v3' | 'later';
export type FileType = 'component' | 'api' | 'service' | 'hook' | 'util' | 'schema' | 'middleware';
export type DataFlowDirection = 'input' | 'output' | 'bidirectional';

// Project context - shows user what spawned this map
export interface ProjectContext {
  userRequest: string; // The original feature request from user
  generatedAt: string; // When this map was created
  activeAgents: number; // How many agents are currently working
  lastUpdate: string; // Last time an agent made progress
}

export interface ContextDoc {
  id: string;
  name: string;
  type: 'doc' | 'design' | 'code' | 'research';
  title?: string;
  content?: string;
}

export interface KnownFact {
  id: string;
  text: string;
  source?: string;
}

export interface Assumption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  text: string;
}

// Implementation card (stacked under a user activity)
export interface Card {
  id: string;
  activityId: string;
  title: string;
  description?: string;
  status: CardStatus;
  priority: number; // lower = higher priority (top to bottom)
  contextDocs: ContextDoc[];
  requirements: string[];
  knownFacts: KnownFact[];
  assumptions: Assumption[];
  questions: Question[];
  quickAnswer?: string; // Quick answer/resolution shown on closed card when in questions status
  codeFileIds?: string[]; // Links to code files this card is responsible for
  testFileIds?: string[]; // Links to test files for this card
}

// User activity/workflow step (horizontal level under an epic)
export interface UserActivity {
  id: string;
  epicId: string;
  title: string;
  cards: Card[];
}

// Epic/Journey stage (top horizontal level)
export interface Epic {
  id: string;
  title: string;
  color: EpicColor;
  activities: UserActivity[];
}

// Code file node in architecture view
export interface CodeFile {
  id: string;
  path: string; // e.g., '/app/components/Button.tsx', '/api/auth/route.ts'
  name: string; // e.g., 'Button.tsx', 'route.ts'
  type: FileType;
  description?: string; // What this file does and its purpose
  cardIds: string[]; // Cards this file implements
  epicIds: string[]; // Epics this file belongs to (for coloring)
  code?: string; // Demo code content for terminal display
}

// Data flow connection between files
export interface DataFlow {
  id: string;
  fromFileId: string;
  toFileId: string;
  direction: DataFlowDirection;
  label?: string; // e.g., 'props', 'API call', 'state'
}

// Iteration block containing a full story map
export interface Iteration {
  id: string;
  phase: IterationPhase;
  label: string; // 'MVP', 'V2', 'Later', etc.
  description: string;
  epics: Epic[];
  codeFiles?: CodeFile[];
  dataFlows?: DataFlow[];
}
