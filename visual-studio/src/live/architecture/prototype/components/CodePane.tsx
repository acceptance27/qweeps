import React from 'react';
import {
  ExternalLink,
  FileCode2,
  Sparkles,
  ArrowLeft,
  X,
} from 'lucide-react';
import {
  ArchitectureGraph,
  CodeLineItem,
  FunctionLessonId,
  NodeId,
  Step,
  SubFunctionLesson,
} from '../types/lesson';

interface CodePaneProps {
  rootCodeLines:CodeLineItem[];
  resolveFunction:(id:string|null)=>SubFunctionLesson|null;
  rootStepCount:number;
  showPreparedEvidence:boolean;
  currentStep: Step;
  activeGraph: ArchitectureGraph;
  activeSteps: Step[];
  selectedNodeId: NodeId | null;
  onSelectNode: (nodeId: NodeId | null) => void;
  highlightedLines: number[];
  onSelectBeatByLine: (lineNumber: number) => void;
  highlightedEvidenceId: string | null;
  onHighlightEvidence: (docId: string | null) => void;
  miniModeActive?: boolean;
  miniStepCaption?: string;
  // Hierarchical Function-per-Beat -> Logic-per-Beat -> Inner Function props
  activeSubFunction: SubFunctionLesson | null;
  onDrillIntoFunction: (fnId: FunctionLessonId) => void;
  onReturnToParentFunction: () => void;
  onReturnToMacroPipeline: () => void;
  backTargetLabel?: string | null;
}

export const CodePane: React.FC<CodePaneProps> = ({
  rootCodeLines:ANSWER_PY_LINES,
  resolveFunction:resolveSubFunctionLesson,
  rootStepCount,
  showPreparedEvidence,
  currentStep,
  activeGraph,
  selectedNodeId,
  onSelectNode,
  highlightedLines,
  onSelectBeatByLine,
  highlightedEvidenceId,
  onHighlightEvidence,
  miniModeActive = false,
  miniStepCaption,
  activeSubFunction,
  onDrillIntoFunction,
  onReturnToParentFunction,
  onReturnToMacroPipeline,
  backTargetLabel,
}) => {
  const highlightSet = new Set(highlightedLines);

  // If the learner clicked a node on the canvas, find that node and its incoming/outgoing edges
  const selectedNode = selectedNodeId
    ? activeGraph.nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;

  const incomingEdges = selectedNodeId
    ? activeGraph.edges.filter((e) => e.target === selectedNodeId)
    : [];
  const outgoingEdges = selectedNodeId
    ? activeGraph.edges.filter((e) => e.source === selectedNodeId)
    : [];

  // Determine the @ function lesson represented by the current macro beat (when at Level 0)
  const effectiveDrillDownId =
    selectedNode?.drillDownFunctionId ?? currentStep.drillDownFunctionId ?? null;

  const representedBeatLesson: SubFunctionLesson | null = !activeSubFunction
    ? resolveSubFunctionLesson(effectiveDrillDownId)
    : null;

  // Scoped Header Title for the @ represented by this beat or inspected function
  const beatAtTitle = !activeSubFunction
    ? representedBeatLesson
      ? `@${representedBeatLesson.functionName}`
      : showPreparedEvidence?'@question (Entry Input)':currentStep.code.file
    : activeSubFunction.functionName.startsWith('@')
    ? activeSubFunction.functionName
    : `@${activeSubFunction.functionName}`;

  // Show all step goals & outputs of the @ function represented by the current beat / inspected function
  let scopedStepLines: CodeLineItem[] = [];
  if (!activeSubFunction) {
    if (representedBeatLesson) {
      scopedStepLines = representedBeatLesson.codeLines;
    } else {
      scopedStepLines = ANSWER_PY_LINES.filter((l) => highlightSet.has(l.lineNumber));
      if (scopedStepLines.length === 0) scopedStepLines = [ANSWER_PY_LINES[0]];
    }
  } else {
    scopedStepLines = activeSubFunction.codeLines;
  }

  const totalBeatsCount = activeSubFunction ? activeSubFunction.steps.length : rootStepCount;

  // Pressing a step item directly inspects that function (or jumps to its beat if already at leaf level)
  const handleStepClick = (line: CodeLineItem, idx: number) => {
    if (line.drillDownFunctionId) {
      onDrillIntoFunction(line.drillDownFunctionId);
      return;
    }
    if (activeSubFunction) {
      const stepIdx = activeSubFunction.steps.findIndex((s) =>
        s.code.lines.includes(line.lineNumber)
      );
      onSelectBeatByLine(
        stepIdx >= 0 ? stepIdx : Math.min(idx, activeSubFunction.steps.length - 1)
      );
    }
  };

  return (
    <section
      aria-label="Current beat @function goals and outputs"
      className="h-full w-full bg-[#142B25] flex flex-col overflow-hidden select-none"
    >
      {/* Compact Header Bar */}
      <div className="px-3.5 py-2.5 bg-[#0B1717]/90 border-b border-[#486356] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode2 className="w-4 h-4 text-[#7BD3B0] shrink-0" />
          <span className="font-mono text-xs sm:text-sm font-semibold text-[#EEF3E9] truncate">
            {beatAtTitle}
          </span>
          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#142B25] border border-[#486356] text-[#E0BE72] shrink-0">
            Beat {currentStep.beatNumber}/{totalBeatsCount}
          </span>
        </div>

        {activeSubFunction && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onReturnToParentFunction}
              className="px-2.5 py-1 rounded border border-[#E0BE72] bg-[#E0BE72] text-[#0B1717] hover:bg-[#E0BE72]/90 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
              title="Return to where you were before inspecting"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>{backTargetLabel ? `Back (${backTargetLabel})` : 'Back'}</span>
            </button>
            {activeSubFunction.parentFunctionId && (
              <button
                type="button"
                onClick={onReturnToMacroPipeline}
                className="px-1.5 py-1 rounded border border-[#486356] bg-[#142B25] text-[#B5C5BD] hover:text-[#EEF3E9] text-[10.5px] font-mono transition-colors cursor-pointer"
                title="Jump all the way back to answer.py"
              >
                L0
              </button>
            )}
          </div>
        )}
      </div>

      {/* Focused Non-Summary Sidebar Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 select-text">
        {/* CLICKED NODE INPUT / OUTPUT PANEL (No Inspect Function button) */}
        {selectedNode && (
          <div className="rounded border-2 border-[#E0BE72] bg-[#0B1717] p-3 space-y-2.5 shadow-md">
            <div className="flex items-center justify-between gap-2 border-b border-[#486356]/70 pb-2">
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-wider text-[#E0BE72] font-bold">
                  Selected Block Input / Output
                </div>
                <div className="font-mono text-xs sm:text-sm font-bold text-[#EEF3E9] truncate">
                  {selectedNode.label}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectNode(null)}
                className="p-1 rounded border border-[#486356] text-[#B5C5BD] hover:text-[#EEF3E9] hover:border-[#7BD3B0] cursor-pointer shrink-0"
                title="Clear selection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Incoming Input Sources */}
            <div className="space-y-1">
              <div className="font-mono text-[10.5px] text-[#38BDF8] font-bold">
                ⬅ Input Coming In ({incomingEdges.length}):
              </div>
              {incomingEdges.length === 0 ? (
                <div className="text-xs text-[#8AA399] font-mono pl-2">
                  Entry source node (no upstream wire)
                </div>
              ) : (
                <div className="space-y-1">
                  {incomingEdges.map((edge) => {
                    const srcNode = activeGraph.nodes.find((n) => n.id === edge.source);
                    return (
                      <div
                        key={edge.id}
                        className="px-2 py-1 rounded bg-[#142B25]/90 border border-[#38BDF8]/60 font-mono text-[11px] flex items-center justify-between gap-2"
                      >
                        <span className="text-[#38BDF8] font-bold truncate">
                          from {srcNode?.label ?? edge.source}
                        </span>
                        <span className="text-[#EEF3E9] truncate">{edge.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Outgoing Output Targets */}
            <div className="space-y-1">
              <div className="font-mono text-[10.5px] text-[#34D399] font-bold">
                ➔ Output Going Out ({outgoingEdges.length}):
              </div>
              {outgoingEdges.length === 0 ? (
                <div className="text-xs text-[#8AA399] font-mono pl-2">
                  Terminal output node (final destination)
                </div>
              ) : (
                <div className="space-y-1">
                  {outgoingEdges.map((edge) => {
                    const tgtNode = activeGraph.nodes.find((n) => n.id === edge.target);
                    return (
                      <div
                        key={edge.id}
                        className="px-2 py-1 rounded bg-[#142B25]/90 border border-[#34D399]/60 font-mono text-[11px] flex items-center justify-between gap-2"
                      >
                        <span className="text-[#EEF3E9] truncate">{edge.label}</span>
                        <span className="text-[#34D399] font-bold truncate">
                          ➔ to {tgtNode?.label ?? edge.target}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step Goals & Outputs for the @ represented by the current beat */}
        <div className="rounded border border-[#486356] bg-[#0B1717] overflow-hidden shadow-sm">
          <div className="px-3 py-2 border-b border-[#486356]/70 bg-[#142B25]/70 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#EEF3E9] truncate">
              Step Goals &amp; Outputs ({beatAtTitle.split('(')[0]})
            </span>
            <span className="font-mono text-[10.5px] text-[#8AA399] shrink-0">
              Click any @step to inspect
            </span>
          </div>

          <div className="divide-y divide-[#486356]/40 font-mono text-xs sm:text-[13px]">
            {scopedStepLines.map((line, idx) => {
              const isHighlighted =
                !activeSubFunction || highlightSet.has(line.lineNumber);
              const atLabel = line.atName ?? line.text.trim();
              const goalStr = line.goalText ?? line.explanation;
              const inLabel = line.inputLabel ?? '@input';
              const inValue = line.inputValue ?? '';
              const outLabel = line.outputLabel ?? `${atLabel} output`;
              const outValue = line.resultText ?? '';

              return (
                <div
                  key={`${line.lineNumber}-${idx}`}
                  onClick={() => handleStepClick(line, idx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleStepClick(line, idx);
                    }
                  }}
                  className={`w-full text-left p-3 transition-colors cursor-pointer ${
                    isHighlighted
                      ? 'bg-[#17332B] text-[#EEF3E9] border-l-4 border-l-[#E0BE72]'
                      : 'text-[#B5C5BD]/90 hover:bg-[#142B25]/70'
                  }`}
                >
                  <div className="space-y-2">
                    {/* Line 1: @tokenize goal "Split the question into clean, lowercase word pieces" */}
                    <div className="leading-relaxed break-words">
                      <span
                        className={`font-bold ${
                          isHighlighted ? 'text-[#7BD3B0]' : 'text-[#91B9CC]'
                        }`}
                      >
                        {atLabel}
                      </span>{' '}
                      <span className="text-[#E0BE72] font-semibold">goal</span>{' '}
                      <span className="font-sans text-[#EEF3E9]">
                        &ldquo;{goalStr}&rdquo;
                      </span>
                    </div>

                    {/* Code Block:
                        @Question Input: "How long do I have to request a refund?"
                        @Tokenize output: ["how", "long", "request", "refund"]
                    */}
                    <div className="p-2.5 rounded bg-[#0B1717] border border-[#486356]/80 space-y-1.5 text-[11.5px] leading-snug break-words">
                      {inValue && (
                        <div>
                          <span className="text-[#38BDF8] font-bold">
                            {inLabel}:
                          </span>{' '}
                          <span className="text-[#EEF3E9]">{inValue}</span>
                        </div>
                      )}
                      {outValue && (
                        <div>
                          <span className="text-[#34D399] font-bold">
                            {outLabel}:
                          </span>{' '}
                          <span className="text-[#EEF3E9]">{outValue}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* If Mini-Explanation is active, highlight its step note */}
        {miniModeActive && miniStepCaption && (
          <div className="p-3 rounded border border-[#E0BE72] bg-[#0B1717] space-y-1">
            <div className="text-xs font-semibold text-[#E0BE72] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Mini-Explanation Focus</span>
            </div>
            <p className="text-xs sm:text-sm text-[#EEF3E9] leading-relaxed">
              {miniStepCaption}
            </p>
          </div>
        )}

        {/* Concise Beat Reasoning Takeaway */}
        <div className="rounded border border-[#486356] bg-[#0B1717]/90 p-3 space-y-1.5">
          <div className="text-[11px] font-semibold text-[#E0BE72]">
            Why this beat matters
          </div>
          <p className="text-xs text-[#EEF3E9] leading-relaxed">
            {currentStep.takeaway}
          </p>
        </div>

        {/* Grounded Answer & Citation Verification (Shown on final beats) */}
        {showPreparedEvidence && (currentStep.beatNumber >= 6 ||
          activeSubFunction?.id === 'fn-generate' ||
          activeSubFunction?.parentFunctionId === 'fn-generate' ||
          highlightedEvidenceId === 'refund-policy') && (
          <div className="p-3 rounded border border-[#7BD3B0] bg-[#0B1717] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#7BD3B0]">
                Grounded Answer &amp; Citation
              </span>
              <span className="font-mono text-[11px] text-[#E0BE72]">
                [refund-policy]
              </span>
            </div>
            <p className="text-xs text-[#EEF3E9] leading-relaxed">
              &ldquo;Refund requests must be submitted within{' '}
              <span className="text-[#E0BE72] font-semibold underline decoration-[#E0BE72]/70 underline-offset-2">
                30 days
              </span>{' '}
              of purchase{' '}
              <button
                type="button"
                onClick={() =>
                  onHighlightEvidence(
                    highlightedEvidenceId === 'refund-policy' ? null : 'refund-policy'
                  )
                }
                className="inline-flex items-center gap-1 font-mono text-[11px] px-1.5 py-0.5 rounded border border-[#E0BE72] bg-[#142B25] text-[#E0BE72] hover:bg-[#E0BE72] hover:text-[#0B1717] transition-colors cursor-pointer"
                title="Verify supporting policy passage"
              >
                <span>[refund-policy]</span>
                <ExternalLink className="w-3 h-3" />
              </button>
              .&rdquo;
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
