'use client';

import { useState } from 'react';
import { ChevronDown, Edit2, Check, X, Send } from 'lucide-react';
import type { Card, CardStatus, ContextDoc, CodeFile } from './types';

interface ImplementationCardProps {
  card: Card;
  isExpanded: boolean;
  onExpand: (cardId: string) => void;
  onAction: (cardId: string, action: string) => void;
  onUpdateDescription: (cardId: string, description: string) => void;
  onUpdateQuickAnswer: (cardId: string, quickAnswer: string) => void;
  onSelectDoc?: (doc: ContextDoc) => void;
  onSelectFile?: (file: CodeFile) => void;
  codeFiles?: CodeFile[];
}

const statusConfig: Record<CardStatus, { bg: string; text: string; border: string; badge: string; button: string }> = {
  todo: { 
    bg: 'bg-gray-100', 
    text: 'text-gray-700', 
    border: 'border-gray-300',
    badge: 'bg-gray-200 text-gray-700',
    button: 'bg-gray-500 hover:bg-gray-600'
  },
  active: { 
    bg: 'bg-green-50', 
    text: 'text-green-700', 
    border: 'border-green-200',
    badge: 'bg-green-200 text-green-700',
    button: 'bg-green-600 hover:bg-green-700'
  },
  questions: { 
    bg: 'bg-yellow-50', 
    text: 'text-yellow-700', 
    border: 'border-yellow-200',
    badge: 'bg-yellow-200 text-yellow-700',
    button: 'bg-red-600 hover:bg-red-700'
  },
  review: { 
    bg: 'bg-blue-50', 
    text: 'text-blue-700', 
    border: 'border-blue-200',
    badge: 'bg-blue-200 text-blue-700',
    button: 'bg-blue-600 hover:bg-blue-700'
  },
  production: { 
    bg: 'bg-emerald-50', 
    text: 'text-emerald-700', 
    border: 'border-emerald-200',
    badge: 'bg-emerald-200 text-emerald-700',
    button: 'bg-emerald-600 hover:bg-emerald-700'
  },
};

const statusLabels: Record<CardStatus, string> = {
  todo: 'todo',
  active: 'active',
  questions: 'questions',
  review: 'review',
  production: 'live',
};

const statusColors: Record<CardStatus, string> = {
  todo: 'bg-gray-100',
  active: 'bg-green-50',
  questions: 'bg-yellow-50',
  review: 'bg-blue-50',
  production: 'bg-emerald-50',
};

export function ImplementationCard({ 
  card, 
  isExpanded, 
  onExpand, 
  onAction,
  onUpdateDescription,
  onUpdateQuickAnswer,
  onSelectDoc,
  onSelectFile,
  codeFiles = [],
}: ImplementationCardProps) {
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(card.description || '');
  const [replyInput, setReplyInput] = useState('');
  const [isEditingQuickAnswer, setIsEditingQuickAnswer] = useState(false);
  const [editedQuickAnswer, setEditedQuickAnswer] = useState(card.quickAnswer || '');
  const sortedDocs = [...card.contextDocs].sort((a, b) => a.name.localeCompare(b.name));
  const testFiles = codeFiles.filter((f) => card.testFileIds?.includes(f.id));
  const config = statusConfig[card.status];
  const sortedCards = [...card.contextDocs].sort((a, b) => a.name.localeCompare(b.name));

  const getActionButtonText = () => {
    if (card.status === 'active') return 'Monitor';
    if (card.status === 'review') return 'Test';
    if (card.status === 'questions') return 'Reply';
    return 'Build';
  };

  const handleSaveDescription = () => {
    onUpdateDescription(card.id, editedDescription);
    setIsEditingDescription(false);
  };

  const handleCancelEdit = () => {
    setEditedDescription(card.description || '');
    setIsEditingDescription(false);
  };

  const handleReply = () => {
    if (replyInput.trim()) {
      // This would need an onUpdateQuickAnswer callback in production
      setReplyInput('');
    }
  };

  const handleSaveQuickAnswer = () => {
    onUpdateQuickAnswer(card.id, editedQuickAnswer);
    setIsEditingQuickAnswer(false);
  };

  const handleCancelQuickAnswer = () => {
    setEditedQuickAnswer(card.quickAnswer || '');
    setIsEditingQuickAnswer(false);
  };

  return (
    <div
      className={`border-2 rounded transition-all cursor-pointer group ${config.bg} ${config.border}`}
    >
      {/* Collapsed View */}
      <div
        className="p-3 space-y-2"
        onClick={() => onExpand(card.id)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h4 className={`text-xs font-mono font-bold uppercase tracking-widest ${config.text}`}>
              {card.title}
            </h4>
            {isEditingDescription ? (
              <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                <textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-gray-300 rounded text-gray-900"
                  placeholder="Enter description or user story..."
                  rows={3}
                />
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveDescription();
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    <Check className="h-3 w-3" />
                    Save
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancelEdit();
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                  >
                    <X className="h-3 w-3" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div 
                className="group/desc flex items-start gap-2 mt-1"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-xs text-gray-600 flex-1">{card.description || 'No description'}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingDescription(true);
                  }}
                  className="opacity-0 group-hover/desc:opacity-100 transition-opacity p-1 hover:bg-black/5 rounded"
                >
                  <Edit2 className="h-3 w-3 text-gray-400" />
                </button>
              </div>
            )}
          </div>
          {!isEditingDescription && (
            <ChevronDown
              className={`h-3 w-3 transition-transform flex-shrink-0 ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
          )}
        </div>

        {/* Status Badge + Context Tags */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-mono uppercase tracking-wider font-bold px-2 py-1 rounded ${config.badge}`}>
            {statusLabels[card.status]}
          </span>
          {sortedDocs.slice(0, 2).map((doc) => (
            <span
              key={doc.id}
              className="text-[10px] px-2 py-0.5 bg-white/60 text-gray-600 rounded"
            >
              {doc.name}
            </span>
          ))}
          {sortedDocs.length > 2 && (
            <span className="text-[10px] text-gray-500">
              +{sortedDocs.length - 2}
            </span>
          )}
        </div>

        {/* Quick Answer - Shows on closed card for questions status */}
        {card.status === 'questions' && card.quickAnswer && (
          <div className="mt-2 pt-2 border-t border-yellow-200">
            <p className="text-xs text-gray-600 leading-relaxed italic">
              {card.quickAnswer}
            </p>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAction(card.id, card.status === 'active' ? 'monitor' : card.status === 'review' ? 'test' : 'build');
            }}
            className={`w-full px-2 py-1.5 text-xs font-mono uppercase tracking-widest font-bold text-white rounded transition-colors ${config.button}`}
          >
            {getActionButtonText()}
          </button>
        </div>
      </div>

      {/* Expanded View */}
      {isExpanded && (
        <div className="border-t-2 p-4 space-y-4 bg-white/50" onClick={(e) => e.stopPropagation()}>
          {/* Requirements */}
          {card.requirements.length > 0 && (
            <div>
              <h5 className={`text-xs font-mono font-bold uppercase tracking-widest ${config.text} mb-2`}>
                Requirements
              </h5>
              <ul className="space-y-1">
                {card.requirements.map((req, idx) => (
                  <li key={idx} className="text-xs text-gray-600">
                    • {req}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Context Docs */}
          {sortedDocs.length > 0 && (
            <div>
              <h5 className={`text-xs font-mono font-bold uppercase tracking-widest ${config.text} mb-2`}>
                Context
              </h5>
              <div className="space-y-1">
                {sortedDocs.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => onSelectDoc?.(doc)}
                    className="block w-full text-left text-xs px-2 py-1 bg-white border border-gray-300 rounded hover:border-gray-400 transition-colors text-gray-700"
                  >
                    {doc.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Test Files - shown for all expanded cards */}
          <div>
            <h5 className={`text-xs font-mono font-bold uppercase tracking-widest ${config.text} mb-2`}>
              Tests
            </h5>
            {testFiles.length > 0 ? (
              <div className="space-y-1">
                {testFiles.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => onSelectFile?.(file)}
                    className="block w-full text-left text-xs px-2 py-1 bg-white border border-gray-300 rounded hover:border-gray-400 transition-colors text-gray-700"
                  >
                    {file.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">No tests assigned</p>
            )}
          </div>

          {/* Known Facts */}
          {card.knownFacts.length > 0 && (
            <div>
              <h5 className={`text-xs font-mono font-bold uppercase tracking-widest ${config.text} mb-2`}>
                Known Facts
              </h5>
              <ul className="space-y-1">
                {card.knownFacts.map((fact) => (
                  <li key={fact.id} className="text-xs text-gray-600">
                    • {fact.text}
                    {fact.source && <span className="text-[10px] ml-1">({fact.source})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Assumptions */}
          {card.assumptions.length > 0 && (
            <div>
              <h5 className={`text-xs font-mono font-bold uppercase tracking-widest ${config.text} mb-2`}>
                Assumptions
              </h5>
              <ul className="space-y-1">
                {card.assumptions.map((assumption) => (
                  <li key={assumption.id} className="text-xs text-gray-600 cursor-pointer hover:text-gray-900">
                    • {assumption.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Questions - Shared Input for Users & Agents */}
          {card.questions.length > 0 && (
            <div>
              <h5 className="text-xs font-mono font-bold uppercase tracking-widest text-gray-700 mb-2">
                Questions
              </h5>
              <ul className="space-y-1 mb-3">
                {card.questions.map((question) => (
                  <li key={question.id} className="text-xs text-gray-600">
                    • {question.text}
                  </li>
                ))}
              </ul>

              {/* Answer/Response Box */}
              <div className="border-t border-yellow-200 pt-2">
                {isEditingQuickAnswer ? (
                  <div className="space-y-2">
                    <textarea
                      value={editedQuickAnswer}
                      onChange={(e) => setEditedQuickAnswer(e.target.value)}
                      className="w-full text-xs p-2 bg-white border border-gray-300 rounded text-gray-900"
                      placeholder="Provide an answer or clarification..."
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveQuickAnswer}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        <Check className="h-3 w-3" />
                        Save
                      </button>
                      <button
                        onClick={handleCancelQuickAnswer}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                      >
                        <X className="h-3 w-3" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="group/answer flex items-start gap-2">
                    <p className="text-xs text-gray-600 flex-1 leading-relaxed">
                      {card.quickAnswer || 'Awaiting response...'}
                    </p>
                    <button
                      onClick={() => setIsEditingQuickAnswer(true)}
                      className="opacity-0 group-hover/answer:opacity-100 transition-opacity p-1 hover:bg-black/5 rounded"
                    >
                      <Edit2 className="h-3 w-3 text-gray-400" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
