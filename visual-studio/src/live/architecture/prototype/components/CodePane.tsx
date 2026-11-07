import React,{useState,useEffect} from 'react';
import type {FunctionCatalogEntry} from '../../types';
import {generatedSidebarGoals,type SidebarGoal} from '../sidebarGoals';
import {GoalOutputCards} from './GoalOutputCards';
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
  functionCatalog?:FunctionCatalogEntry[];
  functionStatus?:string;
  rootCodeLines:CodeLineItem[];
  sourceFile?:{file:string;language:string;lines:CodeLineItem[]};
  resolveFunction:(id:string|null)=>SubFunctionLesson|null;
  rootStepCount:number;
  showPreparedEvidence:boolean;
  currentStep: Step;
  activeGraph: ArchitectureGraph;
  activeSteps: Step[];
  selectedNodeId: NodeId | null;
  onSelectNode: (nodeId: NodeId | null) => void;
  highlightedLines: number[];
  showResult?:boolean;
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
  sourceFile,
  functionCatalog=[],functionStatus,
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
  const [functionSearch,setFunctionSearch]=useState('');
  // If the learner clicked a node on the canvas, find that node and its incoming/outgoing edges
  const inspectorNodes=[...activeGraph.nodes,...activeGraph.nodes.flatMap(parent=>(parent.children||[]).map(child=>({...parent,id:child.id,label:child.label,drillDownFunctionId:child.drillDownFunctionId,description:child.description||parent.description,defaultPreview:child.value||'',codeReference:child.codeReference?{...child.codeReference,snippet:''}:parent.codeReference,evidence:child.codeReference?[{kind:'file' as const,path:child.codeReference.file,lines:child.codeReference.lines}]:parent.evidence,children:undefined})))];
  const selectedNode=inspectorNodes.find(n=>n.id===selectedNodeId)||null;
  const inspectorEdges=[...activeGraph.edges,...activeGraph.nodes.flatMap(parent=>(parent.connections||[]).map(connection=>({id:connection.id,source:connection.from.child,target:connection.to.child,label:connection.label||'reference',description:'Declared internal connection',relationship:connection.relationship})))];
  const incomingEdges=selectedNodeId?inspectorEdges.filter(e=>e.target===selectedNodeId||('targetChild' in e&&e.targetChild===selectedNodeId)):[];
  const outgoingEdges=selectedNodeId?inspectorEdges.filter(e=>e.source===selectedNodeId||('sourceChild' in e&&e.sourceChild===selectedNodeId)):[];

  // Determine the @ function lesson represented by the current macro beat (when at Level 0)
  const effectiveDrillDownId =
    selectedNode?.drillDownFunctionId ?? currentStep.drillDownFunctionId ?? null;

  const representedBeatLesson: SubFunctionLesson | null = !activeSubFunction
    ? resolveSubFunctionLesson(effectiveDrillDownId)
    : null;

  // Resolve the active source file for the current beat / selected node / sub-function (never stuck on codeFiles[0])
  const activeFileName =
    representedBeatLesson?.fileName ||
    selectedNode?.codeReference.file ||
    currentStep.code?.file ||
    sourceFile?.file ||
    activeSubFunction?.fileName ||
    'answer.py';
  useEffect(()=>setFunctionSearch(''),[activeFileName]);
  const activeFileLines=activeGraph.codeFiles?.[activeFileName]??sourceFile?.lines??ANSWER_PY_LINES;
  const highlightSet = new Set(selectedNode?.codeReference.lines||highlightedLines);
  // Scoped Header Title for the @ represented by this beat or inspected function
  const beatAtTitle = !activeSubFunction
    ? representedBeatLesson
      ? `@${representedBeatLesson.functionName}`
      : showPreparedEvidence?'@question (Entry Input)':'@'+(selectedNode?.label||activeGraph.nodes.find(n=>currentStep.focusNodes.includes(n.id))?.label||currentStep.title)
    : activeSubFunction.functionName.startsWith('@')
    ? activeSubFunction.functionName
    : `@${activeSubFunction.functionName}`;

  // Show all step goals & outputs of the @ function represented by the current beat / inspected function
  let scopedStepLines: CodeLineItem[] = [];
  if (!activeSubFunction) {
    if (representedBeatLesson) {
      scopedStepLines = representedBeatLesson.codeLines;
    } else {
      scopedStepLines = activeFileLines.filter((l) => highlightSet.has(l.lineNumber));
      if (scopedStepLines.length === 0) scopedStepLines = [activeFileLines[0] ?? ANSWER_PY_LINES[0]];
    }
  } else {
    scopedStepLines = activeFileLines.filter(line=>highlightSet.has(line.lineNumber));
    if (scopedStepLines.length === 0) scopedStepLines = activeSubFunction.codeLines;
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

  const sidebarCards:SidebarGoal[]=showPreparedEvidence?scopedStepLines.map((line,index)=>({id:`${line.lineNumber}-${index}`,name:line.atName??line.text.trim(),goal:line.goalText??line.explanation,inputLabel:line.inputLabel??'@input',inputValue:line.inputValue??'',outputLabel:line.outputLabel??`${line.atName??line.text.trim()} output`,outputValue:line.resultText??'',highlighted:!activeSubFunction||highlightSet.has(line.lineNumber)})):generatedSidebarGoals(activeGraph,currentStep,selectedNodeId,activeSubFunction);
  const activateCard=(card:SidebarGoal,index:number)=>{if(showPreparedEvidence)handleStepClick(scopedStepLines[index],index);else if(card.functionId)onDrillIntoFunction(card.functionId);else if(card.nodeId)onSelectNode(card.nodeId);};

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
          <span title={activeFileName} className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-[#142B25] border border-[#486356]/70 text-[#91B9CC] shrink-0 hidden sm:inline">
            {activeFileName.split('/').pop()}
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
                title="Return to the system overview"
              >
                L0
              </button>
            )}
          </div>
        )}
      </div>

      {/* Focused Non-Summary Sidebar Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 select-text">
        <GoalOutputCards title={beatAtTitle} cards={sidebarCards} onActivate={activateCard}/>
        {/* CLICKED NODE INPUT / OUTPUT PANEL (No Inspect Function button) */}
        {selectedNode && (
          <details className="rounded border border-[#486356] bg-[#0B1717] p-3 space-y-2.5"><summary className="cursor-pointer text-xs text-[#7BD3B0]">Connections for {selectedNode.label}</summary>
            <div className="flex items-center justify-between gap-2 border-b border-[#486356]/70 pb-2">
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-wider text-[#E0BE72] font-bold">
                  {selectedNode.structure==='source'?'Selected source & references':'Selected Block Input / Output'}
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
                ⬅ {selectedNode.structure==='source'?(selectedNode.sourceKind==='operation'?'Possible preceding paths':'Referenced by'):'Input Coming In'} ({incomingEdges.length}):
              </div>
              {incomingEdges.length === 0 ? (
                <div className="text-xs text-[#8AA399] font-mono pl-2">
                  {selectedNode?.structure==='source'?'No incoming references in this source view':'Entry source node (no upstream wire)'}
                </div>
              ) : (
                <div className="space-y-1">
                  {incomingEdges.map((edge) => {
                    const srcNode = inspectorNodes.find((n) => n.id === edge.source);
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
                ➔ {selectedNode.structure==='source'?(selectedNode.sourceKind==='operation'?'Possible following paths':'References'):'Output Going Out'} ({outgoingEdges.length}):
              </div>
              {outgoingEdges.length === 0 ? (
                <div className="text-xs text-[#8AA399] font-mono pl-2">
                  {selectedNode?.structure==='source'?'No outgoing references in this source view':'Terminal output node (final destination)'}
                </div>
              ) : (
                <div className="space-y-1">
                  {outgoingEdges.map((edge) => {
                    const tgtNode = inspectorNodes.find((n) => n.id === edge.target);
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
          </details>
        )}

        {selectedNode && (selectedNode.evidence?.length || selectedNode.confidence) && (
          <details className="rounded border border-[#486356] bg-[#0B1717] p-3 space-y-2"><summary className="cursor-pointer text-xs text-[#7BD3B0]">Source evidence</summary>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#7BD3B0]">Evidence</span>
              {selectedNode.confidence && <span className="font-mono text-[9px] uppercase tracking-wider text-[#E0BE72]">{selectedNode.confidence}</span>}
            </div>
            {(selectedNode.evidence||[]).length === 0 && <p className="text-[11px] text-[#8AA399]">No source evidence attached; treat this node as illustrative.</p>}
            {(selectedNode.evidence||[]).map((ref, idx) => (
              <div key={idx} className="rounded bg-[#142B25]/80 border border-[#486356]/60 px-2 py-1.5 text-[10.5px] font-mono text-[#B5C5BD] space-y-0.5">
                <div className="text-[#7BD3B0]">{ref.kind}{ref.path?` · ${ref.path}`:''}{ref.symbol?` · ${ref.symbol}`:''}{ref.page?` · p.${ref.page}`:''}{ref.lines?.length?` · L${ref.lines.join(',')}`:''}</div>
                {ref.quote && <div className="text-[#EEF3E9]/80 whitespace-pre-wrap">{ref.quote}</div>}
              </div>
            ))}
          </details>
        )}

        {selectedNode?.valueRef&&<div className="rounded border border-[#486356] bg-[#0B1717] p-3 text-xs text-[#7BD3B0]">Calculated example: <code>{selectedNode.valueRef}</code><p className="mt-1 text-[#B5C5BD] whitespace-pre-wrap break-words">{selectedNode.defaultPreview}</p></div>}
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

        {!showPreparedEvidence && <details className="rounded border border-[#486356] bg-[#0B1717] p-3 text-xs">
          <summary className="cursor-pointer text-[#7BD3B0]">Beat transcript</summary>
          <p className="mt-2 leading-relaxed text-[#EEF3E9]">{currentStep.narration}</p>
        </details>}
        {!showPreparedEvidence&&activeSubFunction?.interface&&<details className="rounded border border-[#486356] bg-[#0B1717] p-3 text-xs">
          <summary className="cursor-pointer text-[#7BD3B0]">Full function contract</summary>
          {(['inputs','outputs'] as const).map(direction=><div key={direction} className="mt-3 space-y-1.5">
            <div className="font-semibold text-[#E0BE72]">{direction==='inputs'?'Inputs':'Results and effects'}</div>
            {activeSubFunction.interface![direction].map((item,i)=><p key={i} className="leading-relaxed text-[#B5C5BD] break-words"><span className="font-mono text-[#EEF3E9]">{item.label||item.name.replace(/_/g,' ')}</span>: {item.description}</p>)}
          </div>)}
        </details>}
        {functionStatus&&<p role="status" className="rounded border border-[#486356] p-2 text-xs text-[#E0BE72]">{functionStatus}</p>}
        {functionCatalog.some(fn=>fn.file===activeFileName)&&<details className="rounded border border-[#486356] bg-[#0B1717] p-3 text-xs">
          <summary className="cursor-pointer font-semibold text-[#7BD3B0]">Functions in this file ({functionCatalog.filter(fn=>fn.file===activeFileName).length})</summary>
          <input aria-label="Search functions in this file" type="search" value={functionSearch} onChange={event=>setFunctionSearch(event.target.value)} placeholder="Find a function or method…" className="mt-2 mb-2 w-full rounded border border-[#486356] bg-[#142B25] px-2 py-2 text-[#EEF3E9]"/>
          <div className="max-h-52 overflow-y-auto space-y-1">
            {functionCatalog.filter(fn=>fn.file===activeFileName&&fn.name.toLowerCase().includes(functionSearch.toLowerCase())).map(fn=><button key={fn.id} type="button" onClick={()=>onDrillIntoFunction(fn.id)} aria-label={`Inspect Function ${fn.name}`} title={fn.signature} className="flex w-full items-start justify-between gap-2 rounded border border-[#486356] px-2 py-2 text-left text-[#EEF3E9] hover:border-[#E0BE72]">
              <span className="min-w-0 break-words font-mono">{fn.name}</span><span className="shrink-0 text-[#E0BE72]">↘</span>
            </button>)}
          </div>
        </details>}
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
