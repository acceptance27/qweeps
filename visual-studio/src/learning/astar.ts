import { Point } from './types';

export type SearchNode = Point & { id: string; g: number; h: number; f: number; parent: string | null };
export type SearchFrame = { current: string | null; open: SearchNode[]; closed: SearchNode[]; path: string[]; done: boolean };
export const gridKey = (p: Point) => `${p.x},${p.y}`;
export const walls = new Set(['0,-2', '0,-1', '0,0', '0,1', '2,1', '3,1']);
export const gridNodes = { S: { x: -4, y: -2 }, G: { x: 4, y: 2 }, A: { x: -1, y: 0 }, B: { x: -2, y: 1 } };
export const snapGrid = (p: Point): Point => ({ x: Math.max(-5, Math.min(5, Math.round(p.x))), y: Math.max(-3, Math.min(3, Math.round(p.y))) });

/** Deterministic A*: four neighbours, unit edges, Manhattan h, f/h/id ties. */
export function searchTrace(start: Point, goal: Point): SearchFrame[] {
  const open = new Map<string, SearchNode>(); const closed = new Map<string, SearchNode>();
  const h = (p: Point) => Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y);
  const sorted = () => [...open.values()].sort((a, b) => a.f - b.f || a.h - b.h || a.id.localeCompare(b.id));
  const source = gridKey(start), target = gridKey(goal);
  const first = { ...start, id: source, g: 0, h: h(start), f: h(start), parent: null };
  open.set(source, first);
  const frames: SearchFrame[] = [{ current: null, open: sorted(), closed: [], path: [], done: false }];
  while (open.size && frames.length < 90) {
    const n = sorted()[0]; open.delete(n.id); closed.set(n.id, n);
    const path: string[] = [];
    if (n.id === target) {
      let cursor: SearchNode | undefined = n;
      while (cursor) { path.unshift(cursor.id); cursor = cursor.parent ? closed.get(cursor.parent) : undefined; }
      frames.push({ current: n.id, open: sorted(), closed: [...closed.values()], path, done: true });
      break;
    }
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const p = { x: n.x + dx, y: n.y + dy }; const id = gridKey(p);
      if (Math.abs(p.x) > 5 || Math.abs(p.y) > 3 || (walls.has(id) && id !== source && id !== target) || closed.has(id)) continue;
      const g = n.g + 1;
      if (!open.has(id) || g < open.get(id)!.g) open.set(id, { ...p, id, g, h: h(p), f: g + h(p), parent: n.id });
    }
    frames.push({ current: n.id, open: sorted(), closed: [...closed.values()], path, done: !open.size });
  }
  return frames;
}

export function searchFrame(nodes: Record<string, Point>, time: number) {
  const trace = searchTrace(nodes.S, nodes.G);
  const index = Math.max(0, Math.min(trace.length - 1, Math.floor((time - 3) / 4)));
  return { trace, frame: trace[index], index, duration: 3 + trace.length * 4 };
}
