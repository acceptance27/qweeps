import type { Beat, Camera, Element, Point } from './types';

export const smooth = (value: number) => {
  const p = Math.max(0, Math.min(1, value));
  return p * p * p * (p * (p * 6 - 15) + 10);
};
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
function colorMix(a: string, b: string, p: number) {
  const channel = (offset: number) => Math.round(mix(parseInt(a.slice(offset, offset + 2), 16), parseInt(b.slice(offset, offset + 2), 16), p)).toString(16).padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/** Pure timeline evaluation: seeking restores the same construction and camera. */
export function animatedCamera(beat: Beat, previous: Beat | undefined, seconds: number): Camera {
  const from = previous?.camera || { x: 0, y: 0, zoom: 1 };
  const p = smooth(seconds / (beat.transitionDuration ?? 1.6));
  return { x: mix(from.x, beat.camera.x, p), y: mix(from.y, beat.camera.y, p), zoom: mix(from.zoom, beat.camera.zoom, p) };
}

export function animatedElements(beat: Beat, previous: Beat | undefined, seconds: number, edits: Record<string, Point> = {}) {
  const transition = smooth(seconds / (beat.transitionDuration ?? 1.6));
  return beat.elements.map((target, index) => {
    const old = previous?.elements.find(e => e.id === target.id);
    const start = target.revealAt ?? Math.min(index * .4, Math.max(0, beat.duration - 2));
    const draw = old ? 1 : smooth((seconds - start) / (target.drawDuration ?? 1.2));
    const from = old && { ...old, ...(edits[`${previous!.id}:${old.id}`] || {}) };
    const edited = edits[`${beat.id}:${target.id}`];
    const e: Element = { ...target,
      x: edited?.x ?? (from ? mix(from.x, target.x, transition) : target.x),
      y: edited?.y ?? (from ? mix(from.y, target.y, transition) : target.y),
      width: from ? mix(from.width, target.width, transition) : target.width,
      height: from ? mix(from.height, target.height, transition) : target.height,
      color: from ? colorMix(from.color, target.color, transition) : target.color,
    };
    const changedLabel = old && old.label !== target.label;
    const label = changedLabel && transition < .5 ? old.label : target.label;
    const labelOpacity = changedLabel ? Math.abs(transition * 2 - 1) : 1;
    const emphasize = target.emphasizeAt === undefined ? 0 : Math.max(0, Math.min(1, (seconds - target.emphasizeAt) / 1.2));
    const pulse = target.emphasizeAt === undefined || seconds < target.emphasizeAt || seconds > target.emphasizeAt + 1.2 ? 0 : Math.sin(emphasize * Math.PI);
    const opacity = from ? mix(from.opacity ?? 1, target.opacity ?? 1, transition) : target.opacity ?? 1;
    return { ...e, label, draw, labelOpacity, opacity, pulse, flow: emphasize, existing: !!old,
      entrance: target.entrance ?? (target.kind === 'text' ? 'write' : target.kind === 'circle' ? 'grow' : 'draw') };
  });
}

/** Narration may extend a beat, but must never freeze its construction mid-draw. */
export function advanceTime(time: number, dt: number, end: number, duration: number, speaking: boolean) {
  return Math.max(time, Math.min(time + dt, speaking ? end - .001 : end + .001, duration));
}
