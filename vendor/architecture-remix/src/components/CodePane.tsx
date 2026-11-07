import React from 'react';
import {
  ExternalLink,
  FileCode2,
  Sparkles,
  ArrowLeft,
  X,
  CornerDownRight,
} from 'lucide-react';
import { ANSWER_PY_LINES } from '../data/ragGraph';
import { resolveSubFunctionLesson } from '../data/subFunctionLessons';
import {
  ArchitectureGraph,
  CodeLineItem,
  FunctionLessonId,
  NodeId,
  Step,
  SubFunctionLesson,
} from '../types/lesson';

interface CodePaneProps {
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
  activeSubFunction: SubFunctionLesson | null;
  onDrillIntoFunction: (fnId: FunctionLessonId) => void;
  onReturnToParentFunction: () => void;
  onReturnToMacroPipeline: () => void;
  backTargetLabel?: string | null;
}

export const CodePane: React.FC<CodePaneProps> = ({
  currentStep,
  activeGraph,
  activeSteps,
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

  const selectedNode = selectedNodeId
    ? activeGraph.nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;

  const incomingEdges = selectedNodeId
    ? activeGraph.edges.filter((e) => e.target === selectedNodeId)
    : [];
  const outgoingEdges = selectedNodeId
    ? activeGraph.edges.filter((e) => e.source === selectedNodeId)
    : [];

  const effectiveDrillDownId =
    selectedNode?.drillDownFunctionId ?? currentStep.drillDownFunctionId ?? null;

  const representedBeatLesson: SubFunctionLesson | null = !activeSubFunction
    ? resolveSubFunctionLesson(effectiveDrillDownId)
    : null;

  const activeFileName = activeSubFunction
    ? activeSubFunction.fileName || currentStep.code?.file || 'browser_lessons.py'
    : representedBeatLesson
    ? representedBeatLesson.fileName
    : selectedNode?.codeReference?.file || currentStep.code?.file || 'browser_lessons.py';

  const beatAtTitle = !activeSubFunction
    ? representedBeatLesson
      ? representedBeatLesson.functionName.startsWith('@')
        ? representedBeatLesson.functionName
        : `@${representedBeatLesson.functionName}`
      : '@request (Entry Input)'
    : activeSubFunction.functionName.startsWith('@')
    ? activeSubFunction.functionName
    : `@${activeSubFunction.functionName}`;

  let scopedStepLines: CodeLineItem[] = [];
  if (!activeSubFunction) {
    if (representedBeatLesson) {
      scopedStepLines = representedBeatLesson.codeLines;
    } else {
      const fileScopedLines =
        activeGraph.codeFiles?.[activeFileName] ??
        ANSWER_PY_LINES.filter((l) => !l.file || l.file === activeFileName);
      scopedStepLines = fileScopedLines.filter((l) => highlightSet.has(l.lineNumber));
      if (scopedStepLines.length === 0) {
        scopedStepLines = fileScopedLines.length > 0 ? [fileScopedLines[0]] : [ANSWER_PY_LINES[0]];
      }
    }
  } else {
    scopedStepLines =
      activeGraph.codeFiles?.[activeFileName] ?? activeSubFunction.codeLines;
  }

  const totalBeatsCount = activeSubFunction ? activeSubFunction.steps.length : activeSteps.length;

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
      className="h-full w-full bg-[#1E1F22] flex flex-col overflow-hidden select-none"
    >
      {/* JetBrains Tool Window Header */}
      <div className="px-3 py-2 bg-[#2B2D30] border-b border-[#393B40] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode2 className="w-4 h-4 text-[#56A8F5] shrink-0" />
          <span className="font-mono text-xs font-semibold text-[#DFE1E5] truncate">
            {beatAtTitle.split('(')[0]}
          </span>
          <span className="text-[#4E5157] hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <span className="font-mono text-[11px] text-[#868A91] truncate hidden sm:inline">
            {activeFileName}
          </span>
          <span className="text-[#4E5157]" aria-hidden="true">
            ·
          </span>
          <span className="font-mono text-[11px] text-[#D9A354] font-medium shrink-0">
            Beat {currentStep.beatNumber}/{totalBeatsCount}
          </span>
        </div>

        {activeSubFunction && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onReturnToParentFunction}
              className="px-2.5 py-0.5 rounded border border-[#4E5157] bg-[#35373B] text-[#DFE1E5] hover:bg-[#3E4045] hover:border-[#3574F0] text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
              title="Return to parent view"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>{backTargetLabel ? `Back (${backTargetLabel})` : 'Back'}</span>
            </button>
            {activeSubFunction.parentFunctionId && (
              <button
                type="button"
                onClick={onReturnToMacroPipeline}
                className="px-2 py-0.5 rounded border border-[#4E5157] bg-[#2B2D30] text-[#868A91] hover:text-[#DFE1E5] hover:border-[#3574F0] text-[10.5px] font-mono transition-colors cursor-pointer"
                title="Jump back to L0 Macro Pipeline"
              >
                L0
              </button>
            )}
          </div>
        )}
      </div>

      {/* JetBrains Debugger / Structure Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 select-text">
        {/* Selected Node Wire Watch */}
        {selectedNode && (
          <div className="rounded border border-[#4E5157] bg-[#25272B] p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2 border-b border-[#393B40] pb-1.5">
              <div className="min-w-0">
                <div className="font-mono text-[10.5px] text-[#868A91]">
                  Selected Node · Wire Connections
                </div>
                <div className="font-mono text-xs font-semibold text-[#DFE1E5] truncate">
                  {selectedNode.label}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectNode(null)}
                className="p-1 rounded border border-[#393B40] text-[#868A91] hover:text-[#DFE1E5] hover:border-[#4E5157] cursor-pointer shrink-0"
                title="Clear selection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Incoming Input Sources */}
            <div className="space-y-1">
              <div className="font-mono text-[10.5px] text-[#56A8F5] font-medium">
                Incoming Wires ({incomingEdges.length})
              </div>
              {incomingEdges.length === 0 ? (
                <div className="text-xs text-[#868A91] font-mono pl-2">
                  Entry source node (no upstream wire)
                </div>
              ) : (
                <div className="space-y-1">
                  {incomingEdges.map((edge) => {
                    const srcNode = activeGraph.nodes.find((n) => n.id === edge.source);
                    return (
                      <div
                        key={edge.id}
                        className="px-2 py-1 rounded bg-[#1E1F22] border border-[#393B40] font-mono text-[11px] flex items-center justify-between gap-2"
                      >
                        <span className="text-[#56A8F5] font-medium truncate">
                          from {srcNode?.label ?? edge.source}
                        </span>
                        <span className="text-[#BCBEC4] truncate">{edge.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Outgoing Output Targets */}
            <div className="space-y-1">
              <div className="font-mono text-[10.5px] text-[#6AAB73] font-medium">
                Outgoing Wires ({outgoingEdges.length})
              </div>
              {outgoingEdges.length === 0 ? (
                <div className="text-xs text-[#868A91] font-mono pl-2">
                  Terminal output node (final destination)
                </div>
              ) : (
                <div className="space-y-1">
                  {outgoingEdges.map((edge) => {
                    const tgtNode = activeGraph.nodes.find((n) => n.id === edge.target);
                    return (
                      <div
                        key={edge.id}
                        className="px-2 py-1 rounded bg-[#1E1F22] border border-[#393B40] font-mono text-[11px] flex items-center justify-between gap-2"
                      >
                        <span className="text-[#BCBEC4] truncate">{edge.label}</span>
                        <span className="text-[#6AAB73] font-medium truncate">
                          to {tgtNode?.label ?? edge.target}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* JetBrains Darcula Step Goals & Debugger Variables */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs font-semibold text-[#BCBEC4]">
              Execution Steps &amp; Variable Watches
            </span>
            <span className="font-mono text-[11px] text-[#868A91]">
              Click any @step to inspect
            </span>
          </div>

          <div className="space-y-2 font-mono text-xs">
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
                  className={`w-full text-left p-2.5 rounded border transition-colors cursor-pointer ${
                    isHighlighted
                      ? 'bg-[#263248] border-[#3574F0] text-[#DFE1E5]'
                      : 'bg-[#25272B] border-[#393B40] text-[#868A91] hover:bg-[#2B2D30] hover:border-[#4E5157] hover:text-[#DFE1E5]'
                  }`}
                >
                  <div className="space-y-1.5">
                    {/* Top Row: Darcula @decorator / method + Inspect link */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-semibold text-xs ${
                          isHighlighted ? 'text-[#56A8F5]' : 'text-[#CF8E6D]'
                        }`}
                      >
                        {atLabel}
                      </span>
                      {line.drillDownFunctionId && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] text-[#868A91] hover:text-[#DFE1E5] font-sans font-medium">
                          <span>Inspect</span>
                          <CornerDownRight className="w-3 h-3" />
                        </span>
                      )}
                    </div>

                    {/* Goal Prose */}
                    <div className="font-sans text-xs text-[#BCBEC4] leading-relaxed">
                      {goalStr}
                    </div>

                    {/* Darcula Debugger Watch Box */}
                    <div className="p-2 rounded bg-[#1E1F22] border border-[#34363B] space-y-1 text-[11px] leading-snug break-words">
                      {inValue && (
                        <div>
                          <span className="text-[#9876AA] font-medium">
                            {inLabel}:
                          </span>{' '}
                          <span className="text-[#BCBEC4]">{inValue}</span>
                        </div>
                      )}
                      {outValue && (
                        <div>
                          <span className="text-[#6AAB73] font-medium">
                            {outLabel}:
                          </span>{' '}
                          <span className="text-[#DFE1E5]">{outValue}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mini-Explanation Callout */}
        {miniModeActive && miniStepCaption && (
          <div className="p-2.5 rounded border border-[#D9A354]/60 bg-[#292620] space-y-1">
            <div className="text-xs font-semibold text-[#D9A354] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Mini-Explanation Focus</span>
            </div>
            <p className="text-xs text-[#DFE1E5] leading-relaxed">
              {miniStepCaption}
            </p>
          </div>
        )}

        {/* Architectural Takeaway */}
        <div className="rounded border border-[#393B40] bg-[#25272B] p-2.5 space-y-1">
          <div className="text-[11px] font-semibold text-[#D9A354]">
            Architectural Takeaway
          </div>
          <p className="text-xs text-[#BCBEC4] leading-relaxed">
            {currentStep.takeaway}
          </p>
        </div>

        {/* Grounded Answer & Citation Verification */}
        {(currentStep.beatNumber >= 6 ||
          activeSubFunction?.id === 'fn-generate' ||
          activeSubFunction?.parentFunctionId === 'fn-generate' ||
          highlightedEvidenceId === 'refund-policy') && (
          <div className="p-2.5 rounded border border-[#425C48] bg-[#202922] space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#6AAB73]">
                Verified Source Provenance
              </span>
              <span className="font-mono text-[11px] text-[#D9A354]">
                {activeFileName}
              </span>
            </div>
            <p className="text-xs text-[#BCBEC4] leading-relaxed">
              Every output claim and wire is verified against indexed source spans{' '}
              <button
                type="button"
                onClick={() =>
                  onHighlightEvidence(
                    highlightedEvidenceId === 'refund-policy' ? null : 'refund-policy'
                  )
                }
                className="inline-flex items-center gap-1 font-mono text-[11px] text-[#56A8F5] hover:underline cursor-pointer"
                title="Inspect source evidence store"
              >
                <span>[verify-source-spans]</span>
                <ExternalLink className="w-3 h-3" />
              </button>
              .
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
