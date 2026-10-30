import type { ProductionExperiment } from './production';
export type Point = { x: number; y: number };
export type Camera = Point & { zoom: number };
export type Element = Point & {
  id: string; kind: 'circle' | 'box' | 'text' | 'arrow' | 'line' | 'path' | 'svg';
  label: string; description: string; width: number; height: number; color: string;
  from?: string; to?: string;
  revealAt?: number; drawDuration?: number; emphasizeAt?: number;
  opacity?: number; entrance?: 'draw' | 'grow' | 'write';
  points?: number[][]; closed?: boolean; smooth?: boolean; svg?: string;
};
export type Beat = { id: string; title: string; narration: string; duration: number; camera: Camera; elements: Element[]; narrationAt?: number; transitionDuration?: number };
export type Plan = { title: string; summary: string; beats: Beat[]; sources: string[]; teaching?: Record<string, unknown> };
export type Snapshot = {
  production?: ProductionExperiment; nativeFocus?:string; nativeStopAt?: number; nativeAnswer?: string;
  sceneId: string; plan: Plan | null; time: number; nodes: Record<string, Point>;
  positions: Record<string, Point>; camera: Camera | null; selected: string[];
  region: { x1: number; y1: number; x2: number; y2: number } | null;
};
export type Reply = { sessionId: string; answer: string; scene: Plan | null; sources?:{title:string;url:string}[]; researchAvailable?:boolean; nativeBranch?: { chapter:number; lessonId?:string; experiment?:ProductionExperiment; focus?:string; visualReason:string } };

export async function api<T = any>(path: string, data?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/visual/${path}`, data === undefined ? { signal } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal,
  });
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('The QWEEPS visual server is unavailable. Open the studio through “omarchy-assistant visual”.');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Visual request failed (${response.status})`);
  return result;
}

export const initialNodes: Record<string, Point> = {
  S: { x: -4.5, y: -1.2 }, G: { x: 3.8, y: 1.8 }, A: { x: -1, y: .2 }, B: { x: -2.8, y: 1.5 },
};

export function initialSnapshot(sceneId = 'astar_heuristic'): Snapshot {
  return { sceneId, plan: null, time: 0, nodes: structuredClone(sceneId === 'astar_search' ? { S: { x: -4, y: -2 }, G: { x: 4, y: 2 }, A: initialNodes.A, B: initialNodes.B } : initialNodes), positions: {}, camera: null, selected: [], region: null };
}

export function planBeat(plan: Plan, time: number) {
  let start = 0;
  for (let index = 0; index < plan.beats.length; index++) {
    const beat = plan.beats[index];
    if (time < start + beat.duration || index === plan.beats.length - 1) return { beat, index, start, end: start + beat.duration };
    start += beat.duration;
  }
  throw new Error('Empty visual plan');
}
