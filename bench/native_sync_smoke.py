#!/usr/bin/env python3
"""Exercise real native code generation, speech and alignment on a two-beat fixture.

This is a harness integration check, not a full planner/20-beat quality benchmark.
It writes an unpublished artifact; it never replaces a saved learner lesson.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import time
import uuid

from assistant.config import load_config
from assistant.llm import build_visual_llm
from assistant.visual.browser_lessons import BrowserLessonStore
from assistant.visual.native_author import assemble, generate_scene, native_cue_contract
from assistant.visual.narration import NarrationStore
from assistant.visual.native_review import capture_native_frames
from assistant.visual.synchronization import compile_speech


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--out',type=Path,required=True);parser.add_argument('--resume',action='store_true')
    args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True)
    cfg=load_config()
    if cfg.tts.provider!='openrouter':raise SystemExit('Configured narration is not enabled; no settings changed.')
    llm=build_visual_llm(cfg);narration=NarrationStore(cfg)
    store=BrowserLessonStore(llm,Path(__file__).resolve().parents[1]/'visual-studio',args.out/'store',narration=narration)
    beats=[
      {'id':'weights','title':'Normalize scores','question':'How do scores become weights that sum to one?',
       'insight':'Exponentiating scores ln(2),0,0 gives 2,1,1. Dividing by four gives .5,.25,.25.',
       'narration':'Start with three scores, log two, zero, and zero. Exponentiating them gives two, one, and one. Divide every result by their total of four. The weights become one half, one quarter, and one quarter, which sum to one.',
       'continuity':{'from':None,'bridge':'Start with three scores, log two, zero, and zero.'},
       'visibleOperation':'Show scores as numeric chips; transform into correctly proportional exp bars [2,1,1], then normalize into [.5,.25,.25] on a labelled common scale. Zero score is zero: do not draw a positive-height bar labelled zero.',
       'safeguard':'Weights sum to one; raw scores do not.',
       'presentation':{'method':'Worked normalization','why':'Follow the same three quantities through exponentiation and division.','visualEvidence':'The labelled quantities change consistently with the calculation.','textMode':'labels'},'layout':'diagram'},
      {'id':'mix','title':'Combine values','question':'How does a weighted sum make the context vector?',
       'insight':'.5(2,0)+.25(0,2)+.25(2,2)=(1.5,1).',
       'narration':'We now have normalized weights, so we can combine the value vectors. The three vectors are two zero, zero two, and two two. Scale them by one half, one quarter, and one quarter. Add these weighted vectors head to tail. The resulting context vector is one point five, one.',
       'continuity':{'from':'weights','bridge':'We now have normalized weights, so we can combine the value vectors.'},
       'visibleOperation':'Draw three labelled 2D value vectors on axes, scale by .5,.25,.25, then add the weighted displacements head-to-tail to (1.5,1). Keep labels separated and large.',
       'safeguard':'Attention weights are coefficients, not model parameter updates.',
       'presentation':{'method':'Vector addition','why':'Show why the weighted values produce this context.','visualEvidence':'The actual head-to-tail displacements end at (1.5,1).','textMode':'labels'},'layout':'diagram'}]
    story={'title':'Attention weights and context','question':'How does normalized attention combine value vectors?',
           'representation':'Track The, cat, sat as blue, green, gold; use a common numeric scale and actual 2D vector geometry.',
           'example':{'title':'One worked attention row','description':'An illustrative three-token calculation.'},'beats':beats,
           'nativeCuePlan':{b['id']:native_cue_contract(b) for b in beats}}
    (args.out/'storyboard.json').write_text(json.dumps(story,indent=2))
    scene_dir=args.out/'scene';scene_dir.mkdir(exist_ok=True)
    started=time.monotonic()
    if args.resume:
        candidate=json.loads((args.out/'visual-candidate.json').read_text())
        lesson_id=candidate['id']
        print('Reusing the actual generated scene; checking updated alignment harness',flush=True)
    else:
        print('Generating real native source',flush=True)
        manifest=generate_scene(llm,story,store._native_interpreter(),scene_dir)
        lesson_id=uuid.uuid4().hex;folder=store.folder/lesson_id;folder.mkdir()
        candidate=assemble(store._continuous_candidate(story,lesson_id,{b['id'] for b in beats}),story,manifest,[b['id'] for b in beats])
        candidate['storyboard']=story
        (args.out/'visual-candidate.json').write_text(json.dumps(candidate,indent=2))
    job={'id':lesson_id,'lessonId':lesson_id,'stage':'Speech check','native':True}
    print('Recording and measuring actual narration',flush=True)
    synced=compile_speech(store,job,candidate)
    (args.out/'synchronized-candidate.json').write_text(json.dumps(synced,indent=2))
    print('Capturing actual frames on the measured speech clock',flush=True)
    frames,labels=capture_native_frames(store.studio,synced)
    for frame,label in zip(frames,labels):
        (args.out/f"{label['chapter']+1}-{label['position']}.jpg").write_bytes(frame)
    receipt={'seconds':round(time.monotonic()-started,3),'audio':synced['audioTrack'],
             'chapters':[{k:c[k] for k in ('id','start','end','visualStart','visualEnd','nativeMap','narrationCues','nativeCueObjects')} for c in synced['chapters']],
             'frames':labels,'published':False,'teachingReview':'Pending manual inspection; successful sync is separate from teaching quality.'}
    (args.out/'receipt.json').write_text(json.dumps(receipt,indent=2));print('Integration check complete',flush=True)


if __name__=='__main__':main()
