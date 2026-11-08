import { NarrationTransport } from '../../../../visual-studio/src/learning/NarrationTransport';
import { audioToScene, checkTrack, sceneToAudio, type VoiceScope, type VoiceTrack } from './speechClock';

type Job = { id: string; status: 'preparing' | 'ready' | 'failed' | 'cancelled'; stage: string; error?: string; track?: VoiceTrack };
type Phase = 'idle' | 'preparing' | 'loading' | 'ready' | 'error';

/** One audio owner across all inspect levels; stale requests can never acquire playback. */
export class ArchitectureVoice {
  key = ''; scope: VoiceScope | null = null; track: VoiceTrack | null = null;
  phase: Phase = 'idle'; stage = ''; error = ''; enabled = true;
  private scene = 0; private silentPosition = 0; private wanted = false; private generation = 0; private playIntent = 0;
  private job: string | null = null; private pending: Promise<void> | null = null;
  private tracks = new Map<string, VoiceTrack>();
  private positions = new Map<string, { scene: number; audio: number }>();
  private transport: NarrationTransport;
  constructor(private notify: () => void, private failed: (message: string) => void,
    private fetcher: typeof fetch = (input, init) => fetch(input, init),
    makeTransport = (notify: () => void) => new NarrationTransport(async () => { throw Error('Prepare the measured architecture recording first.'); }, notify)) {
    this.transport = makeTransport(notify);
  }
  private async api(path: string, body?: object): Promise<Job> {
    const response = await this.fetcher('/api/architecture/narration' + path, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : undefined);
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Could not prepare narration.');
    return data;
  }
  private checkpoint() {
    if (this.track) {
      const audio = this.enabled && this.transport.isReady ? this.transport.position : this.silentPosition;
      this.positions.set(this.key, { scene: audioToScene(this.track, audio), audio });
    }
  }
  private positionFor(scene: number) {
    if (!this.track) return scene;
    const saved = this.positions.get(this.key);
    return saved && Math.abs(saved.scene - scene) < .08 ? saved.audio : sceneToAudio(this.track, scene);
  }
  private abandon() {
    this.generation++; this.playIntent++; this.wanted = false;
    this.checkpoint(); this.transport.stop();
    if (this.job) void this.api('/jobs/' + this.job + '/cancel', {}).catch(() => {});
    this.job = null; this.pending = null;
  }
  select(key: string, scope: VoiceScope, scene: number) {
    if (key === this.key) return;
    this.abandon(); this.key = key; this.scope = scope; this.scene = scene;
    this.track = this.tracks.get(key) || null; this.phase = this.track ? 'loading' : 'idle'; this.stage = ''; this.error = '';
    this.silentPosition = this.positionFor(scene);
    if (this.track) void this.prepare().catch(() => {});
    this.notify();
  }
  syncScene(scene: number) {
    // React reports rendered frames after clock() has advanced. During playback
    // audio owns the clock; seeking to those frames replays the start of words.
    // User scrubs and beat jumps use seekAudio/seekScene explicitly.
    if (this.wanted) return;
    if (Math.abs(scene - this.scene) < .0001) return;
    this.scene = scene;
    if (this.track) {
      this.silentPosition = this.positionFor(scene);
      if (this.transport.isReady) this.transport.seek(this.silentPosition);
    }
  }
  seekAudio(audio: number) {
    if (!this.track) { this.scene = audio; return; }
    this.scene = audioToScene(this.track, audio); this.silentPosition = audio;
    this.positions.set(this.key, { scene: this.scene, audio });
    this.transport.seek(audio); this.notify();
  }
  seekScene(scene: number) {
    this.positions.delete(this.key); this.scene = scene;
    if (this.track) this.seekAudio(sceneToAudio(this.track, scene));
  }
  setEnabled(enabled: boolean) {
    this.checkpoint(); this.transport.pause(); this.wanted = false; this.playIntent++;
    this.enabled = enabled; this.silentPosition = this.positionFor(this.scene); this.notify();
  }
  setPlaying(playing: boolean) {
    this.wanted = playing; const intent = ++this.playIntent;
    if (!playing || !this.enabled) { this.checkpoint(); this.transport.pause(); return; }
    void this.prepare().then(async () => {
      if (this.wanted && this.enabled && intent === this.playIntent && this.track) {
        await this.transport.playFrom(this.positionFor(this.scene));
      }
    }).catch(error => {
      if (intent === this.playIntent && this.wanted) { this.wanted = false; this.failed(error.message); }
    });
  }
  private prepare(): Promise<void> {
    if (this.phase === 'ready' && this.transport.isReady) return Promise.resolve();
    if (this.pending) return this.pending;
    const generation = this.generation, key = this.key, scope = this.scope!;
    const current = () => generation === this.generation && key === this.key;
    this.pending = (async () => {
      if (!this.track) {
        this.phase = 'preparing'; this.stage = 'Writing one connected explanation'; this.error = ''; this.notify();
        let job = await this.api('', scope);
        if (!current()) { if (job.status === 'preparing') void this.api('/jobs/' + job.id + '/cancel', {}).catch(() => {}); return; }
        this.job = job.id;
        while (job.status === 'preparing') {
          this.stage = job.stage; this.notify();
          await new Promise(resolve => setTimeout(resolve, 500));
          if (!current()) return;
          job = await this.api('/jobs/' + job.id);
          if (!current()) return;
        }
        if (job.status !== 'ready' || !job.track) throw Error(job.error || 'Narration preparation cancelled.');
        this.track = checkTrack(job.track, scope); this.tracks.set(key, this.track); this.job = null;
      }
      if (!current()) return;
      this.phase = 'loading'; this.stage = 'Loading recorded narration'; this.notify();
      this.transport.seed(this.track.key, this.track.url);
      await this.transport.prepare(this.track.key);
      if (!current()) return;
      if (Math.abs(this.transport.duration - this.track.duration) > .15) throw Error('Recording duration does not match its measured cues.');
      this.silentPosition = this.positionFor(this.scene); this.transport.seek(this.silentPosition);
      this.phase = 'ready'; this.stage = 'Narration ready'; this.notify();
    })().catch(error => {
      if (current()) { this.transport.pause(); this.phase = 'error'; this.error = error.message; this.stage = ''; this.notify(); }
      throw error;
    }).finally(() => { if (current()) this.pending = null; });
    return this.pending;
  }
  clock(dt: number): number | null {
    if (!this.track) return this.enabled ? this.scene : null;
    if (this.enabled) {
      if (this.phase !== 'ready' || !this.transport.isReady) return this.scene;
      this.silentPosition = this.transport.position;
      // Media metadata rounds WAV duration; land on the exact scene endpoint.
      if (!this.transport.isPlaying && this.transport.position >= this.transport.duration - .005) {
        this.silentPosition = this.track.duration;
      }
    } else {
      this.silentPosition = Math.min(this.track.duration, this.silentPosition + dt);
    }
    this.scene = audioToScene(this.track, this.silentPosition); this.notify();
    return this.scene;
  }
  displayTime(scene: number): number {
    if (!this.track) return scene;
    return Math.abs(scene - this.scene) < .08 ? this.silentPosition : sceneToAudio(this.track, scene);
  }
  caption(scene: number): string | undefined {
    if (!this.track) return undefined;
    const time = this.displayTime(scene);
    return [...this.track.captions].reverse().find(c => c.at <= time)?.text;
  }
  cancel() { this.abandon(); this.track = this.tracks.get(this.key) || null; this.phase = this.track ? 'loading' : 'idle'; this.stage = ''; this.error = ''; this.notify(); }
  dispose() { this.abandon(); this.transport.dispose(); }
}
