import React, { useRef, useState } from 'react';
import { Beat, Camera, Element, Point, Snapshot } from './types';
import { animatedCamera, animatedElements, smooth } from './motion';

type Props = { snapshot: Snapshot; beat: Beat; previous?: Beat; seconds: number;
  update: (fn: (s: Snapshot) => Snapshot) => void; onInteract: () => void };

function lines(label: string, width: number) {
  const result: string[] = []; let row = '';
  for (const word of label.split(/\s+/)) {
    if ((row + ' ' + word).length > Math.max(9, width * 8) && row) { result.push(row); row = word; }
    else row += (row ? ' ' : '') + word;
  }
  if (row) result.push(row);
  return result;
}

export function PlanCanvas({ snapshot: s, beat, previous, seconds, update, onInteract }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ type: 'node' | 'pan' | 'region'; id?: string; start: Point; camera: Camera; origin?: Point } | null>(null);
  const [region, setRegion] = useState<{ start: Point; end: Point } | null>(null);
  const cam = s.camera || animatedCamera(beat, previous, seconds);
  const active = animatedElements(beat, previous, seconds, s.positions);
  const ghosts = (previous?.elements || []).filter(e => !beat.elements.some(n => n.id === e.id)).map(e => ({ ...e,
    ...(s.positions[`${previous!.id}:${e.id}`] || {}), draw: 1, labelOpacity: 1, pulse: 0, flow: 0,
    opacity: (e.opacity ?? 1) * (1 - smooth(seconds / .7)), existing: true, entrance: 'draw' as const }));
  const elements = [...active, ...ghosts];
  const world = (event: React.PointerEvent | React.WheelEvent): Point => {
    const point = new DOMPoint(event.clientX, event.clientY);
    const matrix = svg.current?.getScreenCTM();
    const p = matrix ? point.matrixTransform(matrix.inverse()) : point;
    return { x: p.x / cam.zoom + cam.x, y: -p.y / cam.zoom + cam.y };
  };
  const begin = (event: React.PointerEvent, element?: Element) => {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault(); event.stopPropagation(); onInteract();
    svg.current?.setPointerCapture(event.pointerId);
    const p = world(event);
    const type = event.button === 2 ? 'pan' : element ? 'node' : 'region';
    drag.current = { type, id: element?.id, start: p, camera: cam, origin: element && { x: element.x, y: element.y } };
    if (type === 'node') update(old => ({ ...old, selected: [element!.id], region: null }));
    if (type === 'region') setRegion({ start: p, end: p });
  };
  const move = (event: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const p = world(event);
    if (d.type === 'node') update(old => ({ ...old, positions: { ...old.positions,
      [`${beat.id}:${d.id}`]: { x: Math.max(-40, Math.min(40, d.origin!.x + p.x - d.start.x)), y: Math.max(-40, Math.min(40, d.origin!.y + p.y - d.start.y)) } } }));
    if (d.type === 'pan') update(old => ({ ...old, camera: { ...cam, x: cam.x - (p.x - d.start.x), y: cam.y - (p.y - d.start.y) } }));
    if (d.type === 'region') setRegion({ start: d.start, end: p });
  };
  const end = (event: React.PointerEvent) => {
    const d = drag.current;
    if (d?.type === 'region') {
      const p = world(event); const box = { x1: Math.min(d.start.x, p.x), x2: Math.max(d.start.x, p.x), y1: Math.min(d.start.y, p.y), y2: Math.max(d.start.y, p.y) };
      update(old => ({ ...old, region: box, selected: active.filter(e => e.draw > .05 && !['arrow', 'line'].includes(e.kind) && e.x >= box.x1 && e.x <= box.x2 && e.y >= box.y1 && e.y <= box.y2).map(e => e.id) }));
    }
    drag.current = null; setRegion(null);
    if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
  };
  const box = region ? { x1: Math.min(region.start.x, region.end.x), x2: Math.max(region.start.x, region.end.x), y1: Math.min(region.start.y, region.end.y), y2: Math.max(region.start.y, region.end.y) } : s.region;
  return <svg ref={svg} className="lesson-diagram" viewBox="-7.11 -4 14.22 8" role="img" aria-label={s.plan?.title}
    onContextMenu={e => e.preventDefault()} onPointerDown={e => begin(e)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
    onWheel={e => { onInteract(); update(old => ({ ...old, camera: { ...cam, zoom: Math.max(.3, Math.min(3, cam.zoom * (e.deltaY > 0 ? .9 : 1.1))) } })); }}>
    <defs><marker id="arrow-tip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
    <g transform={`scale(${cam.zoom}) translate(${-cam.x} ${cam.y})`}>
      {(() => {
        const edges = elements.filter(e => e.kind === 'arrow' || e.kind === 'line');
        const pairCounts: Record<string, number> = {};
        edges.forEach(e => {
          const key = [e.from, e.to].sort().join('|');
          pairCounts[key] = (pairCounts[key] || 0) + 1;
        });
        const pairSeen: Record<string, number> = {};
        return edges.map(e => {
          const a = elements.find(p => p.id === e.from)!; const b = elements.find(p => p.id === e.to)!;
          if (!a || !b || e.draw <= 0 || e.opacity <= 0) return null;
          const key = [e.from, e.to].sort().join('|');
          const pIdx = pairSeen[key] || 0;
          pairSeen[key] = pIdx + 1;
          const pCnt = pairCounts[key] || 1;
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          const trim = (n: Element) => n.kind === 'text' ? .2 : Math.min(n.width / 2 / Math.max(.01, Math.abs(Math.cos(angle))), n.height / 2 / Math.max(.01, Math.abs(Math.sin(angle)))) + .08;
          const ta = trim(a), tb = trim(b);
          let start = { x: a.x + Math.cos(angle) * ta, y: -a.y - Math.sin(angle) * ta };
          let end = { x: b.x - Math.cos(angle) * tb, y: -b.y + Math.sin(angle) * tb };
          let offY = 0;
          if (pCnt > 1) {
            const normal = { x: -Math.sin(angle), y: -Math.cos(angle) };
            const offsetDist = (pIdx - (pCnt - 1) / 2) * 0.18;
            start = { x: start.x + normal.x * offsetDist, y: start.y + normal.y * offsetDist };
            end = { x: end.x + normal.x * offsetDist, y: end.y + normal.y * offsetDist };
            offY = normal.y * offsetDist;
          }
          return <g key={e.id} opacity={e.opacity} data-motion-id={e.id} data-draw={e.draw.toFixed(3)}>
            <line x1={start.x} y1={start.y} x2={start.x + (end.x - start.x) * e.draw} y2={start.y + (end.y - start.y) * e.draw} stroke={e.pulse > 0 ? '#FFFF00' : e.color} strokeWidth={.025 + e.pulse * .025} markerEnd={e.kind === 'arrow' ? 'url(#arrow-tip)' : undefined} />
            {e.pulse > 0 && <circle cx={start.x + (end.x - start.x) * e.flow} cy={start.y + (end.y - start.y) * e.flow} r=".075" fill="#FFFF00" />}
            {e.label && <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - .16 + offY} textAnchor="middle" fontSize=".2" fill={e.color} opacity={smooth((e.draw - .6) / .4) * e.labelOpacity} paintOrder="stroke" stroke="#000" strokeWidth=".08">{e.label}</text>}
          </g>;
        });
      })()}
      {elements.filter(e => !['arrow', 'line'].includes(e.kind)).map(e => {
        if (e.draw <= 0 || e.opacity <= 0) return null;
        const written = e.entrance === 'write' ? e.label.slice(0, Math.ceil(e.label.length * e.draw)) : e.label;
        const rows = lines(written, e.width);
        const scale = e.entrance === 'grow' && !e.existing ? Math.max(.001, e.draw) : 1;
        const stroke = e.entrance === 'draw' && !e.existing ? { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - e.draw } : {};
        return <g key={e.id} transform={`translate(${e.x} ${-e.y}) scale(${scale})`} onPointerDown={event => begin(event, e)} className="diagram-element" opacity={e.opacity} data-motion-id={e.id} data-draw={e.draw.toFixed(3)}>
          <title>{e.description || e.label}</title>
          {(s.selected.includes(e.id) || e.pulse > 0) && <rect x={-e.width / 2 - .12 - e.pulse * .1} y={-e.height / 2 - .12 - e.pulse * .1} width={e.width + .24 + e.pulse * .2} height={e.height + .24 + e.pulse * .2} rx=".16" stroke="#FFFF00" strokeWidth=".03" strokeDasharray={e.pulse > 0 ? undefined : '.08 .05'} fill="none" opacity={s.selected.includes(e.id) ? 1 : e.pulse} />}
          {e.kind === 'circle' ? <ellipse rx={e.width / 2} ry={e.height / 2} stroke={e.color} strokeWidth=".035" fill={e.color} fillOpacity={.08 * e.draw} {...stroke} /> : e.kind === 'box' ? <rect x={-e.width / 2} y={-e.height / 2} width={e.width} height={e.height} rx=".12" stroke={e.color} strokeWidth=".025" fill={e.color} fillOpacity={.08 * e.draw} {...stroke} /> : <rect x={-e.width / 2} y={-e.height / 2} width={e.width} height={e.height} fill="transparent" />}
          <text textAnchor="middle" dominantBaseline="central" fontSize={Math.min(.29, e.height / Math.max(1, rows.length) * .7)} fill={e.color} opacity={e.labelOpacity * (e.entrance === 'write' ? 1 : smooth((e.draw - .5) / .5))}>
            {rows.map((row, i) => <tspan x="0" dy={i === 0 ? -(rows.length - 1) * .15 : .3} key={i}>{row}</tspan>)}
          </text>
        </g>;
      })}
      {box && <rect x={box.x1} y={-box.y2} width={box.x2 - box.x1} height={box.y2 - box.y1} fill="#58C4DD" fillOpacity=".08" stroke="#58C4DD" strokeWidth=".02" pointerEvents="none" />}
    </g>
  </svg>;
}
