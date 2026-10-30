"""Export numeric timing/usage aggregates from this task's local session log.

Never copies prompts, reasoning, tool commands, account data or provider keys.
Tool jobs are dispatch-to-completion-detection bounds, not CPU/LLM-only timings.
"""
from pathlib import Path
import argparse
from datetime import datetime, timezone
import json
import re

LABELS=[('initial_build','Initial interactive engine'),('animation_repair','Restore teaching progression'),('capacity_retry','Model capacity retry'),('teaching_harness','Teaching skill and harness'),('five_examples','Five authored lessons'),('infographic_revision','Infographic revision')]
FIELDS=['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens','reasoning_output_tokens']

def stamp(value):
    return datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()

def start_time(row):
    p=row.get('payload',{})
    return p.get('internal_chat_message_metadata_passthrough',{}).get('create_time') or stamp(row['timestamp'])

def output_values(payload):
    raw=payload.get('output',[])
    if not isinstance(raw,list): raw=[{'text':str(raw)}]
    found=[]
    for block in raw:
        try: value=json.loads(block.get('text',''))
        except (ValueError,AttributeError): continue
        if isinstance(value,dict) and value.get('status')=='fulfilled': value=value.get('value',{})
        if isinstance(value,dict) and ('exit_code' in value or 'session_id' in value): found.append(value)
    return found

def operations(code):
    out=[]
    for m in re.finditer(r'tools\.(exec_command|write_stdin)\(\s*\{',code):
        # Read just the first arguments. Command strings are JSON quoted in this log.
        tail=code[m.end():]
        if m[1]=='exec_command':
            cmd=re.match(r'\s*["\']?cmd["\']?\s*:\s*',tail)
            if not cmd: out.append(('other',None));continue
            try: text,_=json.JSONDecoder().raw_decode(tail[cmd.end():])
            except ValueError: out.append(('other',None));continue
            if not isinstance(text,str):out.append(('other',None));continue
            # Only a category is retained, never the raw command.
            category='audio' if 'build_examples.py --audio' in text else 'render' if ('-m manim' in text or 'scripts/render_review.py --source' in text) else 'verification' if ('pytest' in text or 'npm test' in text or 'verify_examples.py' in text or 'npm run lint' in text) else 'build' if 'npm run build' in text else 'other'
            out.append((category,None))
        else:
            sid=re.search(r'session_id\s*:\s*(\d+)',tail[:250])
            out.append(('poll',int(sid[1]) if sid else None))
    return out

def build(path,cutoff):
    rows=[]
    with path.open() as f:
        for line in f:
            r=json.loads(line)
            if stamp(r['timestamp'])<cutoff:rows.append(r)
    turns=[]; byid={};calls={};jobs={};requests=[]; model='gpt-6.1-sol'
    for row in rows:
        p=row.get('payload',{});kind=row.get('type');when=stamp(row['timestamp'])
        if kind=='event_msg' and p.get('type')=='task_started':
            if turns and 'end' not in turns[-1]:turns[-1].update(end=when,status='interrupted; end bounded by next turn start')
            key,label=LABELS[len(turns)] if len(turns)<len(LABELS) else (f'turn_{len(turns)+1}','Additional work')
            turn={'id':key,'label':label,'start':when,'status':'incomplete','usage':{k:0 for k in FIELDS},'requests':0}
            turns.append(turn);byid[p['turn_id']]=turn
        elif kind=='event_msg' and p.get('type')=='task_complete' and p.get('turn_id') in byid:
            t=byid[p['turn_id']];t.update(end=when,status='ended with '+p['error']['codex_error_info'] if p.get('error') else 'complete')
        elif kind=='turn_context':model=p.get('model',model)
        elif kind=='token_usage_record' and p.get('turn_id') in byid:
            t=byid[p['turn_id']];u={k:p['usage'].get(k,0) for k in FIELDS}
            assert 0<=u['cached_input_tokens']<=u['input_tokens']
            for k in FIELDS:t['usage'][k]+=u[k]
            t['requests']+=1
            requests.append({'scope':t['id'],'time':when,'model':model,**u})
        elif kind=='response_item' and p.get('type') in ['custom_tool_call','function_call']:
            code=p.get('input',p.get('arguments',''))
            calls[p['call_id']]={'start':start_time(row),'scope':turns[-1]['id'] if turns else None,'ops':operations(code)}
        elif kind=='response_item' and p.get('type') in ['custom_tool_call_output','function_call_output'] and p.get('call_id') in calls:
            call=calls[p['call_id']];values=output_values(p)
            if len(values)!=len(call['ops']): continue # Do not guess ambiguous batched results.
            for (category,sid),value in zip(call['ops'],values):
                if category=='poll':
                    if sid in jobs and 'exit_code' in value:
                        jobs[sid].update(end=when,status='completed' if value['exit_code']==0 else 'failed',exit_code=value['exit_code'])
                elif category in ['audio','render','verification','build']:
                    job={'category':category,'scope':call['scope'],'start':call['start'],'basis':'dispatch to completion detection; includes process startup and polling delay'}
                    if 'session_id' in value:
                        job['status']='completion not recorded';jobs[value['session_id']]=job
                    else:
                        job.update(end=when,status='completed' if value.get('exit_code')==0 else 'failed',exit_code=value.get('exit_code'));jobs[f"direct-{len(jobs)}"]=job
    for turn in turns:
        if 'end' in turn:turn['seconds']=round(turn['end']-turn['start'],3)
    return {'schema':1,'title':'Where the time went: making a visual lesson','captured_at':datetime.fromtimestamp(cutoff,timezone.utc).isoformat(),'scope_note':'Completed Manim work before this profiling lesson. The current lesson is excluded to avoid a moving, self-referential total.',
      'provenance':{'usage':'One token_usage_record per model response; cumulative token_count events are not added again.','timing':'Task lifecycle timestamps. Tool job intervals are detection bounds, can overlap, and must not be summed as elapsed authoring time.','privacy':'Numeric aggregates only; no prompts, reasoning, tool commands, credentials or account identifiers are exported.'},
      'rates':{'model':'gpt-6.1-sol','input':2,'cached':.10,'write':2.50,'output':10,'long_threshold':272000,'long_input_multiplier':2,'long_output_multiplier':1.5,'unit':'USD per million tokens','as_of':'2026-10-27','source':'https://developers.openai.com/api/docs/models/gpt-6.1-sol','basis':'Hypothetical Go token-value cost using published GPT-6.1 Sol Standard API rates. Not an actual charge or official Go allowance tariff. Cache-write tokens are zero in the observed log. Reasoning output is included in output, not charged twice.'},
      'sources':[{'title':'GPT-6.1 Sol pricing and long-context rule','url':'https://developers.openai.com/api/docs/models/gpt-6.1-sol'},{'title':'OpenCode Go allowance accounting','url':'https://opencode.ai/v2/docs/console/go/'}],
      'turns':turns,'requests':requests,'jobs':sorted(jobs.values(),key=lambda j:j['start'])}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--session',type=Path,required=True);p.add_argument('--cutoff',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    report=build(a.session,stamp(a.cutoff));a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2))
    print('Exported',len(report['turns']),'turns,',len(report['requests']),'response usage records,',len(report['jobs']),'tool intervals; no conversation content.')
