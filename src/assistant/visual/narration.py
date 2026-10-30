"""Cached Fish Audio clips; playback belongs to the client's resumable clock."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import threading
import time
from ..http import post_raw,HTTPError
from ..tts import build_tts,OpenRouterTTS
from .plan import PlanError,_text


class NarrationStore:
    def __init__(self,cfg,folder=None):
        default_folder=Path.home()/'.cache/qweeps/visual-narration' if not (Path.home()/'.cache/omarchy-assistant/visual-narration').is_dir() else Path.home()/'.cache/omarchy-assistant/visual-narration'
        self.cfg=cfg;self.folder=Path(folder or default_folder);self.lock=threading.Lock();self.locks={}
        self.rate_lock=threading.Lock();self.next_request=0;self.cooldown=0
    def signature(self):
        engine=build_tts(self.cfg)
        if not isinstance(engine,OpenRouterTTS):raise PlanError('Synchronized narration needs Fish/OpenRouter speech.')
        return {'url':engine.url,'payload':engine._payload('')}
    def _request(self,engine,payload,on_wait=None,*,timeout=90):
        for attempt in range(3):
            while True:
                with self.rate_lock:
                    delay=max(self.next_request,self.cooldown)-time.monotonic()
                    if delay<=0:
                        self.next_request=time.monotonic()+(3.3 if 'free' in engine.model else 0)
                        break
                if on_wait and delay>5:on_wait(delay)
                time.sleep(min(delay,60))
            try:return post_raw(engine.url,payload,headers=engine._headers(),timeout=timeout,retries=0)
            except HTTPError as exc:
                try:error=json.loads(exc.body).get('error',{});metadata=error.get('metadata',{})
                except (ValueError,AttributeError):error={};metadata={}
                per_minute=metadata.get('limit_source')=='openrouter_free_tier_per_minute' or 'per-min' in str(error.get('message',''))
                if exc.status!=429 or not per_minute or attempt==2:
                    raise PlanError(f'Speech provider could not prepare the narration (HTTP {exc.status}). Cached segments are preserved.') from exc
                try:delay=float(metadata.get('headers',{}).get('X-RateLimit-Reset'))/1000-time.time()+1
                except (ValueError,TypeError):delay=60
                with self.rate_lock:self.cooldown=max(self.cooldown,time.monotonic()+min(120,max(1,delay)))
        raise PlanError('Speech preparation stopped after its bounded retries.')
    def prepare_lesson(self,text,on_wait=None):
        return self.prepare(text,on_wait,max_chars=24000,timeout=300)
    def prepare(self,text,on_wait=None,*,max_chars=6000,timeout=90):
        text=_text(text,'narration',max_chars)
        engine=build_tts(self.cfg)
        if not isinstance(engine,OpenRouterTTS):raise PlanError('Cached narration requires the configured Fish/OpenRouter speech provider.')
        payload=engine._payload(text);payload['response_format']='mp3'
        key=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
        self.folder.mkdir(parents=True,exist_ok=True)
        with self.lock:lock=self.locks.setdefault(key,threading.Lock())
        target=self.folder/f'{key}.mp3'
        with lock:
            if not target.exists():
                clip=self._request(engine,payload,on_wait,timeout=timeout)
                if not clip:raise PlanError('Speech provider returned no audio')
                pending=target.with_suffix('.pending');pending.write_bytes(clip);pending.replace(target)
        return {'url':f'/narration/{key}.mp3','cached':True,'key':key}
