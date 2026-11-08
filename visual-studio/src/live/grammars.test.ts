import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import opentype from 'opentype.js';
import {chapterGrammar, chronologySpots, grammarBoxes} from './grammars';
import {fitCopy} from './layout';
import type {LiveVisual} from './lessonTypes';

const bytes = fs.readFileSync(new URL('../../public/live/teaching-serif.ttf', import.meta.url));
const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

function timeline(count: number): LiveVisual {
  return {
    layout: 'timeline',
    nodes: Array.from({length: count}, (_, i) => ({id: `event-${i}`, title: `Event ${i}`, body: ''})),
    connections: [],
    columns: [],
    takeaway: '',
  } as unknown as LiveVisual;
}

test('a narrative timeline uses the chronology grammar', () => {
  assert.equal(chapterGrammar({teaching: 'narrative', visual: timeline(4)}), 'chronology');
});

test('chronology stations stay inside the stage without overlapping', () => {
  for (const count of [2, 3, 4]) {
    const boxes = grammarBoxes(timeline(count), 'chronology');
    assert.equal(boxes.length, count);
    for (const box of boxes) {
      assert.ok(box.x >= 45, `station starts at ${box.x}`);
      assert.ok(box.x + box.width <= 1395, `station ends at ${box.x + box.width}`);
      assert.ok(box.width >= 180, `station width ${box.width}`);
    }
    for (let i = 0; i < boxes.length - 1; i++) {
      const a = boxes[i], b = boxes[i + 1];
      assert.ok(
        a.x + a.width <= b.x,
        `stations ${i} and ${i + 1} overlap by ${a.x + a.width - b.x}px`,
      );
    }
  }
});

test('four chronology stations keep the full 960px span', () => {
  const spots = chronologySpots(4);
  assert.deepEqual(spots, [240, 560, 880, 1200]);
});

test('four chronology descriptions fit inside their station gutter', () => {
  const bodies = [
    "You ask 'How does a rainbow form?' into the microphone. Speech input means hands-free asking, no typing or setup needed.",
    'QWEEPS sends your words to your chosen language model, then speaks its plain-language answer about sunlight and rain aloud.',
    'You ask for visuals. The generator plans a storyboard, sets artwork style for sun and drops, then animates scenes with narration.',
    'You watch the rainbow lesson, pause to inspect, then answer a short quiz that explains each choice and aids recall.',
  ];
  const boxes = grammarBoxes(timeline(4), 'chronology');
  for (let i = 0; i < boxes.length; i++) {
    const width = boxes[i].width - 28;
    const fit = fitCopy(font, bodies[i], width, 80, 20, 14);
    assert.equal(fit.overflow, false, `description ${i} overflows its station`);
    for (const line of fit.lines) {
      assert.ok(font.getAdvanceWidth(line, fit.size) <= width, `description ${i} line exceeds its gutter`);
    }
  }
});
