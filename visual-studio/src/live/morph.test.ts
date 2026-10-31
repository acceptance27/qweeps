import assert from 'node:assert/strict';
import test from 'node:test';
import {lineLoop,rectLoop,pathD,translateLoop,scaleLoop,measurePacing} from './morph';

test('line and rect canonicalize to the same eight-cubic structure', () => {
  const line = lineLoop([10, 50], [90, 50]);
  const rect = rectLoop(10, 20, 80, 60);
  assert.equal((line.length - 1) / 3, 8);
  assert.equal((rect.length - 1) / 3, 8);
  assert.equal((pathD(line).match(/C/g) ?? []).length, 8);
  assert.equal((pathD(rect).match(/C/g) ?? []).length, 8);
  assert.ok(pathD(line).startsWith('M'));
  assert.ok(pathD(rect).endsWith('Z'));
});

test('the degenerate line loop has the same start and winding skeleton as the rect', () => {
  const line = lineLoop([0, 0], [10, 0]);
  const rect = rectLoop(0, 0, 10, 10);
  assert.deepEqual(line[0], rect[0]);
  assert.deepEqual(line[6], [10, 0]);
  assert.equal(line.length, rect.length);
});

test('loops can be baked into stage space before a morph', () => {
  const moved = translateLoop(rectLoop(0, 0, 10, 10), 100, 20);
  const scaled = scaleLoop(moved, 0.5);
  assert.deepEqual(scaled[0], [50, 10]);
  assert.equal(scaled.length, 25);
});

test('the pilot meets the WWIDecision pacing law', () => {
  const pacing = measurePacing([
    {at: 0, duration: .4, kind: 'reveal'},
    {at: .4, duration: 1.6, kind: 'move'},
    {at: 2.2, duration: 1.5, kind: 'morph'},
    {at: 4.5, duration: .8, kind: 'dock'},
    {at: 5.5, duration: 1.2, kind: 'build'},
    {at: 8, duration: .5, kind: 'indicate'},
  ], 10);
  assert.equal(pacing.starts, 6);
  assert.ok(pacing.startsPer10s >= 2);
  assert.ok(pacing.maxHold <= 2.5);
  assert.equal(pacing.passes, true);
});
