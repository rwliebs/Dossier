'use client';

import React from "react"

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Github, Check, FolderGit2, FileCode, ChevronRight, Plus, X } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

interface ClarifyingQuestion {
  id: string;
  question: string;
  options?: string[];
}

interface IdeationViewProps {
  onComplete: (request: string) => void;
}

const initialQuestions: ClarifyingQuestion[] = [
  {
    id: 'q1',
    question: 'Who are the primary users of this product?',
    options: ['Small business owners', 'Enterprise teams', 'Consumers', 'Field workers'],
  },
  {
    id: 'q2',
    question: 'What\'s the most critical workflow they need to accomplish?',
  },
  {
    id: 'q3',
    question: 'Do you have existing systems this needs to integrate with?',
    options: ['Accounting software', 'CRM', 'Calendar/scheduling', 'Payment processing', 'None yet'],
  },
];

// Mock GitHub repo data
const mockRepoFiles = [
  { path: 'src/components/Dashboard.tsx', type: 'component' },
  { path: 'src/components/CustomerList.tsx', type: 'component' },
  { path: 'src/api/customers.ts', type: 'api' },
  { path: 'src/api/invoices.ts', type: 'api' },
  { path: 'src/hooks/useCustomers.ts', type: 'hook' },
  { path: 'src/lib/db.ts', type: 'util' },
  { path: 'src/types/customer.ts', type: 'schema' },
  { path: 'prisma/schema.prisma', type: 'schema' },
];

export function IdeationView({ onComplete }: IdeationViewProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userIdea, setUserIdea] = useState('');
  const [phase, setPhase] = useState<'input' | 'questions' | 'generating'>('input');
  const [selectedContextFiles, setSelectedContextFiles] = useState<string[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Mock GitHub connection status
  const githubConnected = true;
  const repoName = 'acme/servicepro-app';

  const toggleContextFile = (path: string) => {
    setSelectedContextFiles(prev => 
      prev.includes(path) 
        ? prev.filter(p => p !== path)
        : [...prev, path]
    );
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addMessage = (role: 'user' | 'agent', content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role, content, timestamp: new Date() },
    ]);
  };

  const handleSubmitIdea = () => {
    if (!input.trim()) return;

    const idea = input.trim();
    setUserIdea(idea);
    addMessage('user', idea);
    setInput('');
    setIsThinking(true);

    // Simulate agent thinking
    setTimeout(() => {
      setIsThinking(false);
      addMessage(
        'agent',
        `Great idea! I'd like to understand your vision better so I can create a comprehensive implementation plan. Let me ask a few clarifying questions.`
      );
      
      setTimeout(() => {
        setPhase('questions');
        askQuestion(0);
      }, 800);
    }, 1500);
  };

  const askQuestion = (index: number) => {
    if (index >= initialQuestions.length) {
      // All questions answered, generate the map
      setPhase('generating');
      addMessage('agent', 'Perfect! I have enough context now. Let me generate your implementation roadmap...');
      
      setTimeout(() => {
        onComplete(userIdea);
      }, 2500);
      return;
    }

    const q = initialQuestions[index];
    setCurrentQuestionIndex(index);
    
    setTimeout(() => {
      addMessage('agent', q.question);
    }, 500);
  };

  const handleAnswerQuestion = (answer?: string) => {
    const response = answer || input.trim();
    if (!response) return;

    addMessage('user', response);
    setInput('');
    setIsThinking(true);

    setTimeout(() => {
      setIsThinking(false);
      
      // Acknowledge and move to next question
      const acknowledgments = [
        'Got it, that helps!',
        'Thanks, that\'s useful context.',
        'Understood!',
        'Great, that gives me a clearer picture.',
      ];
      
      addMessage('agent', acknowledgments[currentQuestionIndex % acknowledgments.length]);
      
      setTimeout(() => {
        askQuestion(currentQuestionIndex + 1);
      }, 600);
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (phase === 'input') {
        handleSubmitIdea();
      } else if (phase === 'questions') {
        handleAnswerQuestion();
      }
    }
  };

  const currentQuestion = phase === 'questions' ? initialQuestions[currentQuestionIndex] : null;

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <h1 className="text-lg font-semibold text-foreground">New Project</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Describe your product idea and I'll help you create an implementation roadmap.
              </p>
            </div>
            
            {/* GitHub Connection Status */}
            {githubConnected && (
              <div className="shrink-0">
                <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg border border-border">
                  <Github className="h-4 w-4 text-foreground" />
                  <span className="text-sm font-medium text-foreground">{repoName}</span>
                  <Check className="h-3.5 w-3.5 text-green-500" />
                </div>
              </div>
            )}
          </div>
          
          {/* Context Files Section */}
          {githubConnected && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FolderGit2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Project Context</span>
                  <span className="text-xs text-muted-foreground">(optional)</span>
                </div>
                <button
                  onClick={() => setShowFilePicker(!showFilePicker)}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add files for context
                </button>
              </div>
              
              {/* Selected Context Files */}
              {selectedContextFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedContextFiles.map((path) => (
                    <div
                      key={path}
                      className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full"
                    >
                      <FileCode className="h-3 w-3" />
                      <span>{path.split('/').pop()}</span>
                      <button
                        onClick={() => toggleContextFile(path)}
                        className="hover:bg-primary/20 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {selectedContextFiles.length === 0 && !showFilePicker && (
                <p className="text-xs text-muted-foreground">
                  Adding existing files helps the agent understand your codebase when planning new features.
                </p>
              )}
              
              {/* File Picker */}
              {showFilePicker && (
                <div className="bg-background border border-border rounded-lg p-3 max-h-48 overflow-y-auto">
                  <div className="space-y-1">
                    {mockRepoFiles.map((file) => (
                      <button
                        key={file.path}
                        onClick={() => toggleContextFile(file.path)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-secondary transition-colors ${
                          selectedContextFiles.includes(file.path) ? 'bg-primary/10 text-primary' : 'text-foreground'
                        }`}
                      >
                        <FileCode className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate text-left">{file.path}</span>
                        {selectedContextFiles.includes(file.path) && (
                          <Check className="h-3 w-3 ml-auto shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowFilePicker(false)}
                    className="mt-2 w-full py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-secondary mb-4">
                <Bot className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-medium text-foreground mb-2">What would you like to build?</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Describe your product idea, feature, or problem you want to solve. I'll ask clarifying questions and generate an implementation plan.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {message.role === 'user' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-foreground'
                }`}
              >
                <p className="text-sm leading-relaxed">{message.content}</p>
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="bg-secondary rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          {phase === 'generating' && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              </div>
              <div className="bg-primary/10 rounded-lg px-4 py-3 flex-1">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-primary font-medium">Generating implementation roadmap...</span>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="h-2 bg-primary/20 rounded animate-pulse" style={{ width: '80%' }} />
                  <div className="h-2 bg-primary/20 rounded animate-pulse" style={{ width: '60%' }} />
                  <div className="h-2 bg-primary/20 rounded animate-pulse" style={{ width: '70%' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Quick Answer Options */}
      {currentQuestion?.options && phase === 'questions' && !isThinking && (
        <div className="px-8 pb-2">
          <div className="max-w-3xl mx-auto">
            <div className="flex flex-wrap gap-2">
              {currentQuestion.options.map((option) => (
                <button
                  key={option}
                  onClick={() => handleAnswerQuestion(option)}
                  className="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 text-foreground rounded-full border border-border transition-colors"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      {phase !== 'generating' && (
        <div className="border-t border-border px-8 py-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  phase === 'input'
                    ? 'Describe your product idea...'
                    : 'Type your answer...'
                }
                className="flex-1 px-4 py-3 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                disabled={isThinking}
              />
              <button
                onClick={phase === 'input' ? handleSubmitIdea : () => handleAnswerQuestion()}
                disabled={!input.trim() || isThinking}
                className="px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Press Enter to send
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
