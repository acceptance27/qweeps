import type {FunctionInterface} from '../../types';
export type NodeId = string;
export type EvidenceKind = 'file' | 'symbol' | 'doc' | 'page' | 'trace' | 'requirement';
export type Confidence = 'exact' | 'inferred' | 'illustrative';
export interface EvidenceRef { kind: EvidenceKind; path?: string; symbol?: string; lines?: number[]; quote?: string; page?: number; }

export type NodeKind =
  | 'input'
  | 'transform'
  | 'store'
  | 'search'
  | 'assembly'
  | 'generation'
  | 'output';

export type NodeAccentColor =
  | 'sky'
  | 'amber'
  | 'emerald'
  | 'teal'
  | 'rose'
  | 'violet'
  | 'mint';

export interface NonSummaryInputItem {
  name: string;
  value: string;
  color?: NodeAccentColor;
}

export interface NonSummarySpec {
  blockTitle: string;
  inputs: NonSummaryInputItem[];
  goalTitle: string;
  goalText: string;
  outputLabel: string;
  outputValue: string;
}

export interface StaticDataEntry {
  key: string;
  value: string;
  color?: NodeAccentColor;
}

export interface StaticDataSpec {
  header: string;
  entries: StaticDataEntry[];
}

export interface CompoundChildBlockSpec {
  id: string;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  w: number;
  h: number;
  iconName: string;
  color: NodeAccentColor;
  hasLeftCombinerBar?: boolean;
  combinerPortsY?: number[];
  drillDownFunctionId?: FunctionLessonId;
  isDropBranch?: boolean;
  showInputPort?: boolean;
  showOutputPort?: boolean;
}

export interface CompoundContainerSpec {
  leftPortsY: number[];
  rightPortsY: number[];
  children: CompoundChildBlockSpec[];
  internalWires: { id?: string; points: { x: number; y: number }[] }[];
}

/**
 * Immutable ledger of worked-example values keyed by reference ID (e.g. "$question_raw").
 * Protects deterministic calculations from downstream narration/repair drift.
 */
export type WorkedExampleLedger = Record<string, string>;

export interface VisualTileItem {
  text: string;
  subtext?: string;
  color: NodeAccentColor;
}

export interface VisualMappingRow {
  leftChip: string;
  rightValue: string;
  note?: string;
  color: NodeAccentColor;
  barPercent?: number;
}

export type CustomVisualVariant =
  | 'paper-card'
  | 'token-tiles'
  | 'lookup-table'
  | 'output-pill'
  | 'vector-bars'
  | 'funnel-pool'
  | 'score-meter'
  | 'podium-rank'
  | 'gate-keep-drop'
  | 'dropped-bin'
  | 'doc-scroll'
  | 'blueprint-slots'
  | 'heatmap-spotlight'
  | 'citation-verifier';

export interface CustomVisualCardSpec {
  variant: CustomVisualVariant;
  headerBadge?: string;
  title: string;
  subtitle?: string;
  lines?: string[];
  tiles?: VisualTileItem[];
  rows?: VisualMappingRow[];
  highlightText?: string;
  footerNote?: string;
  floats?: number[];
  normLabel?: string;
}

export interface PortSpec { id: string; label: string; data?: string; }
export interface PortSet { inputs: PortSpec[]; outputs: PortSpec[]; }
export interface InternalConnection { id: string; from: { child: string; port?: string }; to: { child: string; port?: string }; label?: string; relationship: 'data'|'lookup'|'reference'|'control'; }
export interface InternalOperation {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  color: NodeAccentColor;
  value?: string;
  ports?: PortSet;
  codeReference?: {file: string; lines: number[]};
  drillDownFunctionId?: string;
}

export interface GraphNode {
  interface?:FunctionInterface;
  teachingLabel?:string;
  teachingDescription?:string;
  external?:boolean;
  sourceKind?: 'file'|'function'|'operation'|'signature'|'result';
  parameters?: string[];
  signature?: string;
  structure?: 'source';
  runtimeRows?:boolean;
  valueRef?:string;
  layoutLocked?:boolean;
  id: NodeId;
  stepBadge?: string;
  label: string;
  kind: NodeKind;
  iconName: string;
  accentColor: NodeAccentColor;
  subtitle: string;
  description: string;
  roleSummary: string;
  codeReference: {
    file: string;
    lines: number[];
    snippet: string;
  };
  defaultPreview: string;
  width: number;
  height: number;
  /** Optional ID of a drill-down function sub-lesson when this node represents a macro function */
  drillDownFunctionId?: FunctionLessonId;
  /** Optional metadata for macro codebase scale */
  moduleBadge?: string;
  /** Data-driven compound container specification (ports, child boxes, internal wires) */
  compoundContainer?: CompoundContainerSpec;
  /** Non-summary human-readable breakdown (@Inputs, Goal, @Output) for Level-1 logic blocks */
  nonSummary?: NonSummarySpec;
  /** Unpacked static data contents for @helper / @input / @output nodes so static data is never summarized */
  staticData?: StaticDataSpec;
  /** Dynamic function-specific visual flowchart node specification for Level-2 inspection */
  children?: InternalOperation[];
  ports?: PortSet;
  connections?: InternalConnection[];
  customVisual?: CustomVisualCardSpec;
  evidence?: EvidenceRef[];
  confidence?: Confidence;
}

export interface GraphEdge {
  sourceChild?: string;
  targetChild?: string;
  id: string;
  source: NodeId;
  target: NodeId;
  label: string;
  relationship: 'data' | 'lookup' | 'reference' | 'control';
  description: string;
  evidence?: EvidenceRef[];
  confidence?: Confidence;
  sourcePortIndex?: number;
  targetPortIndex?: number;
}

export interface SubsystemGroup {
  id: string;
  title: string;
  subtitle: string;
  col: number;
  accentColor: NodeAccentColor;
}

export interface ArchitectureGraph {
  systemContract?:boolean;
  systemNodeId?:string;
  layoutStyle?: 'reference';
  id: string;
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  subsystemGroups?: SubsystemGroup[];
  /** Grid slot (col 0..3, row 0..1) for clean Left-to-Right 4-column architecture layout */
  compactRowAssignment?: Record<string, { col: number; row: number }>;
  /** Optional multi-file code map keyed by filename so CodePane resolves step.code.file accurately */
  codeFiles?: Record<string, CodeLineItem[]>;
  /** Optional immutable worked-example ledger for deterministic value binding */
  workedExampleLedger?: WorkedExampleLedger;
}

export interface PacketSpec {
  edgeId: string;
  /** Start time in seconds relative to the beginning of the step */
  start: number;
  /** End time in seconds relative to the beginning of the step */
  end: number;
  /** Short readable payload label displayed on the moving packet */
  payload: string;
  /** Detailed value inspectable on hover or in trace */
  detail?: string;
}

export interface NodeBeatState {
  valueRef?: string;
  visual?: CustomVisualCardSpec;
  statusLabel: string;
  previewLines: string[];
  highlightToken?: string;
  badgeText?: string;
}

export type Step = {
  attentionCues?:{target:string;start:number;end:number}[];
  id: string;
  beatNumber: number;
  title: string;
  duration: number;
  question: string;
  narration: string;
  focusNodes: NodeId[];
  focusOperations?: string[];
  activeNodes: NodeId[];
  activeEdges: string[];
  packets: PacketSpec[];
  code: { file: string; lines: number[] };
  stateBefore: Record<string, unknown>;
  stateAfter: Record<string, unknown>;
  takeaway: string;
  resultAt?:number;
  /** Optional drill-down function ID associated with this macro beat */
  drillDownFunctionId?: FunctionLessonId;
  /** Per-node visual data shown inside the architecture nodes before and after the beat's transform */
  nodeDataBefore: Partial<Record<NodeId, NodeBeatState>>;
  nodeDataAfter: Partial<Record<NodeId, NodeBeatState>>;
};

export type FunctionLessonId = string;

export interface CodeLineItem {
  lineNumber: number;
  file?: string;
  text: string;
  explanation: string;
  drillDownFunctionId?: FunctionLessonId;
  moduleRangeLabel?: string;
  /** Non-summary sidebar display fields:
   *  @<atName> goal "<goalText>"
   *  ```
   *  <inputLabel>: <inputValue>
   *  <outputLabel>: <resultText>
   *  ```
   */
  atName?: string;
  goalText?: string;
  inputLabel?: string;
  inputValue?: string;
  outputLabel?: string;
  resultText?: string;
}

export interface SubFunctionLesson {
  interface?:FunctionInterface;
  view?: 'source'|'function'|'visual';
  parentFunctionName?: string;
  id: FunctionLessonId;
  functionName: string;
  signature: string;
  fileName: string;
  codebaseRange: string;
  totalModuleLines: number;
  summary: string;
  parentBeatNumber: number;
  parentNodeId: NodeId;
  parentFunctionId?: FunctionLessonId;
  /** Top-of-sidebar @inputs banner items (e.g. @question "How long will the refund take") */
  sidebarInputs?: NonSummaryInputItem[];
  graph: ArchitectureGraph;
  codeLines: CodeLineItem[];
  codeFiles?:{file:string;language:string;lines:CodeLineItem[]}[];
  steps: Step[];
}

export interface DocumentCandidate {
  id: string;
  title: string;
  text: string;
  illustrativeRank: string;
  selected: boolean;
  reason: string;
  supportingSpan?: string;
}

export interface LayoutNodePosition {
  id: NodeId;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdgePoint {
  x: number;
  y: number;
}

export interface LayoutEdgeRoute {
  id: string;
  source: NodeId;
  target: NodeId;
  points: LayoutEdgePoint[];
  labelPosition: LayoutEdgePoint;
  sourcePort: LayoutEdgePoint;
  targetPort: LayoutEdgePoint;
  junctionPoint?: LayoutEdgePoint;
  boundaryPort?: LayoutEdgePoint;
}

export interface ComputedGraphLayout {
  width: number;
  height: number;
  nodes: Record<NodeId, LayoutNodePosition>;
  edges: Record<string, LayoutEdgeRoute>;
  internalEdges?: Record<string, LayoutEdgeRoute>;
  children?: Record<NodeId, Record<string, LayoutNodePosition>>;
  compounds?: Record<NodeId, CompoundContainerSpec>;
  systemFrame?: {x: number; y: number; width: number; height: number};
  systemBounds?: {x: number; y: number; width: number; height: number};
  issues?: string[];
  engineUsed: 'elk' | 'deterministic-fallback';
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface ValidationIssue {
  type: 'error' | 'warning';
  stepId?: string;
  message: string;
}

export interface ContextualQuestion {
  id: string;
  question: string;
  relatedNodes?: NodeId[];
  relatedStepIds?: string[];
  shortContext: string;
  answer: string;
  codeLines: number[];
  takeaway: string;
}

export interface MiniExplanationStep {
  stepNumber: number;
  title: string;
  caption: string;
  focusNodes: NodeId[];
  activeEdges: string[];
  codeLines: number[];
  highlightPassage: string;
  dataSnapshot: string;
}

export interface SavedParentState {
  subFunctionId?: FunctionLessonId | null;
  playhead: number;
  wasPlaying: boolean;
  selectedNodeId: NodeId | null;
  camera: CameraState;
  cameraMode: 'follow' | 'manual' | 'overview';
}
