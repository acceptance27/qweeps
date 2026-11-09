"""Cached Fish Audio clips; playback belongs to the client's resumable clock."""
from __future__ import annotations
import base64
import copy
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
        default_folder = (
            Path.home() / '.cache/qweeps/visual-narration'
            if (Path.home() / '.cache/qweeps/visual-narration').is_dir() or not (Path.home() / '.cache/omarchy-assistant/visual-narration').is_dir()
            else Path.home() / '.cache/omarchy-assistant/visual-narration'
        )
        self.cfg=cfg;self.folder=Path(folder or default_folder);self.lock=threading.Lock();self.locks={}
        self.rate_lock=threading.Lock();self.next_request=0;self.cooldown=0
        self.streams={}
    def signature(self):
        engine=build_tts(self.cfg)
        if not hasattr(engine,'_payload'):raise PlanError('Synchronized narration needs a configured Fish/OpenRouter speech provider.')
        return {'url':getattr(engine,'url',''),'model':getattr(engine,'model',''),'payload':engine._payload('')}
    def _request(self,engine,payload,on_wait=None,*,timeout=90):
        for attempt in range(3):
            while True:
                with self.rate_lock:
                    delay=max(self.next_request,self.cooldown)-time.monotonic()
                    if delay<=0:
                        limit=getattr(engine,'rate_limit',None)
                        if not isinstance(limit,(int,float)):limit=3.3 if 'free' in getattr(engine,'model','') else 0.0
                        self.next_request=time.monotonic()+limit
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
    def prepare_lesson_aligned(self,text,on_wait=None):
        """Synthesize a whole lesson and return (clip, alignment|None).

        Direct Fish streams audio and word timings together, so the separate
        local whisper pass can be skipped. Other providers return no alignment
        and the caller keeps its existing measurement path.
        """
        from ..tts import FishTTS
        engine=build_tts(self.cfg)
        if not isinstance(engine,FishTTS):return self.prepare_lesson(text,on_wait),None
        text=_text(text,'narration',24000)
        payload=engine._payload(text)
        key=hashlib.sha256(json.dumps({'url':engine.stream_url,'model':engine.model,'payload':payload},sort_keys=True).encode()).hexdigest()
        self.folder.mkdir(parents=True,exist_ok=True)
        with self.lock:lock=self.locks.setdefault(key,threading.Lock())
        target=self.folder/f'{key}.mp3';timing=self.folder/f'{key}.fish-alignment.json'
        with lock:
            if target.exists() and timing.exists():
                try:return {'url':f'/narration/{key}.mp3','cached':True,'key':key},json.loads(timing.read_text())
                except ValueError:pass
            audio_bytes,alignment=self._stream_fish(engine,payload,on_wait)
            if not audio_bytes or not alignment.get('words'):raise PlanError('Speech provider returned no usable audio or word timings')
            pending=target.with_suffix('.pending');pending.write_bytes(audio_bytes);pending.replace(target)
            pending_t=timing.with_suffix('.pending');pending_t.write_text(json.dumps(alignment));pending_t.replace(timing)
        return {'url':f'/narration/{key}.mp3','cached':True,'key':key},alignment
    def start_lesson_stream(self,text,on_wait=None):
        """Begin a direct Fish timestamp stream, writing mp3 as it arrives.

        Returns immediately with a cache key. Callers can serve the growing
        file at /narration-stream/<key>.mp3 while it renders.
        """
        from ..tts import FishTTS
        engine=build_tts(self.cfg)
        if not isinstance(engine,FishTTS):raise PlanError('Incremental narration needs direct Fish Audio.')
        text=_text(text,'narration',24000)
        payload=engine._payload(text)
        key=hashlib.sha256(json.dumps({'stream':engine.stream_url,'model':engine.model,'payload':payload},sort_keys=True).encode()).hexdigest()
        self.folder.mkdir(parents=True,exist_ok=True)
        status=self.folder/f'{key}.stream.json'
        with self.lock:
            if status.exists():
                try:
                    state=json.loads(status.read_text())
                    if state.get('complete') and (self.folder/f'{key}.mp3').exists() and (self.folder/f'{key}.fish-alignment.json').exists():
                        return key
                except ValueError:pass
            if key not in self.streams:
                self.streams[key]=True
                threading.Thread(target=self._stream_lesson_worker,args=(engine,payload,key),daemon=True).start()
        return key
    def _stream_lesson_worker(self,engine,payload,key):
        target=self.folder/f'{key}.mp3';status=self.folder/f'{key}.stream.json';timing=self.folder/f'{key}.fish-alignment.json'
        status.write_text(json.dumps({'complete':False,'bytes':0}))
        try:
            with target.open('wb') as fh:
                def sink(data):
                    fh.write(data);fh.flush()
                _,alignment=self._stream_fish(engine,payload,sink=sink)
            if not alignment.get('words'):raise PlanError('Speech stream returned no word timings')
            timing.write_text(json.dumps(alignment))
            status.write_text(json.dumps({'complete':True,'bytes':target.stat().st_size,'duration':alignment.get('duration')}))
        except Exception as exc:
            try:target.unlink(missing_ok=True)
            except OSError:pass
            status.write_text(json.dumps({'complete':False,'error':str(exc)[:300]}))
        finally:
            with self.lock:self.streams.pop(key,None)
    def lesson_stream_status(self,key):
        try:return json.loads((self.folder/f'{key}.stream.json').read_text())
        except (OSError,ValueError):return {'complete':False}
    def wait_lesson_stream(self,key,timeout=600):
        deadline=time.monotonic()+timeout
        while time.monotonic()<deadline:
            state=self.lesson_stream_status(key)
            if state.get('complete') or state.get('error'):return state
            time.sleep(.2)
        return {'complete':False,'error':'Speech stream timed out'}
    def lesson_stream_alignment(self,key):
        return json.loads((self.folder/f'{key}.fish-alignment.json').read_text())
    def _answer_engine(self):
        """Build the speech engine with the Ask-specific voice when configured."""
        cfg=copy.deepcopy(self.cfg)
        ask_voice=getattr(cfg.tts,'ask_voice','') or cfg.tts.voice
        cfg.tts.voice=ask_voice
        return build_tts(cfg)
    def _fish_chunks(self,engine,payload):
        import urllib.request
        req=urllib.request.Request(engine.stream_url,data=json.dumps(payload).encode(),method='POST',headers=engine._headers())
        try:
            with urllib.request.urlopen(req,timeout=300) as response:
                for raw in response:
                    line=raw.decode('utf-8','replace').strip()
                    if not line.startswith('data:'):continue
                    body_text=line[5:].strip()
                    if not body_text or body_text=='[DONE]':continue
                    try:event=json.loads(body_text)
                    except ValueError:continue
                    encoded=event.get('audio_base64')
                    if not encoded:continue
                    try:yield base64.b64decode(encoded)
                    except (ValueError,TypeError):continue
        except HTTPError as exc:
            raise PlanError(f'Speech provider could not stream the answer (HTTP {exc.status}).') from exc
    def answer_stream(self,text):
        """Yield mp3 chunks for one Ask QWEEPS answer.

        Direct Fish starts yielding as soon as its first audio chunk arrives and
        caches the completed clip. The browser can append chunks through
        MediaSource, so playback does not wait for the whole answer.
        """
        from ..tts import FishTTS
        text=_text(text,'answer narration',6000)
        engine=self._answer_engine()
        if not isinstance(engine,FishTTS):
            payload=engine._payload(text);payload['response_format']='mp3'
            key=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
            self.folder.mkdir(parents=True,exist_ok=True)
            with self.lock:lock=self.locks.setdefault(key,threading.Lock())
            target=self.folder/f'{key}.mp3'
            with lock:
                if not target.exists():
                    clip=self._request(engine,payload,timeout=90)
                    if not clip:raise PlanError('Speech provider returned no audio')
                    pending=target.with_suffix('.pending');pending.write_bytes(clip);pending.replace(target)
            yield target.read_bytes()
            return
        payload=engine._payload(text)
        key=hashlib.sha256(json.dumps({'stream':engine.stream_url,'model':engine.model,'payload':payload},sort_keys=True).encode()).hexdigest()
        self.folder.mkdir(parents=True,exist_ok=True)
        with self.lock:lock=self.locks.setdefault(key,threading.Lock())
        target=self.folder/f'{key}.mp3'
        with lock:
            if target.exists():
                yield target.read_bytes()
                return
            pending=target.with_suffix('.pending')
            try:
                with pending.open('wb') as fh:
                    for chunk in self._fish_chunks(engine,payload):
                        fh.write(chunk);fh.flush()
                        yield chunk
                pending.replace(target)
            finally:
                pending.unlink(missing_ok=True)
    def _stream_fish(self,engine,payload,on_wait=None,sink=None):
        import urllib.request
        body=json.dumps(payload).encode()
        req=urllib.request.Request(engine.stream_url,data=body,method='POST',headers=engine._headers())
        audio=[];chunks={}
        try:
            with urllib.request.urlopen(req,timeout=300) as response:
                for raw in response:
                    line=raw.decode('utf-8','replace').strip()
                    if not line.startswith('data:'):continue
                    body_text=line[5:].strip()
                    if not body_text or body_text=='[DONE]':continue
                    try:event=json.loads(body_text)
                    except ValueError:continue
                    encoded=event.get('audio_base64')
                    if encoded:
                        try:decoded=base64.b64decode(encoded)
                        except (ValueError,TypeError):continue
                        if sink is None:audio.append(decoded)
                        else:sink(decoded)
                    alignment=event.get('alignment')
                    if isinstance(alignment,dict):
                        offset=float(event.get('chunk_audio_offset_sec') or 0)
                        chunks[int(event.get('chunk_seq') or 0)]=(alignment,offset)
        except HTTPError as exc:
            raise PlanError(f'Speech provider could not prepare the narration (HTTP {exc.status}). Cached segments are preserved.') from exc
        words=[]
        for seq in sorted(chunks):
            alignment,offset=chunks[seq]
            for segment in alignment.get('segments') or []:
                if not isinstance(segment,dict) or not segment.get('text'):continue
                try:start=float(segment.get('start'));end=float(segment.get('end'))
                except (TypeError,ValueError):continue
                words.append({'text':str(segment['text']),'start':start+offset,'end':end+offset,'probability':1.0})
        if not words:
            # Some responses only carry a duration; the caller falls back to whisper.
            return b''.join(audio),{}
        return b''.join(audio),{'words':words,'duration':max(w['end'] for w in words)}
    def prepare(self,text,on_wait=None,*,max_chars=6000,timeout=90):
        from ..tts import FishTTS
        text=_text(text,'narration',max_chars)
        engine=build_tts(self.cfg)
        if isinstance(engine,FishTTS):
            payload=engine._payload(text)
            key=hashlib.sha256(json.dumps({'stream':engine.stream_url,'model':engine.model,'payload':payload},sort_keys=True).encode()).hexdigest()
            self.folder.mkdir(parents=True,exist_ok=True)
            with self.lock:lock=self.locks.setdefault(key,threading.Lock())
            target=self.folder/f'{key}.mp3'
            with lock:
                if not target.exists():
                    clip=b''.join(self._fish_chunks(engine,payload))
                    if not clip:raise PlanError('Speech provider returned no audio')
                    pending=target.with_suffix('.pending');pending.write_bytes(clip);pending.replace(target)
            return {'url':f'/narration/{key}.mp3','cached':True,'key':key}
        if not isinstance(engine,OpenRouterTTS):raise PlanError('Cached narration requires a configured Fish/OpenRouter speech provider.')
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
