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
 pause(){this.wanted=false;this.audio.pause();this.playing=false;this.emit();}
 async resume(){this.wanted=true;const epoch=this.epoch;if(this.current)await this.current;if(!this.wanted||epoch!==this.epoch||!this.ready||this.audio.ended||this.audio.currentTime>=this.audio.duration-.03)return;await this.audio.play();}
 stop(){this.pause();this.epoch++;this.ready=false;this.loading=false;this.text='';this.current=null;this.audio.removeAttribute('src');this.emit();}
 dispose(){this.stop();(this.audio as HTMLAudioElement).remove?.();}
 get position(){return this.audio.currentTime;}
 get isReady(){return this.ready;}
 get isPlaying(){return this.playing;}
}
