import React from 'react';
import {
  X,
  ArrowRight,
  HelpCircle,
  Code2,
  Database,
  ExternalLink,
  CheckCircle2,
  XCircle,
  CornerDownRight,
} from 'lucide-react';
import {
  ASSEMBLED_CONTEXT_STRING,
  ASSEMBLED_PROMPT_STRING,
  FINAL_SCRIPTED_ANSWER,
  ILLUSTRATIVE_VECTOR_TEXT,
  PREPARED_DOCUMENTS,
} from '../data/ragGraph';
import { EvaluatedNodeFrame } from '../timeline/evaluateTimeline';
import {
  ArchitectureGraph,
  FunctionLessonId,
  NodeId,
  Step,
} from '../types/lesson';

interface NodeInspectorProps {
  nodeId: NodeId | null;
  graph: ArchitectureGraph;
  nodeFrame?: EvaluatedNodeFrame;
  currentStep: Step;
  playhead: number;
  onClose: () => void;
  onSelectNode: (nodeId: NodeId) => void;
  onAskAboutNode: (nodeId: NodeId) => void;
  onVerifyCitation: () => void;
  onDrillIntoFunction?: (fnId: FunctionLessonId) => void;
  isSubFunctionView?: boolean;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  nodeId,
  graph,
  nodeFrame,
  currentStep,
  playhead,
  onClose,
  onSelectNode,
  onAskAboutNode,
  onVerifyCitation,
  onDrillIntoFunction,
  isSubFunctionView = false,
}) => {
  if (!nodeId) return null;
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const incomingEdges = graph.edges.filter((e) => e.target === node.id);
  const outgoingEdges = graph.edges.filter((e) => e.source === node.id);

  return (
    <aside
      aria-label={`Component inspector for ${node.label}`}
      className="absolute top-2.5 right-2.5 bottom-2.5 w-[calc(100%-1.25rem)] sm:w-96 bg-[#2B2D30] border border-[#4E5157] rounded-md shadow-xl z-30 flex flex-col overflow-hidden"
    >
      {/* Inspector Header */}
      <div className="px-3.5 py-2.5 bg-[#2B2D30] border-b border-[#393B40] flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-[#56A8F5]">
              Node Inspector
            </span>
            <span className="text-xs text-[#6F737A]">·</span>
            <span className="font-mono text-xs text-[#6AAB73]">
              Paused at {playhead.toFixed(1)}s
            </span>
          </div>
          <h2 className="font-mono text-sm sm:text-base font-bold text-[#DFE1E5] truncate mt-0.5">
            {node.label}{' '}
            <span className="font-sans font-normal text-xs text-[#868A91]">
              ({node.subtitle})
            </span>
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="min-h-[30px] min-w-[30px] px-2.5 py-1 rounded border border-[#4E5157] bg-[#35373B] text-[#DFE1E5] hover:bg-[#3E4146] flex items-center justify-center gap-1 text-xs cursor-pointer shrink-0 transition-colors"
          aria-label="Close node inspector and return to paused time"
        >
          <X className="w-3.5 h-3.5" />
          <span>Close</span>
        </button>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-3.5 bg-[#1E1F22] space-y-3.5 text-xs sm:text-sm select-text">
        {/* Drill-Down into Function Sub-Illustration Action (if this node represents a macro function) */}
        {!isSubFunctionView && node.drillDownFunctionId && onDrillIntoFunction && (
          <div className="p-3 rounded border border-[#3574F0] bg-[#25272B] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#56A8F5]">
                Hierarchical Function Drill-Down
              </span>
              <span className="font-mono text-[11px] text-[#D9A354]">
                {node.moduleBadge}
              </span>
            </div>
            <p className="text-xs text-[#868A91] leading-relaxed">
              This node represents a multi-line function. Open its dedicated 2D sub-illustration to trace its internal logic beat by beat.
            </p>
            <button
              type="button"
              onClick={() => {
                if (node.drillDownFunctionId) {
                  onDrillIntoFunction(node.drillDownFunctionId);
                }
              }}
              className="w-full py-1.5 px-3 rounded bg-[#3574F0] text-white font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-[#4682FA] transition-colors cursor-pointer"
            >
              <CornerDownRight className="w-4 h-4" />
              <span>Open Function Illustration &amp; Logic Beats ↘</span>
            </button>
          </div>
        )}

        {/* Role & Architectural Purpose */}
        <div className="p-3 rounded border border-[#393B40] bg-[#25272B] space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#56A8F5]">Architectural Role</span>
            <span className="font-mono text-[11px] text-[#6AAB73]">
              {nodeFrame?.statusLabel}
            </span>
          </div>
          <p className="text-xs sm:text-[13px] text-[#DFE1E5] leading-relaxed">
            {node.description}
          </p>
          <p className="text-xs text-[#868A91] leading-relaxed">{node.roleSummary}</p>
        </div>

        {/* Live Data State at Current Playhead */}
        <div className="p-3 rounded border border-[#393B40] bg-[#25272B] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#6AAB73] flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              <span>State at Beat {currentStep.beatNumber} ({playhead.toFixed(1)}s)</span>
            </span>
            <span className="font-mono text-[11px] text-[#868A91]">
              {nodeFrame?.badgeText}
            </span>
          </div>

          <div className="p-2.5 rounded bg-[#1E1F22] border border-[#393B40] font-mono text-xs text-[#DFE1E5] space-y-1">
            {(nodeFrame?.previewLines ?? [node.defaultPreview]).map((line, i) => (
              <div key={i} className="break-words leading-relaxed">
                {line}
              </div>
            ))}
          </div>

          {/* Detailed Node-Specific Data Payloads */}
          {(node.id === 'embed' || node.id === 'emb-norm' || node.id === 'emb-out') && (
            <div className="text-xs text-[#868A91] space-y-1 pt-1">
              <div className="font-mono text-[11px] text-[#D9A354]">
                Illustrative 6-number vector:
              </div>
              <code className="block p-2 rounded bg-[#1E1F22] border border-[#393B40] text-[#6AAB73] text-xs">
                {ILLUSTRATIVE_VECTOR_TEXT}
              </code>
              <p className="text-[11px] text-[#868A91]">
                Shown as 6 numbers for visual inspection (illustrative simulation, not a claim about production embedding dimensions).
              </p>
            </div>
          )}

          {(node.id === 'index' ||
            node.id === 'retrieve' ||
            node.id === 'ret-store' ||
            node.id === 'ret-slicer') && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-semibold text-[#D9A354]">
                Prepared Candidates &amp; Retrieval Outcome (limit=2):
              </div>
              {PREPARED_DOCUMENTS.map((doc) => (
                <div
                  key={doc.id}
                  className={`p-2 rounded border text-xs ${
                    doc.selected
                      ? 'border-[#6AAB73]/60 bg-[#1E1F22] text-[#DFE1E5]'
                      : 'border-[#393B40] bg-[#1E1F22] text-[#868A91]'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono text-[11px] mb-0.5">
                    <span className="flex items-center gap-1 font-semibold">
                      {doc.selected ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#6AAB73]" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-[#6F737A]" />
                      )}
                      {doc.title}
                    </span>
                    <span>{doc.illustrativeRank}</span>
                  </div>
                  <p className="text-[11px] leading-snug">{doc.text}</p>
                </div>
              ))}
            </div>
          )}

          {(node.id === 'context' || node.id === 'ctx-out') && (
            <div className="space-y-1 pt-1">
              <div className="text-[11px] font-mono text-[#D9A354]">
                Joined context string (shipping-guide excluded):
              </div>
              <pre className="p-2 rounded bg-[#1E1F22] border border-[#393B40] text-[11px] font-mono text-[#DFE1E5] whitespace-pre-wrap leading-relaxed">
                {ASSEMBLED_CONTEXT_STRING}
              </pre>
            </div>
          )}

          {(node.id === 'prompt' || node.id === 'prm-out') && (
            <div className="space-y-1 pt-1">
              <div className="text-[11px] font-mono text-[#D9A354]">
                Actual assembled prompt excerpt:
              </div>
              <pre className="p-2 rounded bg-[#1E1F22] border border-[#393B40] text-[11px] font-mono text-[#DFE1E5] whitespace-pre-wrap leading-relaxed">
                {ASSEMBLED_PROMPT_STRING}
              </pre>
            </div>
          )}

          {(node.id === 'answer' || node.id === 'gen-out') && (
            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-mono text-[#D9A354]">
                Scripted response with clickable source reference:
              </div>
              <div className="p-2.5 rounded bg-[#1E1F22] border border-[#D9A354]/60 text-xs text-[#DFE1E5] leading-relaxed">
                {FINAL_SCRIPTED_ANSWER}
              </div>
              <button
                type="button"
                onClick={onVerifyCitation}
                className="w-full py-1.5 px-3 rounded border border-[#3574F0] bg-[#2E436E] text-[#DFE1E5] hover:bg-[#3574F0] hover:text-white font-mono text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Highlight supporting [refund-policy] passage</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Corresponding Code Reference */}
        <div className="p-3 rounded border border-[#393B40] bg-[#25272B] space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#DFE1E5] flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-[#56A8F5]" />
              <span>Code in {node.codeReference.file}</span>
            </span>
            <span className="font-mono text-[11px] text-[#D9A354]">
              Line {node.codeReference.lines.join(', ')}
            </span>
          </div>
          <pre className="p-2 rounded bg-[#1E1F22] border border-[#393B40] font-mono text-xs text-[#6AAB73] overflow-x-auto">
            {node.codeReference.snippet}
          </pre>
        </div>

        {/* Input / Output Relationships */}
        <div className="p-3 rounded border border-[#393B40] bg-[#25272B] space-y-2.5">
          <div className="text-xs font-semibold text-[#DFE1E5]">
            Data &amp; Control Relationships
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] text-[#868A91]">
              Incoming inputs ({incomingEdges.length}):
            </div>
            {incomingEdges.length === 0 ? (
              <div className="text-xs font-mono text-[#868A91]">
                None (entry component / prepared store)
              </div>
            ) : (
              incomingEdges.map((edge) => (
                <button
                  key={edge.id}
                  type="button"
                  onClick={() => onSelectNode(edge.source)}
                  className="w-full text-left p-2 rounded border border-[#393B40] bg-[#1E1F22] hover:border-[#3574F0] flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer"
                >
                  <span className="font-mono text-[#56A8F5]">from {edge.source}</span>
                  <span className="font-mono text-[11px] text-[#DFE1E5] truncate">
                    {edge.label}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="text-[11px] text-[#868A91]">
              Outgoing outputs ({outgoingEdges.length}):
            </div>
            {outgoingEdges.length === 0 ? (
              <div className="text-xs font-mono text-[#868A91]">
                None (terminal returned answer)
              </div>
            ) : (
              outgoingEdges.map((edge) => (
                <button
                  key={edge.id}
                  type="button"
                  onClick={() => onSelectNode(edge.target)}
                  className="w-full text-left p-2 rounded border border-[#393B40] bg-[#1E1F22] hover:border-[#3574F0] flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer"
                >
                  <span className="font-mono text-[#56A8F5] flex items-center gap-1">
                    <span>to {edge.target}</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                  <span className="font-mono text-[11px] text-[#DFE1E5] truncate">
                    {edge.label}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Inspector Footer Action: Contextual Ask QWEEPS */}
      <div className="p-3 bg-[#2B2D30] border-t border-[#393B40] shrink-0">
        <button
          type="button"
          onClick={() => onAskAboutNode(node.id)}
          className="w-full min-h-[34px] px-3 py-1.5 rounded bg-[#3574F0] text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-[#4682FA] transition-colors cursor-pointer"
        >
          <HelpCircle className="w-4 h-4" />
          <span>Ask QWEEPS about &ldquo;{node.label}&rdquo;</span>
        </button>
      </div>
    </aside>
  );
};
