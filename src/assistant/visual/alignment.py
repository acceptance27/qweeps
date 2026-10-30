"""Match exact script phrases to locally measured speech word timestamps."""
from __future__ import annotations
import difflib
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unicodedata

from ..llm import _process_lines
from .plan import PlanError

ENGINE='faster-whisper-small-int8-word-timestamps-v1'

def tokens(text):
    text=''.join(c for c in unicodedata.normalize('NFKD',text.casefold()) if not unicodedata.combining(c))
    words=re.findall(r'[^\W_]+',text.replace("'",'').replace('’',''),re.UNICODE)
    return [{'license':'licence','licenses':'licences','ordinance':'ordnance'}.get(word,word) for word in words]

def phrase_range(script,phrase,occurrence=1):
    words,needle=tokens(script),tokens(phrase)
    if not needle or type(occurrence) is not int or occurrence<1:raise PlanError('Cue needs an exact spoken phrase and a positive occurrence')
    matches=[i for i in range(len(words)-len(needle)+1) if words[i:i+len(needle)]==needle]
    if occurrence>len(matches):raise PlanError(f'Cue phrase is absent from the narration: {phrase[:90]}')
    start=matches[occurrence-1];return start,start+len(needle)

def validate_anchors(raw,chapters):
    if not isinstance(raw,dict) or not isinstance(raw.get('chapters'),list) or [c.get('id') for c in raw['chapters']]!=[c['id'] for c in chapters]:raise PlanError('Keep the actual chapter IDs and order')
    for item,c in zip(raw['chapters'],chapters):
        anchors=item.get('anchors');ids={n['id'] for n in c['visual']['nodes']}
        if not isinstance(anchors,list) or not 2<=len(anchors)<=30:raise PlanError('Give concise exact-phrase anchors for the scene')
        if not ids<={a.get('target') for a in anchors}:raise PlanError('Every object needs a spoken or explicitly grouped context anchor')
        if not {'context','takeaway'}<={a.get('target') for a in anchors}:raise PlanError('Anchor the introduction and takeaway too')
        for a in anchors:
            if a.get('target') not in ids|{'context','takeaway'} or not isinstance(a.get('phrase'),str):raise PlanError('Cue target must be a real scene object')
            if type(a.get('attention',True)) is not bool:raise PlanError('Cue attention must be boolean')
            phrase_range(c['narration'],a['phrase'],a.get('occurrence',1))
    return raw['chapters']

def script_word_times(script,alignment,duration):
    reference=tokens(script);heard=[];timings=[];previous=0
    for w in alignment.get('words',[]):
        start,end=w.get('start'),w.get('end')
        if not isinstance(start,(float,int)) or not isinstance(end,(float,int)) or not math.isfinite(start+end) or not 0<=start<=end<=duration+.25 or start<previous-.05:raise PlanError('Speech alignment contains invalid word times')
        previous=start
        for token in tokens(w.get('text','')):heard.append(token);timings.append((start,min(duration,end)))
    matches={}
    for block in difflib.SequenceMatcher(None,reference,heard,autojunk=False).get_matching_blocks():
        for offset in range(block.size):matches[block.a+offset]=block.b+offset
    coverage=len(matches)/max(1,len(reference))
    if coverage<.8:raise PlanError(f'The recording does not match its narration closely enough ({coverage:.0%}); no guessed cue times were published.')
    return [timings[matches[i]] if i in matches else None for i in range(len(reference))],coverage

def measured_cues(script,anchors,alignment,duration):
    times,coverage=script_word_times(script,alignment,duration)
    events=[]
    for a in anchors:
        lo,hi=phrase_range(script,a['phrase'],a.get('occurrence',1));mapped=[times[i] for i in range(lo,hi) if times[i] is not None]
        if len(mapped)<max(1,math.ceil((hi-lo)*.5)):raise PlanError(f'Could not locate the spoken cue: {a["phrase"][:90]}')
        start=mapped[0][0];cursor=0;caption=script
        for sentence in re.split(r'(?<=[.!?])\s+',script):
            count=len(tokens(sentence))
            if cursor<=lo<cursor+count:caption=sentence;break
            cursor+=count
        events.append({'target':a['target'],'start':start,'text':caption,'phrase':a['phrase'],'attention':a.get('attention',True)})
    events.sort(key=lambda e:e['start']);starts=sorted({e['start'] for e in events})
    for e in events:e['end']=next((s for s in starts if s>e['start']+.001),duration)
    return events,coverage

def spoken_sentence_cues(script,alignment,duration):
    times,_=script_word_times(script,alignment,duration);cursor=0;captions=[]
    for sentence in re.split(r'(?<=[.!?])\s+',script):
        count=len(tokens(sentence));matched=[t for t in times[cursor:cursor+count] if t is not None];cursor+=count
        if not count:continue
        if not matched:raise PlanError('Could not measure a spoken sentence; no guessed caption timing was published.')
        captions.append({'at':matched[0][0],'text':sentence})
    return captions

def runtime():
    candidates=[Path(os.environ['QWEEPS_ALIGNMENT_PYTHON'])] if os.environ.get('QWEEPS_ALIGNMENT_PYTHON') else []
    if importlib.util.find_spec('faster_whisper'):candidates.append(Path(sys.executable))
    candidates.append(Path.home()/'.local/share/uv/tools/wyoming-faster-whisper/bin/python')
    python=next((p for p in candidates if p.is_file()),None)
    roots=[Path.home()/'.local/share/wyoming-whisper',Path.home()/'.cache/huggingface/hub']
    paths=[Path(os.environ['QWEEPS_ALIGNMENT_MODEL'])] if os.environ.get('QWEEPS_ALIGNMENT_MODEL') else [p for root in roots for p in (root/'models--Systran--faster-whisper-small/snapshots').glob('*')]
    model=next((p for p in paths if (p/'model.bin').is_file() and (p/'tokenizer.json').is_file()),None)
    if not python or not model:raise PlanError('Continuous narration needs a local faster-whisper runtime and cached model. Configure QWEEPS_ALIGNMENT_PYTHON and QWEEPS_ALIGNMENT_MODEL.')
    return python,model

def align_recordings(narration,clips,progress,*,timeout=None):
    outputs=[];pending=[]
    for clip in clips:
        audio=narration.folder/(clip['key']+'.mp3')
        key=hashlib.sha256(audio.read_bytes()+ENGINE.encode()).hexdigest();output=narration.folder/(key+'.words.json');outputs.append(output)
        if not output.exists():pending.append({'audio':str(audio),'output':str(output)})
    if pending:
        python,model=runtime()
        with tempfile.TemporaryDirectory(prefix='qweeps-word-alignment-') as folder:
            batch=Path(folder)/'batch.json';batch.write_text(json.dumps(pending))
            proc=subprocess.Popen([str(python),str(Path(__file__).with_name('alignment_worker.py')),'--model',str(model),'--batch',str(batch)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            try:
                for line in _process_lines(proc,timeout or max(180,45*len(pending))):
                    try:event=json.loads(line)
                    except ValueError:continue
                    progress(f'Aligning narration recording {event.get("completed",0)} of {len(pending)} locally')
                if proc.wait(timeout=5):raise PlanError('Local speech alignment did not complete; existing lesson preserved.')
            except TimeoutError as exc:raise PlanError('Local speech alignment timed out; cached recordings are preserved.') from exc
            finally:
                if proc.poll() is None:
                    proc.terminate()
                    try:proc.wait(timeout=2)
                    except subprocess.TimeoutExpired:proc.kill();proc.wait(timeout=2)
    return [json.loads(p.read_text()) for p in outputs]
