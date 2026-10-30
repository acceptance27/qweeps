import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { advanceTime, animatedCamera, animatedElements } from './motion';
import type { Beat } from './types';

const first: Beat = { id: 'first', title: 'Construct', narration: 'Draw one relationship.', duration: 12,
  camera: { x: 0, y: 0, zoom: 1 }, elements: [
    { id: 'a', kind: 'circle', label: 'A', description: '', x: -3, y: 0, width: 1, height: 1, color: '#58C4DD', revealAt: 0, drawDuration: 1 },
    { id: 'b', kind: 'circle', label: 'B', description: '', x: 3, y: 0, width: 1, height: 1, color: '#83C167', revealAt: 2, drawDuration: 2 },
    { id: 'ab', kind: 'arrow', label: 'estimate', description: '', x: 0, y: 0, width: 2, height: 1, color: '#FFFF00', from: 'a', to: 'b', revealAt: 4, drawDuration: 2, emphasizeAt: 7 },
  ] };

test('Objects and arrows are constructed at separate times rather than appearing as a complete slide', () => {
  const half = animatedElements(first, undefined, .5);
  assert.ok(half[0].draw > 0 && half[0].draw < 1);
  assert.equal(half[1].draw, 0); assert.equal(half[2].draw, 0);
  const drawingWire = animatedElements(first, undefined, 5);
  assert.equal(drawingWire[1].draw, 1);
  assert.ok(drawingWire[2].draw > 0 && drawingWire[2].draw < 1);
  assert.ok(animatedElements(first, undefined, 7.6)[2].pulse > .9);
});

test('A shared object morphs and the camera moves through intermediate states without clearing the scene', () => {
  const next: Beat = { ...first, id: 'next', transitionDuration: 2, camera: { x: 2, y: 1, zoom: 1.4 },
    elements: first.elements.map(e => e.id === 'a' ? { ...e, x: 1, width: 2, opacity: .2 } : e) };
  const frame = animatedElements(next, first, 1)[0];
  assert.equal(frame.existing, true); assert.equal(frame.draw, 1);
  assert.equal(frame.x, -1); assert.equal(frame.width, 1.5); assert.ok(frame.opacity > .2 && frame.opacity < 1);
  assert.deepEqual(animatedCamera(next, first, 1), { x: 1, y: .5, zoom: 1.2 });
  assert.deepEqual(animatedElements(next, first, 1), animatedElements(next, first, 1));
});

test('Speech lets the geometry finish, then holds the end of the beat until narration completes', () => {
  assert.equal(advanceTime(1.5, .1, 5, 25, true), 1.6);
  assert.equal(advanceTime(4.95, .1, 5, 25, true), 4.999);
  assert.equal(advanceTime(4.999, .1, 5, 25, false), 5.001);
  assert.equal(advanceTime(24.99, .1, 25, 25, false), 25);
});
