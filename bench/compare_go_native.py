#!/usr/bin/env python3
"""Bounded, identical-task Go code-generation comparison with actual native audits."""
from __future__ import annotations
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
from pathlib import Path
import time
import uuid

from assistant.config import load_config
from assistant.http import post_json
from assistant.opencode_llm import OpenCodeLLM
from assistant.visual.native_author import clean_code, compile_source

TASK = '''Write a complete Manim Community Edition Python file, from manim import *, class GenScene(Scene).
This runs in QWEEPS' actual native runtime. Return Python only; no tools or external files.
Use Text for numeric/equation labels; no MathTex, LaTeX, images or network. All geometry stays inside
x=[-6,6], y=[-3,3]. Text font_size >=26. Dark background #071117. No duplicate scene title.
Teach ONE worked example in exactly two beats, in this order:
1. self.beat("weights", "Scores become normalized weights")
Show three named score bars for The, cat, sat. Their scores are ln(2), 0, 0.
Show exp(scores) = [2,1,1], their sum 4, then visibly normalize the same bars to
weights [0.50,0.25,0.25]. Label each quantity and show sum(weights)=1.
The geometry, not just a new formula label, must demonstrate normalization.
2. self.beat("mix", "A weighted sum creates context")
Retain the same token names, colors and normalized weights. Use explicitly labelled
2D value vectors: V_The=(2,0), V_cat=(0,2), V_sat=(2,2). Visibly scale by the weights,
then add head to tail: (1,0)+(0,0.5)+(0.5,0.5)=(1.5,1). Show and label that resultant.
Use a coordinate frame or clear vector geometry so a viewer can see why the result is (1.5,1).
Do not imply vectors are scalar heights or that attention changes fixed model weights.
Runtime supplies self.beat and self.cue; never define them. Call self.cue("normalized") when
normalization matters and self.cue("context") at the resulting vector.
Each beat must last at least 8 seconds including >=2 seconds of settled reading time.
Use explicit run_time for self.play and self.wait as needed. Total 16-26 seconds.
Keep this concise (roughly 60-130 lines) without sacrificing the visible calculation or labels.'''
SYSTEM = 'You author accurate, readable mathematical teaching animations. Return only the requested Python source.'
MODELS = ['muse-spark-1.3-contributor', 'mimo-v2.6-flash', 'deepseek-v4.1-flash', 'qwen3.8-flash', 'glm-5.3-flash']


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--repeats',type=int,default=2)
    args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True)
    cfg=load_config();client=OpenCodeLLM(cfg,provider='opencode-go');key=client._go_api_key()
    if not key: raise SystemExit('No configured OpenCode Go key; no requests sent.')
    interpreter=Path.home()/'.local/share/qweeps/visual-venv/bin/python'
    (args.out/'task.txt').write_text(SYSTEM+'\n\n'+TASK)
    cases=[(model,repeat) for repeat in range(args.repeats) for model in MODELS]

    def request(case):
        model,repeat=case;folder=args.out/f'{model}-{repeat+1}';folder.mkdir(exist_ok=True)
        started=time.monotonic();record={'model':model,'repeat':repeat+1,'reasoning':'low',
            'startedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'taskSha256':hashlib.sha256(TASK.encode()).hexdigest()}
        try:
            data=post_json('https://opencode.ai/inference/go/openai/v1/chat/completions',
                {'model':model,'messages':[{'role':'system','content':SYSTEM},{'role':'user','content':TASK}],
                 'max_tokens':4096,'temperature':.2,'reasoning_effort':'low'},
                headers={'Authorization':f'Bearer {key}','User-Agent':'qweeps-model-bench/0.2',
                         'x-opencode-session':uuid.uuid4().hex},timeout=100,retries=0)
            record['requestSeconds']=round(time.monotonic()-started,3)
            choice=(data.get('choices') or [{}])[0];content=(choice.get('message') or {}).get('content') or ''
            record.update(usage=data.get('usage'),allowance=data.get('opencode'),finishReason=choice.get('finish_reason'),
                          outputChars=len(content),ok=bool(content) and choice.get('finish_reason')=='stop')
            (folder/'response.txt').write_text(content)
            if record['ok']:
                source=clean_code(content);(folder/'scene.py').write_text(source)
                record['sourceSha256']=hashlib.sha256(source.encode()).hexdigest()
        except Exception as exc:
            # HTTPError only includes provider errors, never authorization headers.
            record.update(ok=False,error=str(exc)[:500],requestSeconds=round(time.monotonic()-started,3))
        (folder/'request.json').write_text(json.dumps(record,indent=2))
        print(json.dumps({k:record.get(k) for k in ['model','repeat','requestSeconds','ok','finishReason','error']}),flush=True)
        return folder,record

    results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures=[pool.submit(request,case) for case in cases]
        for future in concurrent.futures.as_completed(futures):
            folder,record=future.result()
            if record['ok']:
                started=time.monotonic()
                try:
                    compiled=compile_source(str(interpreter),folder/'scene.py',folder)
                    beats=compiled.get('beats') or []
                    record.update(compileOk=True,audit=compiled.get('audit') or [],duration=compiled.get('duration'),
                        beats=beats,mechanicalPass=not compiled.get('audit') and [b['id'] for b in beats]==['weights','mix']
                            and all(b['end']-b['start']>=7.9 for b in beats))
                except Exception as exc:record.update(compileOk=False,mechanicalPass=False,compileError=str(exc)[-800:])
                record['compileSeconds']=round(time.monotonic()-started,3)
            results.append(record);(folder/'result.json').write_text(json.dumps(record,indent=2))
            (args.out/'results.json').write_text(json.dumps({'task':'Two-beat native attention explanation',
                'caveats':['Small task, two repeats; not a universal model ranking.',
                           'Mechanical pass is separate from visual/mathematical teaching review.',
                           'No account settings were modified; no fallback or automatic retry.'], 'runs':results},indent=2))
    print('Complete',flush=True)


if __name__=='__main__':main()
