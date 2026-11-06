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

export interface GraphNode {
  runtimeRows?:boolean;
  valueRef?:string;
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
  /** Non-summary human-readable breakdown (@Inputs, Goal, @Output) for Level-1 logic blocks */
  nonSummary?: NonSummarySpec;
  /** Unpacked static data contents for @helper / @input / @output nodes so static data is never summarized */
  staticData?: StaticDataSpec;
  /** Dynamic function-specific visual flowchart node specification for Level-2 inspection */
  customVisual?: CustomVisualCardSpec;
  evidence?: EvidenceRef[];
  confidence?: Confidence;
}

export interface GraphEdge {
  id: string;
  source: NodeId;
  target: NodeId;
  label: string;
  relationship: 'data' | 'lookup' | 'reference';
  description: string;
  evidence?: EvidenceRef[];
  confidence?: Confidence;
}

export interface SubsystemGroup {
  id: string;
  title: string;
  subtitle: string;
  col: number;
  accentColor: NodeAccentColor;
}

export interface ArchitectureGraph {
  id: string;
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  subsystemGroups?: SubsystemGroup[];
  /** Grid slot (col 0..3, row 0..1) for clean Left-to-Right 4-column architecture layout */
  compactRowAssignment?: Record<string, { col: number; row: number }>;
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
  id: string;
  beatNumber: number;
  title: string;
  duration: number;
  question: string;
  narration: string;
  focusNodes: NodeId[];
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
