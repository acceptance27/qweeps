import test from 'node:test';
import assert from 'node:assert/strict';
import { ArchitectureVoice } from '../../../vendor/architecture-remix/src/narration/ArchitectureVoice';
import { audioToScene, sceneToAudio, checkTrack, type VoiceScope, type VoiceTrack } from '../../../vendor/architecture-remix/src/narration/speechClock';
import { NarrationTransport, type ClipMedia } from '../../src/learning/NarrationTransport';

const scope = { title: 'Identity', scope: 'system', sourceCode: 'def run(x): return x', sampleInput: 'hello', graph: { nodes: [], edges: [] }, steps: [{ id: 'one', duration: 10 }] } as unknown as VoiceScope;
function track(letter = 'a'): VoiceTrack { return { key: letter.repeat(64), fingerprint: letter.repeat(64), url: '/narration/' + letter.repeat(64) + '.wav', duration: 20, sceneDuration: 10, points: [{ audio: 0, scene: 0 }, { audio: 4, scene: .001 }, { audio: 10, scene: 5 }, { audio: 15, scene: 5 }, { audio: 20, scene: 10 }], chapters: [{ id: 'one', start: 0, end: 20, narration: 'A connected explanation.', bridge: '' }], captions: [{ at: 0, text: 'First result.' }, { at: 11, text: 'The reasoning bridge keeps that result visible.' }] }; }
const settle = () => new Promise(resolve => setImmediate(resolve));
function setup(fetcher: typeof fetch = async () => Response.json({ id: 'job', status: 'ready', track: track() })) {
  const media = { src: '', preload: '', currentTime: 0, duration: 20, readyState: 1, ended: false, plays: 0, pauses: 0,
    async play() { media.plays++; media.onplaying?.call({} as GlobalEventHandlers, new Event("playing")); }, pause() { media.pauses++; media.onpause?.call({} as GlobalEventHandlers, new Event("pause")); }, load() {}, removeAttribute() { media.src = ''; }, onpause: null, onplaying: null } as unknown as ClipMedia & { plays: number; pauses: number };
  const errors: string[] = [];
  const voice = new ArchitectureVoice(() => {}, message => errors.push(message), fetcher,
    notify => new NarrationTransport(async () => { throw Error('never synthesize per beat'); }, notify, () => media));
  return { voice, media, errors };
}

test('the measured audio clock holds a bridge and reconstructs the same scene on rewind', () => {
  const t = checkTrack(track(), scope);
  assert.equal(audioToScene(t, 12), 5);
  assert.equal(audioToScene(t, 14.9), 5);
  assert.equal(audioToScene(t, 16), 6);
  assert.equal(sceneToAudio(t, 6), 16);
  assert.equal(audioToScene(t, 8), audioToScene(t, 8));
  assert.throws(() => checkTrack({ ...t, points: [{ audio: 0, scene: 0 }, { audio: 20, scene: 2 }] }, scope), /incomplete/);
  assert.throws(() => checkTrack({ ...t, chapters: [{ ...t.chapters[0], id: 'stale' }] }, scope), /does not match/);
});

test('pause and nested inspect/back retain the exact parent audio position even inside a bridge', async () => {
  let calls = 0;
  const { voice, media } = setup(async () => { calls++; return Response.json({ id: 'job', status: 'ready', track: track(calls === 1 ? 'a' : 'b') }); });
  voice.select('root', scope, 0); voice.setPlaying(true); await settle();
  media.currentTime = 12;
  const parent = voice.clock(0)!; assert.equal(parent, 5);
  voice.setPlaying(false);
  const src = media.src; assert.equal(voice.displayTime(parent), 12);
  voice.setPlaying(true); await settle(); assert.equal(media.currentTime, 12);
  voice.select('function', { ...scope, scope: 'function' }, 0); voice.setPlaying(true); await settle();
  assert.notEqual(media.src, src);
  media.currentTime = 3; voice.clock(0);
  voice.select('root', scope, parent); voice.setPlaying(false); await settle();
  assert.equal(media.src, src); assert.equal(media.currentTime, 12);
  assert.equal(voice.caption(parent), 'The reasoning bridge keeps that result visible.');
  voice.setPlaying(true); await settle(); assert.equal(media.currentTime, 12);
  assert.equal(calls, 2, 'returning to a prepared parent must not request a new recording');
  voice.dispose();
});

test('pausing pending speech prevents late playback without throwing away its completed recording', async () => {
  let finish!: (response: Response) => void;
  const { voice, media } = setup(() => new Promise(resolve => { finish = resolve; }));
  voice.select('root', scope, 0); voice.setPlaying(true); voice.setPlaying(false);
  finish(Response.json({ id: 'job', status: 'ready', track: track() })); await settle();
  assert.equal(media.plays, 0); assert.equal(voice.phase, 'ready');
  voice.setPlaying(true); await settle(); assert.equal(media.plays, 1);
  voice.dispose();
});

test('cancellation and source replacement cannot autoplay a stale provider response', async () => {
  let finish!: (response: Response) => void;
  const { voice, media } = setup(() => new Promise(resolve => { finish = resolve; }));
  voice.select('root-v1', scope, 0); voice.setPlaying(true); voice.cancel();
  voice.select('root-v2', { ...scope, sourceCode: 'changed source' }, 0);
  finish(Response.json({ id: 'old-job', status: 'ready', track: track() })); await settle();
  assert.equal(media.plays, 0); assert.equal(voice.track, null); assert.equal(voice.key, 'root-v2');
  voice.dispose();
});

test('seek, silent playback and unmute share the measured track without restarting speech', async () => {
  const { voice, media } = setup(); voice.select('root', scope, 0); voice.setPlaying(true); await settle();
  voice.setPlaying(false); voice.seekAudio(16);
  assert.equal(voice.clock(0), 6); assert.equal(voice.displayTime(6), 16);
  voice.seekAudio(8); assert.ok(Math.abs(voice.clock(0)! - audioToScene(track(), 8)) < .001);
  voice.setEnabled(false); voice.seekAudio(12);
  assert.equal(voice.clock(1), 5); assert.equal(voice.displayTime(5), 13);
  voice.setEnabled(true); voice.setPlaying(true); await settle(); assert.equal(media.currentTime, 13);
  voice.dispose();
});

test('provider failure leaves the diagram available and never claims audio is ready', async () => {
  const { voice, media, errors } = setup(async () => Response.json({ error: 'Speech key missing' }, { status: 400 }));
  voice.select('root', scope, 0); voice.setPlaying(true); await settle();
  assert.equal(voice.phase, 'error'); assert.equal(media.plays, 0); assert.deepEqual(errors, ['Speech key missing']);
  voice.setEnabled(false); assert.equal(voice.clock(.1), null);
  voice.dispose();
});

test('browser native fetch is called without binding it to the voice controller', async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async function (this: unknown) {
    assert.equal(this, undefined, 'a Window fetch function must not receive the controller as its receiver');
    called = true;
    return Response.json({ error: 'Expected smoke-test stop' }, { status: 400 });
  } as typeof fetch;
  try {
    const errors: string[] = [];
    const voice = new ArchitectureVoice(() => {}, message => errors.push(message), undefined,
      notify => new NarrationTransport(async () => '', notify, () => ({ preload: '', pause() {}, removeAttribute() {} } as unknown as ClipMedia)));
    voice.select('browser', scope, 0); voice.setPlaying(true); await settle();
    assert.equal(called, true); assert.deepEqual(errors, ['Expected smoke-test stop']); voice.dispose();
  } finally { globalThis.fetch = original; }
});

test('rounded browser media duration still lands on the exact final scene and stops playback', async () => {
  const { voice, media } = setup(); voice.select('root', scope, 0); voice.setPlaying(true); await settle();
  Object.defineProperty(media, 'duration', { value: 19.9999997 }); media.currentTime = media.duration;
  media.onended?.call({} as GlobalEventHandlers, new Event('ended'));
  assert.equal(voice.clock(0), 10); assert.equal(voice.displayTime(10), 20);
  voice.dispose();
});

test('delayed animation frames cannot seek the audio clock backward during playback', async () => {
  const { voice, media } = setup(); voice.select('root', scope, 0); voice.setPlaying(true); await settle();
  let audioTime = 5;
  const seeks: number[] = [];
  Object.defineProperty(media, 'currentTime', { configurable: true, get: () => audioTime, set: (value: number) => { seeks.push(value); audioTime = value; } });
  let previousFrame = voice.clock(0)!;
  for (let frame = 0; frame < 180; frame++) {
    audioTime = 5 + frame / 60;
    const nextFrame = voice.clock(1 / 60)!;
    // React may commit the preceding frame after the next audio sample was read.
    voice.syncScene(previousFrame);
    previousFrame = nextFrame;
  }
  assert.deepEqual(seeks, [], 'ordinary visual updates must never write audio.currentTime');
  voice.seekAudio(6.5);
  assert.deepEqual(seeks, [6.5], 'an explicit scrub still seeks the recording');
  voice.setPlaying(false); voice.setPlaying(true); await settle();
  assert.equal(media.currentTime, 6.5, 'pause/resume retains the explicitly selected position');
  voice.dispose();
});
