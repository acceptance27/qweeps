import {referenceValues} from '../referenceValues';
import {LiveQuestion,type LiveQuestionProps} from './LiveQuestion';
import React, { useState } from 'react';
import {
  X,
  HelpCircle,
  PlayCircle,
  ArrowLeft,
  ChevronRight,
  Code2,
  CheckCircle2,
} from 'lucide-react';
import {
  MINI_EXPLANATION_STEPS,
  MINI_EXPLANATION_TITLE,
  PREPARED_QUESTIONS as ORIGINAL_PREPARED_QUESTIONS,
} from '../data/askQweepsData';
import { NodeId, SavedParentState, Step } from '../types/lesson';

const PREPARED_QUESTIONS=referenceValues(ORIGINAL_PREPARED_QUESTIONS);

interface AskQweepsDrawerProps extends LiveQuestionProps {
  showPreparedQuestions:boolean;
  isOpen: boolean;
  onClose: () => void;
  selectedNodeId: NodeId | null;
  currentStep: Step;
  playhead: number;
  highlightedCodeLines: number[];
  miniModeActive: boolean;
  miniStepIndex: number;
  savedParentState: SavedParentState | null;
  onStartMiniExplanation: () => void;
  onSelectMiniStep: (index: number) => void;
  onExitMiniExplanation: () => void;
}

export const AskQweepsDrawer: React.FC<AskQweepsDrawerProps> = ({
  lesson,activeSubFunctionId,activeGraph,variables,onAsk,showPreparedQuestions,
  isOpen,
  onClose,
  selectedNodeId,
  currentStep,
  playhead,
  highlightedCodeLines,
  miniModeActive,
  miniStepIndex,
  savedParentState,
  onStartMiniExplanation,
  onSelectMiniStep,
  onExitMiniExplanation,
}) => {
  // Default to the question best matching the selected node or current beat
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>(
    PREPARED_QUESTIONS[0].id
  );


  // Sort questions so those relevant to the selectedNodeId or currentStep appear first
  const sortedQuestions = [...PREPARED_QUESTIONS].sort((a, b) => {
    const aMatchesNode = selectedNodeId && a.relatedNodes?.includes(selectedNodeId) ? 2 : 0;
    const bMatchesNode = selectedNodeId && b.relatedNodes?.includes(selectedNodeId) ? 2 : 0;
    const aMatchesBeat = a.relatedStepIds?.includes(currentStep.id) ? 1 : 0;
    const bMatchesBeat = b.relatedStepIds?.includes(currentStep.id) ? 1 : 0;
    return bMatchesNode + bMatchesBeat - (aMatchesNode + aMatchesBeat);
  });

  const activeQuestion =
    PREPARED_QUESTIONS.find((q) => q.id === selectedQuestionId) ?? sortedQuestions[0];

  return (
    <aside style={{display:isOpen?undefined:'none'}}
      aria-label="Contextual Ask QWEEPS assistant prototype"
      className="absolute top-2.5 right-2.5 bottom-2.5 w-[calc(100%-1.25rem)] sm:w-[430px] bg-[#142B25] border border-[#E0BE72] rounded shadow-2xl z-40 flex flex-col overflow-hidden"
    >
      {/* Top Header */}
      <div className="px-3.5 py-2.5 bg-[#0B1717] border-b border-[#486356] flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#E0BE72] shrink-0" />
            <span className="font-pixel text-xs text-[#E0BE72]">ASK QWEEPS</span>
            <span className="text-xs text-[#B5C5BD]">·</span>
            <span className="text-[11px] text-[#7BD3B0] font-mono">
              {showPreparedQuestions?'Local prototype responses':'QWEEPS AI'}
            </span>
          </div>
          <p className="text-xs text-[#B5C5BD] truncate mt-0.5">
            {showPreparedQuestions?'Context-aware Q&A · No live AI model call is running':'Ask about the current code, selected block and trace values'}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="min-h-[36px] min-w-[36px] px-2.5 py-1 rounded border border-[#486356] bg-[#142B25] text-[#EEF3E9] hover:border-[#E0BE72] hover:text-[#E0BE72] flex items-center justify-center gap-1 text-xs cursor-pointer shrink-0"
          aria-label="Close Ask QWEEPS drawer"
        >
          <X className="w-4 h-4" />
          <span>Close</span>
        </button>
      </div>

      {/* Captured Context Bar (shows selected node, beat, time, and code lines) */}
      <div className="px-3.5 py-2 bg-[#1A362E] border-b border-[#486356] text-xs flex flex-wrap items-center gap-x-3 gap-y-1 shrink-0 font-mono">
        <span className="text-[#E0BE72]">
          Beat {currentStep.beatNumber}/7 ({ currentStep.title })
        </span>
        <span className="text-[#B5C5BD]">·</span>
        <span className="text-[#7BD3B0]">Time: {playhead.toFixed(1)}s</span>
        <span className="text-[#B5C5BD]">·</span>
        <span className="text-[#EEF3E9]">
          Node: {selectedNodeId ?? currentStep.focusNodes.join(', ')}
        </span>
        <span className="text-[#B5C5BD]">·</span>
        <span className="text-[#91B9CC]">
          answer.py L{highlightedCodeLines.join(',')}
        </span>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 select-text">
        <LiveQuestion lesson={lesson} activeSubFunctionId={activeSubFunctionId} activeGraph={activeGraph} currentStep={currentStep} variables={variables} playhead={playhead} selectedNodeId={selectedNodeId} onAsk={onAsk}/>
        {showPreparedQuestions&&<>
        {/* 3-Step Mini-Explanation Card with Breadcrumb Restoration */}
        <div className="p-3 rounded border border-[#E0BE72] bg-[#0B1717] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#E0BE72] flex items-center gap-1.5">
              <PlayCircle className="w-4 h-4 shrink-0" />
              <span>{MINI_EXPLANATION_TITLE}</span>
            </span>
            <span className="font-mono text-[11px] text-[#7BD3B0]">3 steps</span>
          </div>

          <p className="text-xs text-[#B5C5BD] leading-relaxed">
            Walk through a focused 3-step trace showing how <code className="text-[#EEF3E9]">refund-policy</code> moves from retrieval into the prompt and final answer. Your current playhead, node selection, and camera are saved and restored via breadcrumb.
          </p>

          {!miniModeActive ? (
            <button
              type="button"
              onClick={onStartMiniExplanation}
              className="w-full min-h-[38px] px-3 py-2 rounded border border-[#E0BE72] bg-[#E0BE72] text-[#0B1717] font-semibold text-xs flex items-center justify-center gap-2 hover:bg-[#E0BE72]/90 transition-colors cursor-pointer"
            >
              <PlayCircle className="w-4 h-4" />
              <span>Launch 3-Step Mini-Explanation (saves {playhead.toFixed(1)}s)</span>
            </button>
          ) : (
            <div className="space-y-2 pt-1">
              {/* Breadcrumb to return to parent lesson */}
              <div className="p-2 rounded border border-[#7BD3B0] bg-[#142B25] flex items-center justify-between gap-2">
                <div className="text-[11px] font-mono text-[#7BD3B0] truncate">
                  Saved parent: {savedParentState ? `${savedParentState.playhead.toFixed(1)}s` : `${playhead.toFixed(1)}s`}
                  {savedParentState?.selectedNodeId
                    ? ` · node: ${savedParentState.selectedNodeId}`
                    : ''}
                </div>
                <button
                  type="button"
                  onClick={onExitMiniExplanation}
                  className="px-2.5 py-1 rounded bg-[#7BD3B0] text-[#0B1717] font-semibold text-xs flex items-center gap-1 hover:bg-[#7BD3B0]/90 transition-colors cursor-pointer shrink-0"
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
                          ? 'border-[#E0BE72] bg-[#1A362E] text-[#EEF3E9]'
                          : 'border-[#486356] bg-[#142B25]/50 text-[#B5C5BD] hover:border-[#7BD3B0]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold mb-1">
                        <span className={isCurrent ? 'text-[#E0BE72]' : 'text-[#EEF3E9]'}>
                          {ms.title}
                        </span>
                        <span className="font-mono text-[11px] text-[#7BD3B0]">
                          L{ms.codeLines.join(',')}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-[#EEF3E9]/90">
                        {ms.caption}
                      </p>
                      {isCurrent && (
                        <div className="mt-1.5 p-1.5 rounded bg-[#0B1717] border border-[#486356] font-mono text-[11px] text-[#7BD3B0]">
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

        {/* Prepared Contextual Questions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#EEF3E9]">
              Prepared Contextual Questions
            </h3>
            <span className="text-[11px] text-[#B5C5BD]">Click to inspect answer</span>
          </div>

          <div className="space-y-1.5">
            {sortedQuestions.map((q) => {
              const isSelected = q.id === activeQuestion.id;
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
                      ? 'border-[#7BD3B0] bg-[#1A362E] text-[#EEF3E9]'
                      : 'border-[#486356] bg-[#0B1717]/70 text-[#B5C5BD] hover:border-[#7BD3B0]/70 hover:text-[#EEF3E9]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs sm:text-[13px] font-medium text-[#EEF3E9]">
                      {q.question}
                    </div>
                    <div className="text-[11px] font-mono text-[#B5C5BD] truncate mt-0.5">
                      {q.shortContext}
                      {matchesCurrentContext ? ' · Matches current focus' : ''}
                    </div>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 shrink-0 ${
                      isSelected ? 'text-[#7BD3B0]' : 'text-[#486356]'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Prepared Answer Detail */}
        {activeQuestion && (
          <div className="p-3 rounded border border-[#7BD3B0] bg-[#0B1717] space-y-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-[#486356]/60 pb-2">
              <span className="text-xs font-semibold text-[#7BD3B0] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Prototype Response (Authored Locally)</span>
              </span>
              <span className="font-mono text-[11px] text-[#E0BE72] flex items-center gap-1">
                <Code2 className="w-3 h-3" />
                L{activeQuestion.codeLines.join(', ')}
              </span>
            </div>

            <h4 className="text-xs sm:text-sm font-semibold text-[#EEF3E9]">
              {activeQuestion.question}
            </h4>

            <p className="text-xs sm:text-[13px] text-[#EEF3E9]/95 leading-relaxed">
              {activeQuestion.answer}
            </p>

            <div className="p-2 rounded bg-[#142B25] border border-[#486356] text-xs text-[#E0BE72]">
              <span className="font-semibold">Key takeaway: </span>
              <span className="text-[#EEF3E9]">{activeQuestion.takeaway}</span>
            </div>
          </div>
        )}
        </>}
      </div>
    </aside>
  );
};
