import React, { useRef, useState } from 'react';
import { gridKey, searchFrame, snapGrid, walls } from './astar';
import { Point, Snapshot } from './types';

export function GridCanvas({ snapshot: s, update, pause }: { snapshot: Snapshot; update: (fn: (s: Snapshot) => Snapshot) => void; pause: () => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: 'node' | 'region' | 'pan'; id: string; start: Point } | null>(null);
  const [box, setBox] = useState<{ start: Point; end: Point } | null>(null);
  const { frame, index } = searchFrame(s.nodes, s.time);
  const cam = s.camera || { x: 0, y: 0, zoom: 1 };
  const world = (e: React.PointerEvent): Point => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return { x: p.x / cam.zoom + cam.x, y: -p.y / cam.zoom + cam.y };
  };
  const begin = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault(); pause(); svg.current!.setPointerCapture(e.pointerId);
    const p = world(e); const node = (['S', 'G'] as const).find(id => Math.hypot(s.nodes[id].x - p.x, s.nodes[id].y - p.y) < .45);
    const cell = snapGrid(p);
    drag.current = { kind: e.button === 2 ? 'pan' : node ? 'node' : 'region', id: node || gridKey(cell), start: p };
    update(old => ({ ...old, selected: [node || gridKey(cell)], region: null }));
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const p = world(e);
    if (d.kind === 'node') {
      const cell = snapGrid(p); const other = s.nodes[d.id === 'S' ? 'G' : 'S'];
      if (!walls.has(gridKey(cell)) && gridKey(cell) !== gridKey(other)) update(old => ({ ...old, nodes: { ...old.nodes, [d.id]: cell } }));
    } else if (d.kind === 'region') setBox({ start: d.start, end: p });
    else update(old => ({ ...old, camera: { ...cam, x: cam.x - (p.x - d.start.x), y: cam.y - (p.y - d.start.y) } }));
  };
  const end = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d?.kind === 'region' && box) {
      const region = { x1: Math.min(box.start.x, box.end.x), x2: Math.max(box.start.x, box.end.x), y1: Math.min(box.start.y, box.end.y), y2: Math.max(box.start.y, box.end.y) };
      const ids = [...frame.open, ...frame.closed].filter(n => n.x >= region.x1 && n.x <= region.x2 && n.y >= region.y1 && n.y <= region.y2).map(n => n.id);
      update(old => ({ ...old, region, selected: ids }));
    }
    drag.current = null; setBox(null);
    if (svg.current?.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId);
  };
  const region = box ? { x1: Math.min(box.start.x, box.end.x), x2: Math.max(box.start.x, box.end.x), y1: Math.min(box.start.y, box.end.y), y2: Math.max(box.start.y, box.end.y) } : s.region;
  const cells = Array.from({ length: 77 }, (_, i) => ({ x: i % 11 - 5, y: Math.floor(i / 11) - 3 }));
  return <svg className="lesson-diagram" ref={svg} viewBox="-7.11 -4.5 14.22 9" aria-label="Live A star grid search" role="img" onContextMenu={e => e.preventDefault()} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    <g transform={`scale(${cam.zoom}) translate(${-cam.x} ${cam.y})`}>
      {cells.map(p => {
        const id = gridKey(p); const open = frame.open.find(n => n.id === id); const visited = frame.closed.find(n => n.id === id);
        const isStart = gridKey(s.nodes.S) === id, isGoal = gridKey(s.nodes.G) === id;
        const wall = walls.has(id) && !isStart && !isGoal;
        const selected = s.selected.includes(id) || isStart && s.selected.includes('S') || isGoal && s.selected.includes('G');
        const color = isStart ? '#83C167' : isGoal ? '#FC6255' : selected ? '#FFFF00' : frame.current === id ? '#FFFF00' : open ? '#58C4DD' : '#384450';
        const n = open || visited;
        return <g key={id} data-cell={id}>
          <title>{`${id}${n ? ` g=${n.g}, h=${n.h}, f=${n.f}` : wall ? ' wall' : ' undiscovered'}`}</title>
          <rect x={p.x - .46} y={-p.y - .46} width=".92" height=".92" rx=".07" fill={wall ? '#26303a' : frame.path.includes(id) ? '#83C167' : color} fillOpacity={wall ? .8 : frame.path.includes(id) ? .22 : open ? .13 : visited ? .08 : .015} stroke={color} strokeWidth={selected || isStart || isGoal ? .055 : .015} />
          {isStart || isGoal ? <text x={p.x} y={-p.y + .08} textAnchor="middle" fill={color} fontSize=".32">{isStart ? 'S' : 'G'}</text> : n ? <><text x={p.x} y={-p.y - .05} textAnchor="middle" fill={color} fontSize=".25">{n.f}</text><text x={p.x} y={-p.y + .22} textAnchor="middle" fill="#687f92" fontSize=".13">g{n.g} + h{n.h}</text></> : null}
        </g>;
      })}
      {frame.path.length > 1 && <polyline points={frame.path.map(id => { const [x, y] = id.split(',').map(Number); return `${x},${-y}`; }).join(' ')} fill="none" stroke="#83C167" strokeWidth=".07" pointerEvents="none" />}
      {region && <rect x={region.x1} y={-region.y2} width={region.x2 - region.x1} height={region.y2 - region.y1} fill="#58c4dd" fillOpacity=".08" stroke="#58c4dd" strokeWidth=".025" pointerEvents="none" />}
    </g>
    <text x="-5.4" y="4" fill="#8597a8" fontSize=".19">{index === 0 ? 'Start and goal · the search begins after a pause' : frame.done ? `Goal reached · shortest path ${frame.path.length - 1} steps` : `Expansion ${index} · next: (${frame.open[0]?.id || 'none'})`}</text>
    <text x="-5.4" y="-4" fill="#58c4dd" fontSize=".19">FOUR-WAY MOVEMENT · UNIT COST · MANHATTAN h</text>
  </svg>;
}
