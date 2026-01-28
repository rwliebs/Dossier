'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, BookOpen, Bot, User, Send, Loader2, Github, Check, FolderOpen, Folder, FileCode, ChevronRight, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProjectInfo {
  name: string;
  description: string;
  status: 'active' | 'planning' | 'completed';
  collaborators: string[];
}

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
}

interface ClarifyingQuestion {
  id: string;
  question: string;
  options?: string[];
}

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileNode[];
}

interface LeftSidebarProps {
  isCollapsed: boolean;
  onToggle: (collapsed: boolean) => void;
  project: ProjectInfo;
  // Ideation/chat props
  isIdeationMode?: boolean;
  onIdeationComplete?: (request: string) => void;
}

const initialQuestions: ClarifyingQuestion[] = [
  { id: 'q1', question: 'Who are the primary users of this product?', options: ['Small business owners', 'Enterprise teams', 'Consumers', 'Field workers'] },
  { id: 'q2', question: "What's the most critical workflow they need to accomplish?" },
  { id: 'q3', question: 'Do you have existing systems this needs to integrate with?', options: ['Accounting software', 'CRM', 'Calendar/scheduling', 'Payment processing', 'None yet'] },
];

const mockFileTree: FileNode[] = [
  { name: 'src', type: 'folder', path: '/src', children: [
    { name: 'components', type: 'folder', path: '/src/components', children: [
      { name: 'Dashboard.tsx', type: 'file', path: '/src/components/Dashboard.tsx' },
      { name: 'CustomerList.tsx', type: 'file', path: '/src/components/CustomerList.tsx' },
    ]},
    { name: 'api', type: 'folder', path: '/src/api', children: [
      { name: 'customers.ts', type: 'file', path: '/src/api/customers.ts' },
    ]},
  ]},
  { name: 'prisma', type: 'folder', path: '/prisma', children: [
    { name: 'schema.prisma', type: 'file', path: '/prisma/schema.prisma' },
  ]},
];

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

export function LeftSidebar({ isCollapsed, onToggle, project, isIdeationMode = false, onIdeationComplete }: LeftSidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['overview', 'chat', 'github'])
  );
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [phase, setPhase] = useState<'input' | 'questions' | 'generating'>('input');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userIdea, setUserIdea] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // GitHub state
  const [githubConnected, setGithubConnected] = useState(false);
  const [selectedContextFiles, setSelectedContextFiles] = useState<string[]>([]);
  const repoName = 'acme/servicepro-app';

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);

  const addMessage = (role: 'user' | 'agent', content: string) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role, content }]);
  };

  const askQuestion = (index: number) => {
    if (index >= initialQuestions.length) {
      setPhase('generating');
      addMessage('agent', 'Perfect! Generating your implementation roadmap...');
      setTimeout(() => onIdeationComplete?.(userIdea), 2000);
      return;
    }
    setCurrentQuestionIndex(index);
    setTimeout(() => addMessage('agent', initialQuestions[index].question), 400);
  };

  const handleSubmit = () => {
    if (!input.trim()) return;
    const text = input.trim();
    addMessage('user', text);
    setInput('');
    setIsThinking(true);

    if (phase === 'input') {
      setUserIdea(text);
      setTimeout(() => {
        setIsThinking(false);
        addMessage('agent', "Great! Let me ask a few questions to understand your vision better.");
        setTimeout(() => { setPhase('questions'); askQuestion(0); }, 600);
      }, 1000);
    } else if (phase === 'questions') {
      setTimeout(() => {
        setIsThinking(false);
        const acks = ['Got it!', 'Thanks!', 'Understood!', 'Great!'];
        addMessage('agent', acks[currentQuestionIndex % acks.length]);
        setTimeout(() => askQuestion(currentQuestionIndex + 1), 400);
      }, 800);
    }
  };

  const handleQuickAnswer = (answer: string) => {
    addMessage('user', answer);
    setIsThinking(true);
    setTimeout(() => {
      setIsThinking(false);
      const acks = ['Got it!', 'Thanks!', 'Understood!', 'Great!'];
      addMessage('agent', acks[currentQuestionIndex % acks.length]);
      setTimeout(() => askQuestion(currentQuestionIndex + 1), 400);
    }, 600);
  };

  const toggleContextFile = (path: string) => {
    setSelectedContextFiles(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);
  };

  const currentQuestion = phase === 'questions' ? initialQuestions[currentQuestionIndex] : null;

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

      {/* Agent Chat Section */}
      <div className="border-b border-grid-line flex-1 flex flex-col min-h-0">
        <button
          onClick={() => toggleSection('chat')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary transition-colors shrink-0"
        >
          <div className="flex items-center gap-2">
            <Bot className="h-3.5 w-3.5" />
            <span className="text-xs uppercase tracking-wider font-mono font-bold">Agent</span>
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
                  <p className="text-[11px] text-muted-foreground">Describe what you want to build</p>
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
              {isThinking && (
                <div className="flex gap-2">
                  <div className="h-5 w-5 rounded-full bg-secondary flex items-center justify-center"><Bot className="h-2.5 w-2.5" /></div>
                  <div className="bg-secondary rounded px-2 py-1.5"><Loader2 className="h-3 w-3 animate-spin" /></div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            
            {/* Quick options */}
            {currentQuestion?.options && !isThinking && phase === 'questions' && (
              <div className="px-3 pb-2 flex flex-wrap gap-1">
                {currentQuestion.options.map((opt) => (
                  <button key={opt} onClick={() => handleQuickAnswer(opt)} className="px-2 py-1 text-[10px] bg-secondary hover:bg-secondary/80 rounded-full border border-grid-line">{opt}</button>
                ))}
              </div>
            )}
            
            {/* Input */}
            {phase !== 'generating' && (
              <div className="p-3 border-t border-grid-line">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSubmit())}
                    placeholder={phase === 'input' ? 'Describe your idea...' : 'Your answer...'}
                    className="flex-1 px-2 py-1.5 text-xs bg-secondary border border-grid-line rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
                    disabled={isThinking}
                  />
                  <Button size="sm" className="h-7 w-7 p-0" onClick={handleSubmit} disabled={!input.trim() || isThinking}>
                    <Send className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
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
                  <Github className="h-3 w-3" />
                  <span className="text-[11px] font-mono flex-1 truncate">{repoName}</span>
                  <Check className="h-3 w-3 text-green-500" />
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">Select files for context:</p>
                <div className="border border-grid-line rounded bg-background max-h-32 overflow-y-auto">
                  {mockFileTree.map((node) => (
                    <FileTreeNode key={node.path} node={node} selectedFiles={selectedContextFiles} onToggleFile={toggleContextFile} />
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-[10px] text-muted-foreground mb-2">Connect a repo to include existing code as context.</p>
                <Button variant="outline" size="sm" className="w-full text-[11px] h-7 bg-transparent" onClick={() => setGithubConnected(true)}>
                  <Github className="h-3 w-3 mr-1.5" />Connect Repository
                </Button>
              </>
            )}
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
