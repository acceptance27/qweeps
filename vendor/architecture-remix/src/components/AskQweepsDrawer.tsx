import React, { useEffect, useState } from 'react';
import {
  X,
  HelpCircle,
  PlayCircle,
  ArrowLeft,
  ChevronRight,
  Code2,
  CheckCircle2,
  Sparkles,
  Send,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  MINI_EXPLANATION_STEPS,
  MINI_EXPLANATION_TITLE,
  PREPARED_QUESTIONS,
} from '../data/askQweepsData';
import {
  ArchitectureGraph,
  ContextualQuestion,
  NodeId,
  SavedParentState,
  Step,
} from '../types/lesson';

interface AskQweepsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNodeId: NodeId | null;
  currentStep: Step;
  totalBeatsCount: number;
  playhead: number;
  highlightedCodeLines: number[];
  activeGraph: ArchitectureGraph;
  sourceCode: string;
  lessonTitle: string;
  questions?: ContextualQuestion[];
  miniModeActive: boolean;
  miniStepIndex: number;
  savedParentState: SavedParentState | null;
  onStartMiniExplanation: () => void;
  onSelectMiniStep: (index: number) => void;
  onExitMiniExplanation: () => void;
}

interface LiveAiAnswer {
  question: string;
  answer: string;
  takeaway: string;
  codeLines: number[];
}

export const AskQweepsDrawer: React.FC<AskQweepsDrawerProps> = ({
  isOpen,
  onClose,
  selectedNodeId,
  currentStep,
  totalBeatsCount,
  playhead,
  highlightedCodeLines,
  activeGraph,
  sourceCode,
  lessonTitle,
  questions,
  miniModeActive,
  miniStepIndex,
  savedParentState,
  onStartMiniExplanation,
  onSelectMiniStep,
  onExitMiniExplanation,
}) => {
  const effectiveQuestions =
    questions && questions.length > 0 ? questions : PREPARED_QUESTIONS;

  const [selectedQuestionId, setSelectedQuestionId] = useState<string>(
    effectiveQuestions[0]?.id ?? PREPARED_QUESTIONS[0].id
  );

  // Live OpenCode Go context-aware Q&A state
  const [customQuery, setCustomQuery] = useState<string>('');
  const [isAskingAi, setIsAskingAi] = useState<boolean>(false);
  const [liveAiAnswer, setLiveAiAnswer] = useState<LiveAiAnswer | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (
      effectiveQuestions.length > 0 &&
      !effectiveQuestions.some((q) => q.id === selectedQuestionId)
    ) {
      setSelectedQuestionId(effectiveQuestions[0].id);
    }
  }, [effectiveQuestions, selectedQuestionId]);

  if (!isOpen) return null;

  // Sort questions so those relevant to the selectedNodeId or currentStep appear first
  const sortedQuestions = [...effectiveQuestions].sort((a, b) => {
    const aMatchesNode =
      selectedNodeId && a.relatedNodes?.includes(selectedNodeId) ? 2 : 0;
    const bMatchesNode =
      selectedNodeId && b.relatedNodes?.includes(selectedNodeId) ? 2 : 0;
    const aMatchesBeat = a.relatedStepIds?.includes(currentStep.id) ? 1 : 0;
    const bMatchesBeat = b.relatedStepIds?.includes(currentStep.id) ? 1 : 0;
    return bMatchesNode + bMatchesBeat - (aMatchesNode + aMatchesBeat);
  });

  const activeQuestion =
    effectiveQuestions.find((q) => q.id === selectedQuestionId) ??
    sortedQuestions[0];

  const selectedNodeObj = selectedNodeId
    ? activeGraph.nodes.find((n) => n.id === selectedNodeId)
    : null;

  const handleAskLiveAi = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customQuery.trim();
    if (!trimmed || isAskingAi) return;

    setIsAskingAi(true);
    setAiError(null);

    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          lessonTitle,
          sourceCode,
          playhead,
          ledger: activeGraph.workedExampleLedger ?? {},
          currentBeat: {
            beatNumber: currentStep.beatNumber,
            title: currentStep.title,
            question: currentStep.question,
            narration: currentStep.narration,
            codeLines: highlightedCodeLines,
            stateBefore: currentStep.stateBefore,
            stateAfter: currentStep.stateAfter,
          },
          selectedNode: selectedNodeObj
            ? {
                id: selectedNodeObj.id,
                label: selectedNodeObj.label,
                roleSummary: selectedNodeObj.roleSummary,
                description: selectedNodeObj.description,
              }
            : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get response from OpenCode Go');
      }

      setLiveAiAnswer({
        question: trimmed,
        answer: data.answer,
        takeaway: data.takeaway,
        codeLines:
          Array.isArray(data.codeLines) && data.codeLines.length > 0
            ? data.codeLines
            : highlightedCodeLines,
      });
      setCustomQuery('');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to reach AI endpoint');
    } finally {
      setIsAskingAi(false);
    }
  };

  return (
    <aside
      aria-label="Contextual Ask QWEEPS assistant"
      className="absolute top-2.5 right-2.5 bottom-2.5 w-[calc(100%-1.25rem)] sm:w-[445px] bg-[#2B2D30] border border-[#4E5157] rounded-md shadow-xl z-40 flex flex-col overflow-hidden"
    >
      {/* Top Tool Window Header */}
      <div className="px-3.5 py-2.5 bg-[#2B2D30] border-b border-[#393B40] flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#56A8F5] shrink-0" />
            <span className="font-mono text-xs font-semibold text-[#DFE1E5] tracking-wide">
              Ask QWEEPS
            </span>
            <span className="text-xs text-[#6F737A]">·</span>
            <span className="text-[11px] text-[#6AAB73] font-mono">
              Procedural Context + OpenCode Go
            </span>
          </div>
          <p className="text-xs text-[#868A91] truncate mt-0.5">
            Grounded in exact beat state, selected block &amp; source lines
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="min-h-[30px] min-w-[30px] px-2.5 py-1 rounded border border-[#4E5157] bg-[#35373B] text-[#DFE1E5] hover:bg-[#3E4146] flex items-center justify-center gap-1 text-xs cursor-pointer shrink-0 transition-colors"
          aria-label="Close Ask QWEEPS drawer"
        >
          <X className="w-3.5 h-3.5" />
          <span>Close</span>
        </button>
      </div>

      {/* Captured Context Bar (shows selected node, beat, time, and code lines) */}
      <div className="px-3.5 py-2 bg-[#232529] border-b border-[#393B40] text-xs flex flex-wrap items-center gap-x-3 gap-y-1 shrink-0 font-mono">
        <span className="text-[#56A8F5]">
          Beat {currentStep.beatNumber}/{totalBeatsCount} ({currentStep.title})
        </span>
        <span className="text-[#6F737A]">·</span>
        <span className="text-[#6AAB73]">Time: {playhead.toFixed(1)}s</span>
        <span className="text-[#6F737A]">·</span>
        <span className="text-[#DFE1E5]">
          Node: {selectedNodeId ?? currentStep.focusNodes.join(', ')}
        </span>
        <span className="text-[#6F737A]">·</span>
        <span className="text-[#D9A354]">
          L{highlightedCodeLines.join(',')}
        </span>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-3.5 bg-[#1E1F22] space-y-4 select-text">
        {/* Live OpenCode Go Context-Aware Question Input */}
        <div className="p-3 rounded border border-[#393B40] bg-[#25272B] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#DFE1E5] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#56A8F5] shrink-0" />
              <span>Ask OpenCode Go about this beat</span>
            </span>
            <span className="font-mono text-[10.5px] text-[#868A91]">
              Live Explanatory Pass
            </span>
          </div>

          <form onSubmit={handleAskLiveAi} className="flex gap-1.5">
            <input
              type="text"
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              placeholder={`Ask about ${selectedNodeObj ? selectedNodeObj.label : currentStep.title}…`}
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded bg-[#1E1F22] border border-[#4E5157] text-xs text-[#DFE1E5] placeholder-[#6F737A] focus:outline-none focus:border-[#3574F0]"
            />
            <button
              type="submit"
              disabled={isAskingAi || !customQuery.trim()}
              className="px-3 py-1.5 rounded bg-[#3574F0] text-white font-semibold text-xs flex items-center gap-1.5 hover:bg-[#4682FA] disabled:opacity-50 transition-colors cursor-pointer shrink-0"
            >
              {isAskingAi ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Ask</span>
            </button>
          </form>

          {aiError && (
            <div className="p-2 rounded border border-[#D46A6E]/50 bg-[#D46A6E]/10 text-xs text-[#E88B8E] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#D46A6E] shrink-0 mt-0.5" />
              <span>{aiError}</span>
            </div>
          )}

          {liveAiAnswer && (
            <div className="p-2.5 rounded border border-[#3574F0] bg-[#1E1F22] space-y-2">
              <div className="flex items-center justify-between gap-2 border-b border-[#393B40] pb-1.5">
                <span className="text-[11px] font-mono text-[#56A8F5] font-semibold">
                  OpenCode Go Explanation
                </span>
                <span className="font-mono text-[10.5px] text-[#6AAB73] flex items-center gap-1">
                  <Code2 className="w-3 h-3" />
                  L{liveAiAnswer.codeLines.join(', ')}
                </span>
              </div>
              <div className="text-xs font-semibold text-[#DFE1E5]">
                Q: {liveAiAnswer.question}
              </div>
              <p className="text-xs text-[#BCBEC4] leading-relaxed">
                {liveAiAnswer.answer}
              </p>
              <div className="p-2 rounded bg-[#25272B] border border-[#393B40] text-xs text-[#D9A354]">
                <span className="font-semibold">Takeaway: </span>
                <span className="text-[#DFE1E5]">{liveAiAnswer.takeaway}</span>
              </div>
            </div>
          )}
        </div>

        {/* 3-Step Mini-Explanation Card with Breadcrumb Restoration */}
        <div className="p-3 rounded border border-[#393B40] bg-[#25272B] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#56A8F5] flex items-center gap-1.5">
              <PlayCircle className="w-4 h-4 shrink-0" />
              <span>{MINI_EXPLANATION_TITLE}</span>
            </span>
            <span className="font-mono text-[11px] text-[#6AAB73]">3 steps</span>
          </div>

          <p className="text-xs text-[#868A91] leading-relaxed">
            Walk through a focused 3-step trace showing how{' '}
            <code className="text-[#DFE1E5]">refund-policy</code> moves from
            retrieval into the prompt and final answer. Your current playhead,
            node selection, and camera are saved and restored via breadcrumb.
          </p>

          {!miniModeActive ? (
            <button
              type="button"
              onClick={onStartMiniExplanation}
              className="w-full min-h-[34px] px-3 py-1.5 rounded border border-[#3574F0] bg-[#2E436E] text-[#DFE1E5] font-semibold text-xs flex items-center justify-center gap-2 hover:bg-[#3574F0] hover:text-white transition-colors cursor-pointer"
            >
              <PlayCircle className="w-4 h-4 text-[#56A8F5]" />
              <span>
                Launch 3-Step Mini-Explanation (saves {playhead.toFixed(1)}s)
              </span>
            </button>
          ) : (
            <div className="space-y-2 pt-1">
              {/* Breadcrumb to return to parent lesson */}
              <div className="p-2 rounded border border-[#6AAB73]/60 bg-[#1E1F22] flex items-center justify-between gap-2">
                <div className="text-[11px] font-mono text-[#6AAB73] truncate">
                  Saved parent:{' '}
                  {savedParentState
                    ? `${savedParentState.playhead.toFixed(1)}s`
                    : `${playhead.toFixed(1)}s`}
                  {savedParentState?.selectedNodeId
                    ? ` · node: ${savedParentState.selectedNodeId}`
                    : ''}
                </div>
                <button
                  type="button"
                  onClick={onExitMiniExplanation}
                  className="px-2.5 py-1 rounded bg-[#3574F0] text-white font-semibold text-xs flex items-center gap-1 hover:bg-[#4682FA] transition-colors cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Parent Lesson</span>
                </button>
              </div>

              {/* 3 Interactive Mini-Steps */}
              <div className="space-y-1.5">
                {MINI_EXPLANATION_STEPS.map((ms, idx) => {
                  const isCurrent = idx === miniStepIndex;
                  return (
                    <button
                      key={ms.stepNumber}
                      type="button"
                      onClick={() => onSelectMiniStep(idx)}
                      className={`w-full text-left p-2.5 rounded border transition-colors cursor-pointer ${
                        isCurrent
                          ? 'border-[#3574F0] bg-[#263248] text-[#DFE1E5]'
                          : 'border-[#393B40] bg-[#1E1F22] text-[#868A91] hover:border-[#4E5157]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold mb-1">
                        <span
                          className={
                            isCurrent ? 'text-[#56A8F5]' : 'text-[#DFE1E5]'
                          }
                        >
                          {ms.title}
                        </span>
                        <span className="font-mono text-[11px] text-[#6AAB73]">
                          L{ms.codeLines.join(',')}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-[#BCBEC4]">
                        {ms.caption}
                      </p>
                      {isCurrent && (
                        <div className="mt-1.5 p-1.5 rounded bg-[#1E1F22] border border-[#393B40] font-mono text-[11px] text-[#6AAB73]">
                          {ms.dataSnapshot}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Contextual Questions (Procedural or AI-Filled) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#DFE1E5]">
              Contextual Questions ({sortedQuestions.length})
            </h3>
            <span className="text-[11px] text-[#868A91]">
              Click to inspect answer
            </span>
          </div>

          <div className="space-y-1.5">
            {sortedQuestions.map((q) => {
              const isSelected = q.id === activeQuestion?.id;
              const matchesCurrentContext =
                (selectedNodeId && q.relatedNodes?.includes(selectedNodeId)) ||
                q.relatedStepIds?.includes(currentStep.id);

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setSelectedQuestionId(q.id)}
                  className={`w-full text-left px-3 py-2 rounded border transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'border-[#3574F0] bg-[#263248] text-[#DFE1E5]'
                      : 'border-[#393B40] bg-[#25272B] text-[#868A91] hover:border-[#4E5157] hover:text-[#DFE1E5]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs sm:text-[13px] font-medium text-[#DFE1E5]">
                      {q.question}
                    </div>
                    <div className="text-[11px] font-mono text-[#868A91] truncate mt-0.5">
                      {q.shortContext}
                      {matchesCurrentContext ? ' · Matches current focus' : ''}
                    </div>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 shrink-0 ${
                      isSelected ? 'text-[#56A8F5]' : 'text-[#6F737A]'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Prepared Answer Detail */}
        {activeQuestion && (
          <div className="p-3 rounded border border-[#393B40] bg-[#25272B] space-y-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-[#393B40] pb-2">
              <span className="text-xs font-semibold text-[#6AAB73] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Grounded Explanatory Note</span>
              </span>
              <span className="font-mono text-[11px] text-[#D9A354] flex items-center gap-1">
                <Code2 className="w-3 h-3" />
                L{activeQuestion.codeLines.join(', ')}
              </span>
            </div>

            <h4 className="text-xs sm:text-sm font-semibold text-[#DFE1E5]">
              {activeQuestion.question}
            </h4>

            <p className="text-xs sm:text-[13px] text-[#BCBEC4] leading-relaxed">
              {activeQuestion.answer}
            </p>

            <div className="p-2 rounded bg-[#1E1F22] border border-[#393B40] text-xs text-[#D9A354]">
              <span className="font-semibold">Key takeaway: </span>
              <span className="text-[#DFE1E5]">{activeQuestion.takeaway}</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
