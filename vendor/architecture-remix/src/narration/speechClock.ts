import type { ArchitectureGraph, Step } from '../types/lesson';

export interface VoiceScope { title: string; scope: string; sourceCode: string; sampleInput: string; graph: ArchitectureGraph; steps: Step[] }
export interface VoiceTrack {
  key: string; fingerprint: string; url: string; duration: number; sceneDuration: number;
  points: { audio: number; scene: number }[];
  chapters: { id: string; start: number; end: number; narration: string; bridge: string }[];
  captions: { at: number; text: string }[];
}

export function checkTrack(track: VoiceTrack, scope: VoiceScope): VoiceTrack {
  const sceneDuration = scope.steps.reduce((n, s) => n + s.duration, 0);
  if (!track || !/^\/narration\/[a-f0-9]{64}\.wav$/.test(track.url) || !Number.isFinite(track.duration) || track.duration <= 0 ||
      Math.abs(track.sceneDuration - sceneDuration) > .001 || track.chapters.length !== scope.steps.length ||
      track.chapters.some((c, i) => c.id !== scope.steps[i].id) || track.points.length < 2) throw Error('Narration does not match this architecture view.');
  for (let i = 0; i < track.points.length; i++) {
    const p = track.points[i], prev = track.points[i - 1];
    if (!Number.isFinite(p.audio + p.scene) || p.audio < 0 || p.scene < 0 || p.audio > track.duration + .001 || p.scene > sceneDuration + .001 ||
        (prev && (p.audio <= prev.audio || p.scene < prev.scene))) throw Error('Narration has an invalid measured timeline.');
  }
  if (track.points[0].audio !== 0 || track.points[0].scene !== 0 || Math.abs(track.points.at(-1)!.audio - track.duration) > .001 ||
      Math.abs(track.points.at(-1)!.scene - sceneDuration) > .001) throw Error('Narration timeline is incomplete.');
  return track;
}

export function audioToScene(track: VoiceTrack, seconds: number): number {
  const t = Math.max(0, Math.min(track.duration, seconds));
  const index = track.points.findIndex(p => p.audio > t);
  if (index < 0) return track.sceneDuration;
  if (!index) return 0;
  const a = track.points[index - 1], b = track.points[index];
  return a.scene + (t - a.audio) / (b.audio - a.audio) * (b.scene - a.scene);
}

export function sceneToAudio(track: VoiceTrack, seconds: number): number {
  const t = Math.max(0, Math.min(track.sceneDuration, seconds));
  const exact = track.points.find(p => Math.abs(p.scene - t) < .00001);
  if (exact) return exact.audio;
  const index = track.points.findIndex(p => p.scene > t);
  if (index < 0) return track.duration;
  if (!index) return 0;
  const a = track.points[index - 1], b = track.points[index];
  return a.audio + (t - a.scene) / (b.scene - a.scene) * (b.audio - a.audio);
}
