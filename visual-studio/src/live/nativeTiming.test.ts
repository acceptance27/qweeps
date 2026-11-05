import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeSceneTime} from './nativeTiming';
import type {LiveChapter} from './lessonTypes';

const chapter = {
  renderer: 'manimgl', start: 20, end: 34, nativeOffset: 10, nativeDuration: 12,
  nativeMap: [{at: 0, scene: 10}, {at: 3, scene: 10}, {at: 5, scene: 14}, {at: 10, scene: 19}, {at: 14, scene: 21.999}],
} as LiveChapter;

test('native playback uses measured action cues and holds through the spoken bridge', () => {
  assert.equal(nativeSceneTime(chapter, 21), 10);
  assert.equal(nativeSceneTime(chapter, 23), 10);
  assert.equal(nativeSceneTime(chapter, 25), 14);
  assert.equal(nativeSceneTime(chapter, 30), 19);
  assert.equal(nativeSceneTime(chapter, 100), 21.999);
});

test('native pause, seek and arbitrary rewind resolve to the same scene state', () => {
  const paused = nativeSceneTime(chapter, 27);
  assert.equal(nativeSceneTime(chapter, 27), paused);
  nativeSceneTime(chapter, 33);
  assert.equal(nativeSceneTime(chapter, 27), paused);
  nativeSceneTime(chapter, 20);
  assert.equal(nativeSceneTime(chapter, 27), paused);
  assert.equal(nativeSceneTime(chapter, 25), 14);
});
