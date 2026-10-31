import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import opentype from 'opentype.js';
import {compileArtworkIR} from './ir';
import {IR_FIXTURES} from './ir.fixtures';
import type {IRScene} from './ir';

const buffer = fs.readFileSync('public/live/teaching-serif.ttf');
const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

test('the three IR fixtures compile inside the artwork frame', () => {
  for (const fixture of IR_FIXTURES) {
    const result = compileArtworkIR(fixture.scene, {artViewportPx: 340, font});
    assert.equal(result.findings.filter(f => f.severity === 'error').length, 0, fixture.id);
    assert.ok(result.bbox.width <= 100.01, `${fixture.id} width`);
    assert.ok(result.bbox.height <= 100.01, `${fixture.id} height`);
    assert.ok(result.artwork.length > 5, `${fixture.id} artwork`);
  }
});

test('arrows resolve from object bounds after layout', () => {
  const fixture = IR_FIXTURES[0];
  const result = compileArtworkIR(fixture.scene, {artViewportPx: 340, font});
  const paths = result.artwork.filter(part => part.type === 'path');
  assert.ok(paths.length >= 4);
});

test('uniform text scaling is rejected instead of shrinking measured text', () => {
  const scene: IRScene = {
    objects: [
      {id: 'a', kind: 'rect', width: 40, height: 20},
      {id: 't', kind: 'text', text: 'measured label', size: 8},
      {id: 'group', kind: 'group', children: ['a', 't']},
    ],
    layout: [{op: 'scale_to_fit_width', id: 'group', width: 20}],
  };
  const result = compileArtworkIR(scene, {artViewportPx: 340, font});
  assert.ok(result.findings.some(f => f.code === 'text_scaling'));
});

test('too-small text is reported in rendered pixels', () => {
  const scene: IRScene = {
    objects: [{id: 't', kind: 'text', text: 'tiny', size: 1}],
    layout: [],
  };
  const result = compileArtworkIR(scene, {artViewportPx: 120, font});
  assert.ok(result.findings.some(f => f.code === 'text_too_small'));
});
