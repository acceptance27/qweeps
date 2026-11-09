export type VoiceState={loading:boolean;playing:boolean;ready:boolean};
export type ClipMedia=Pick<HTMLAudioElement,'src'|'preload'|'currentTime'|'duration'|'readyState'|'ended'|'play'|'pause'|'load'|'removeAttribute'|'onloadedmetadata'|'onended'|'onpause'|'onplaying'|'onerror'>;
/** One cached clip and one explicit playhead. Pause never destroys the clip. */
export class NarrationTransport {
 private audio:ClipMedia;private text='';private epoch=0;private wanted=false;private ready=false;private loading=false;private playing=false;private clips=new Map<string,Promise<string>>();private current:Promise<void>|null=null;private positions=new Map<string,number>();
 constructor(private fetchClip:(text:string)=>Promise<string>,private notify:(state:VoiceState)=>void,makeAudio:()=>ClipMedia=()=>{const audio=new Audio();audio.hidden=true;audio.dataset.qweepsNarration='';document.body.append(audio);return audio;}){
  this.audio=makeAudio();this.audio.preload='auto';
  this.audio.onended=()=>{this.wanted=false;this.playing=false;this.emit();};
  this.audio.onpause=()=>{this.playing=false;this.emit();};
  this.audio.onplaying=()=>{this.playing=true;this.emit();};
 }
 seed(text:string,url:string){this.clips.set(text,Promise.resolve(url));}
 prefetch(text:string):Promise<string>{let clip=this.clips.get(text);if(!clip){clip=this.fetchClip(text).catch(error=>{this.clips.delete(text);throw error;});this.clips.set(text,clip);}return clip;}
 private emit(){this.notify({loading:this.loading,playing:this.playing,ready:this.ready});}
 prepare(text:string):Promise<void>{
  if(this.text===text&&this.current)return this.current;
  if(this.text)this.positions.set(this.text,this.audio.currentTime);
  this.pause();this.text=text;const epoch=++this.epoch;this.ready=false;this.loading=true;this.emit();
  const clip=this.prefetch(text);
  this.current=clip.then(url=>new Promise<void>((resolve,reject)=>{
   if(epoch!==this.epoch){resolve();return;}
   let settled=false;
   const loaded=()=>{if(settled)return;settled=true;this.audio.onloadedmetadata=null;if(epoch!==this.epoch){resolve();return;}this.ready=true;this.loading=false;this.audio.currentTime=Math.min(this.positions.get(text)||0,Number.isFinite(this.audio.duration)?this.audio.duration:0);this.emit();resolve();};
   this.audio.onloadedmetadata=loaded;
   this.audio.onerror=()=>{if(epoch===this.epoch){this.loading=false;this.emit();}reject(new Error('Narration clip could not be decoded.'));};
   this.audio.src=url;this.audio.load();
   if(this.audio.readyState>=1)loaded();
  })).catch(error=>{if(epoch===this.epoch){this.loading=false;this.ready=false;this.emit();}throw error;});
  return this.current;
 }
 async playFrom(seconds=0){this.wanted=true;const epoch=this.epoch;if(this.current)await this.current;if(!this.wanted||epoch!==this.epoch||!this.ready)return;if(Number.isFinite(this.audio.duration)&&seconds>=this.audio.duration){this.wanted=false;return;}this.audio.currentTime=Math.max(0,seconds);await this.audio.play();}
 seek(seconds:number){if(!this.ready)return;const max=Number.isFinite(this.audio.duration)?this.audio.duration:seconds;this.audio.currentTime=Math.max(0,Math.min(seconds,max));if(this.text)this.positions.set(this.text,this.audio.currentTime);}
 pause(){this.wanted=false;this.audio.pause();this.playing=false;this.emit();}
 async resume(){this.wanted=true;const epoch=this.epoch;if(this.current)await this.current;if(!this.wanted||epoch!==this.epoch||!this.ready||this.audio.ended||this.audio.currentTime>=this.audio.duration-.03)return;await this.audio.play();}
 stop(){this.pause();this.epoch++;this.ready=false;this.loading=false;this.text='';this.current=null;this.audio.removeAttribute('src');this.emit();}
 dispose(){this.stop();(this.audio as HTMLAudioElement).remove?.();}
 get duration(){return Number.isFinite(this.audio.duration)?this.audio.duration:0;}
 get position(){return this.audio.currentTime;}
 get isReady(){return this.ready;}
 get isPlaying(){return this.playing;}
}

function appendMediaBuffer(sb: SourceBuffer, data: BufferSource): Promise<void> {
 return new Promise((resolve, reject) => {
  const done = () => { sb.removeEventListener('updateend', done); sb.removeEventListener('error', fail); resolve(); };
  const fail = () => { sb.removeEventListener('updateend', done); sb.removeEventListener('error', fail); reject(new Error('Audio append failed.')); };
  sb.addEventListener('updateend', done);
  sb.addEventListener('error', fail);
  try { sb.appendBuffer(data); }
  catch (error) { sb.removeEventListener('updateend', done); sb.removeEventListener('error', fail); reject(error); }
 });
}

/** Streams a fresh TTS answer into MediaSource and resolves on the first chunk. */
export class StreamingNarrationTransport {
 private audio: ClipMedia; private text = ''; private epoch = 0; private wanted = false;
 private ready = false; private loading = false; private playing = false;
 private current: Promise<void> | null = null; private controller: AbortController | null = null;
 private mediaSource: MediaSource | null = null; private objectUrl: string | null = null;
 constructor(private fetchStream: (text: string, signal: AbortSignal) => Promise<Response>, private notify: (state: VoiceState) => void,
  makeAudio: () => ClipMedia = () => { const audio = new Audio(); audio.hidden = true; audio.dataset.qweepsNarration = ''; document.body.append(audio); return audio; }) {
  this.audio = makeAudio(); this.audio.preload = 'auto';
  this.audio.onended = () => { this.wanted = false; this.playing = false; this.emit(); };
  this.audio.onpause = () => { this.playing = false; this.emit(); };
  this.audio.onplaying = () => { this.playing = true; this.emit(); };
 }
 private emit() { this.notify({ loading: this.loading, playing: this.playing, ready: this.ready }); }
 prepare(text: string): Promise<void> {
  if (this.text === text && this.current) return this.current;
  this.stop();
  this.text = text; const epoch = ++this.epoch; this.ready = false; this.loading = true; this.emit();
  this.controller = new AbortController();
  this.current = new Promise<void>((resolve, reject) => {
   const run = async () => {
    try {
     if (!('MediaSource' in window) || !MediaSource.isTypeSupported('audio/mpeg')) {
      const response = await this.fetchStream(text, this.controller!.signal);
      if (!response.ok) throw new Error(`Speech stream failed (${response.status}).`);
      const blob = await response.blob();
      if (epoch !== this.epoch) { resolve(); return; }
      this.objectUrl = URL.createObjectURL(blob);
      this.audio.src = this.objectUrl; this.audio.load();
      await new Promise<void>((ok, bad) => {
       const loaded = () => { this.audio.onloadedmetadata = null; ok(); };
       this.audio.onloadedmetadata = loaded;
       this.audio.onerror = () => bad(new Error('Audio could not be decoded.'));
       if (this.audio.readyState >= 1) loaded();
      });
      if (epoch !== this.epoch) { resolve(); return; }
      this.ready = true; this.loading = false; this.emit(); resolve();
      return;
     }
     const mediaSource = new MediaSource(); this.mediaSource = mediaSource;
     this.objectUrl = URL.createObjectURL(mediaSource);
     this.audio.src = this.objectUrl; this.audio.load();
     await new Promise<void>((ok) => mediaSource.addEventListener('sourceopen', () => ok(), { once: true }));
     if (epoch !== this.epoch) { resolve(); return; }
     const source = mediaSource.addSourceBuffer('audio/mpeg');
     const response = await this.fetchStream(text, this.controller!.signal);
     if (!response.ok || !response.body) throw new Error(`Speech stream failed (${response.status}).`);
     const reader = response.body.getReader();
     let first = true;
     while (true) {
      if (epoch !== this.epoch) { try { await reader.cancel(); } catch {} resolve(); return; }
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) {
       await appendMediaBuffer(source, value);
       if (epoch !== this.epoch) { resolve(); return; }
       if (first) { first = false; this.ready = true; this.loading = false; this.emit(); resolve(); }
      }
     }
     if (epoch === this.epoch && mediaSource.readyState === 'open') mediaSource.endOfStream();
    } catch (error) {
     if (epoch !== this.epoch) { resolve(); return; }
     this.loading = false; this.ready = false; this.emit(); reject(error);
    }
   };
   void run();
  }).catch((error) => { if (this.text === text) { this.loading = false; this.ready = false; this.emit(); } throw error; });
  return this.current;
 }
 async playFrom(seconds = 0) {
  this.wanted = true; const epoch = this.epoch;
  if (this.current) await this.current;
  if (!this.wanted || epoch !== this.epoch || !this.ready) return;
  if (Number.isFinite(this.audio.duration) && seconds >= this.audio.duration) { this.wanted = false; return; }
  this.audio.currentTime = Math.max(0, seconds);
  await this.audio.play();
 }
 pause() { this.wanted = false; this.audio.pause(); this.playing = false; this.emit(); }
 stop() {
  this.pause(); this.epoch++;
  try { this.controller?.abort(); } catch {}
  this.controller = null;
  try { this.mediaSource?.endOfStream(); } catch {}
  this.mediaSource = null;
  if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; }
  this.ready = false; this.loading = false; this.text = ''; this.current = null;
  this.audio.removeAttribute('src'); this.emit();
 }
 dispose() { this.stop(); (this.audio as HTMLAudioElement).remove?.(); }
 get duration() { return Number.isFinite(this.audio.duration) ? this.audio.duration : 0; }
 get position() { return this.audio.currentTime; }
 get isReady() { return this.ready; }
 get isPlaying() { return this.playing; }
}
