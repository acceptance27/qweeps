import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { gridKey, gridNodes, searchFrame, searchTrace, walls } from './astar';
import type { Point } from './types';

function bfs(start: Point, goal: Point) {
  const queue = [{ ...start, distance: 0 }]; const seen = new Set([gridKey(start)]);
  while (queue.length) {
    const n = queue.shift()!;
    if (gridKey(n) === gridKey(goal)) return n.distance;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const p = { x: n.x + dx, y: n.y + dy }, key = gridKey(p);
      if (Math.abs(p.x) > 5 || Math.abs(p.y) > 3 || walls.has(key) || seen.has(key)) continue;
      seen.add(key); queue.push({ ...p, distance: n.distance + 1 });
    }
  }
  return Infinity;
}

test('A* finds paths matching an independent breadth-first oracle after moving endpoints', () => {
  for (const [start, goal] of [[gridNodes.S, gridNodes.G], [{ x: -2, y: 0 }, { x: 1, y: 0 }], [{ x: 5, y: -3 }, { x: -5, y: 3 }], [{ x: 1, y: -2 }, { x: 1, y: -2 }]]) {
    const trace = searchTrace(start, goal); const last = trace.at(-1)!;
    assert.equal(last.done, true);
    assert.equal(last.path.length - 1, bfs(start, goal));
    for (let i = 1; i < last.path.length; i++) {
      const a = last.path[i - 1].split(',').map(Number), b = last.path[i].split(',').map(Number);
      assert.equal(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 1);
      assert.ok(!walls.has(last.path[i]));
    }
  }
});

test('The chosen node is always the prior queue head and uses accumulated g', () => {
  const trace = searchTrace(gridNodes.S, gridNodes.G);
  for (let i = 1; i < trace.length; i++) {
    assert.equal(trace[i].current, trace[i - 1].open[0].id);
    assert.ok(trace[i].open.every(n => n.f === n.g + n.h));
    assert.ok(trace[i].closed.every(n => !trace[i].open.some(o => o.id === n.id)));
  }
  const n = searchTrace({ x: -2, y: 0 }, { x: 1, y: 0 }).at(-1)!.closed.at(-1)!;
  assert.ok(n.g > Math.abs(n.x + 2) + Math.abs(n.y));
});

test('Scrubbing reconstructs the same frontier and past frames remain immutable', () => {
  const past = searchFrame(gridNodes, 20); const original = JSON.stringify(past);
  searchFrame({ ...gridNodes, G: { x: -4, y: 3 } }, 50);
  assert.equal(JSON.stringify(past), original);
  assert.deepEqual(searchFrame(gridNodes, 20), past);
  assert.equal(searchFrame(gridNodes, -20).index, 0);
  assert.equal(searchFrame(gridNodes, 1000).frame.done, true);
});
