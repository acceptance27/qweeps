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

# Delivery-only Fish markers. They shape the synthesized pause but carry no
# spoken words, so word counts, phrase matching and captions must ignore them.
# Deliberately narrow: content brackets such as citations are left alone.
_PAUSE_TAGS=re.compile(r'\[(?:long[ -]?pause|long[ -]?break|short pause|pause|break)\]',re.IGNORECASE)

_NUMBERS={
    'zero':'0','one':'1','two':'2','three':'3','four':'4','five':'5','six':'6',
    'seven':'7','eight':'8','nine':'9','ten':'10','eleven':'11','twelve':'12',
    'thirteen':'13','fourteen':'14','fifteen':'15','sixteen':'16','seventeen':'17',
    'eighteen':'18','nineteen':'19','twenty':'20','thirty':'30','forty':'40',
    'fifty':'50','sixty':'60','seventy':'70','eighty':'80','ninety':'90',
    'hundred':'100','thousand':'1000',
}

def tokens(text):
    text=_PAUSE_TAGS.sub(' ',text)
    text=''.join(c for c in unicodedata.normalize('NFKD',text.casefold()) if not unicodedata.combining(c))
    words=re.findall(r'[^\W_]+',text.replace("'",'').replace('’',''),re.UNICODE)
    words=[{'license':'licence','licenses':'licences','ordinance':'ordnance'}.get(word,word) for word in words]
    out=[]
    for index,word in enumerate(words):
        # Speech recognisers write "0.7"; narration often says "zero point seven".
        if word=='point' and 0<index<len(words)-1 and (
                words[index-1] in _NUMBERS or words[index-1].isdigit()) and (
                words[index+1] in _NUMBERS or words[index+1].isdigit()):
            continue
        out.append(_NUMBERS.get(word,word))
    return out

def phrase_range(script,phrase,occurrence=1):
    words,needle=tokens(script),tokens(phrase)
    if not needle or type(occurrence) is not int or occurrence<1:raise PlanError('Cue needs an exact spoken phrase and a positive occurrence')
    matches=[i for i in range(len(words)-len(needle)+1) if words[i:i+len(needle)]==needle]
    if occurrence>len(matches):raise PlanError(f'Cue phrase is absent from the narration: {phrase[:90]}')
    start=matches[occurrence-1];return start,start+len(needle)

def cue_objects(chapter):
    if chapter.get('renderer') == 'manimgl' and chapter.get('nativeCueObjects'):
        return chapter['nativeCueObjects']
    visual=chapter.get('visual') or {}
    nodes=visual.get('nodes') or []
    if visual.get('layout')=='architecture_flow':
        nodes=[*nodes,*[{'id':p['id'],'title':p['payload'],'body':'Transfer '+p['payload']+' along '+p['edgeId'],'phase':'transfer'} for p in visual.get('flow',{}).get('packets',[])]]
    return nodes


def validate_anchors(raw,chapters):
    if not isinstance(raw,dict) or not isinstance(raw.get('chapters'),list) or [c.get('id') for c in raw['chapters']]!=[c['id'] for c in chapters]:raise PlanError('Keep the actual chapter IDs and order')
    for item,c in zip(raw['chapters'],chapters):
        anchors=item.get('anchors');ids={n['id'] for n in cue_objects(c)}
        if not isinstance(anchors,list) or not 2<=len(anchors)<=30:raise PlanError('Give concise exact-phrase anchors for the scene')
        if not ids<={a.get('target') for a in anchors}:raise PlanError('Every object needs a spoken or explicitly grouped context anchor')
        if not {'context','takeaway'}<={a.get('target') for a in anchors}:raise PlanError('Anchor the introduction and takeaway too')
        for a in anchors:
            if a.get('target') not in ids|{'context','takeaway'} or not isinstance(a.get('phrase'),str):raise PlanError('Cue target must be a real scene object')
            if type(a.get('attention',True)) is not bool:raise PlanError('Cue attention must be boolean')
            phrase_range(c['narration'],a['phrase'],a.get('occurrence',1))
        if c.get('renderer') == 'manimgl' and c.get('nativeCueObjects'):
            positions = [min(phrase_range(c['narration'], a['phrase'], a.get('occurrence', 1))[0]
                             for a in anchors if a['target'] == obj['id']) for obj in cue_objects(c)]
            if any(right <= left for left, right in zip(positions, positions[1:])):
                raise PlanError('Native actions need distinct spoken anchors in the same order as the scene; no guessed cue timing.')
    return raw['chapters']

def detect_language(text):
    if not text:
        return 'en'
    words = set(tokens(text))
    tl_words = {'ang', 'mga', 'ng', 'sa', 'ay', 'na', 'si', 'ni', 'ito', 'natin', 'namin', 'hindi', 'kung', 'dahil', 'kaya', 'may', 'bilang', 'at'}
    es_words = {'el', 'la', 'los', 'las', 'de', 'del', 'en', 'un', 'una', 'por', 'con', 'para', 'es', 'son', 'como'}
    scores = {'tl': len(words & tl_words), 'es': len(words & es_words)}
    best = max(scores, key=scores.get)
    return best if scores[best] >= 3 else 'en'

def script_word_times(script,alignment,duration):
    reference=tokens(script);heard=[];timings=[];previous=0
    for w in alignment.get('words',[]):
        start,end=w.get('start'),w.get('end')
        if not isinstance(start,(float,int)) or not isinstance(end,(float,int)) or not math.isfinite(start+end) or not 0<=start<=end<=duration+.25 or start<previous-.05:raise PlanError('Speech alignment contains invalid word times')
        previous=start
        for token in tokens(w.get('text','')):heard.append(token);timings.append((start,min(duration,end)))
    matches={}
    blocks=difflib.SequenceMatcher(None,reference,heard,autojunk=False).get_matching_blocks()
    for block in blocks:
        for offset in range(block.size):matches[block.a+offset]=block.b+offset
    prev_a,prev_b=0,0
    for block in blocks:
        gap_a_start,gap_a_end=prev_a,block.a
        gap_b_start,gap_b_end=prev_b,block.b
        prev_a=block.a+block.size
        prev_b=block.b+block.size
        if gap_a_start<gap_a_end and gap_b_start<gap_b_end:
            sub_a=reference[gap_a_start:gap_a_end]
            sub_b=heard[gap_b_start:gap_b_end]
            ia,ib=0,0
            while ia<len(sub_a) and ib<len(sub_b):
                ra,hb=sub_a[ia],sub_b[ib]
                if ia+1<len(sub_a) and (sub_a[ia]+sub_a[ia+1]==hb or (len(hb)>=4 and difflib.SequenceMatcher(None,sub_a[ia]+sub_a[ia+1],hb).ratio()>=0.75)):
                    matches[gap_a_start+ia]=gap_b_start+ib;matches[gap_a_start+ia+1]=gap_b_start+ib;ia+=2;ib+=1;continue
                if ia+2<len(sub_a) and (sub_a[ia]+sub_a[ia+1]+sub_a[ia+2]==hb or (len(hb)>=6 and difflib.SequenceMatcher(None,sub_a[ia]+sub_a[ia+1]+sub_a[ia+2],hb).ratio()>=0.75)):
                    matches[gap_a_start+ia]=gap_b_start+ib;matches[gap_a_start+ia+1]=gap_b_start+ib;matches[gap_a_start+ia+2]=gap_b_start+ib;ia+=3;ib+=1;continue
                if ib+1<len(sub_b) and (ra==hb+sub_b[ib+1] or (len(ra)>=4 and difflib.SequenceMatcher(None,ra,hb+sub_b[ib+1]).ratio()>=0.75)):
                    matches[gap_a_start+ia]=gap_b_start+ib;ia+=1;ib+=2;continue
                sim=difflib.SequenceMatcher(None,ra,hb).ratio()
                if sim>=0.65 or (min(len(ra),len(hb))>=4 and (ra in hb or hb in ra)):
                    matches[gap_a_start+ia]=gap_b_start+ib;ia+=1;ib+=1;continue
                best_k=None
                for k in range(1,min(8,len(sub_b)-ib)):
                    hk=sub_b[ib+k];sim_k=difflib.SequenceMatcher(None,ra,hk).ratio()
                    if sim_k>=0.65 or (min(len(ra),len(hk))>=4 and (ra in hk or hk in ra)):
                        best_k=k;break
                if best_k is not None:
                    if ra.isdigit():matches[gap_a_start+ia]=gap_b_start+ib+best_k-1
                    ib+=best_k;matches[gap_a_start+ia]=gap_b_start+ib;ia+=1;ib+=1;continue
                if ra.isdigit():matches[gap_a_start+ia]=gap_b_start+ib;ia+=1;continue
                if len(sub_a)-ia>len(sub_b)-ib:ia+=1
                elif len(sub_b)-ib>len(sub_a)-ia:ib+=1
                else:ia+=1;ib+=1
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
        captions.append({'at':matched[0][0],'text':' '.join(_PAUSE_TAGS.sub(' ',sentence).split())})
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
        lang=clip.get('language') or detect_language(clip.get('text',''))
        prompt=clip.get('prompt') or ''
        sig=ENGINE if lang=='en' and not prompt else f"{ENGINE}:{lang}:{prompt[:100]}"
        key=hashlib.sha256(audio.read_bytes()+sig.encode()).hexdigest();output=narration.folder/(key+'.words.json');outputs.append(output)
        if not output.exists():pending.append({'audio':str(audio),'output':str(output),'language':lang,'prompt':prompt})
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
