#!/usr/bin/env python3
"""Convert the user's exported prototype data into the QWEEPS lesson contract.

Input is reference-data.json exported from its data modules, never executable code.
No coordinates, placeholder Q&A responses, app credentials or image assets are copied.
"""
from __future__ import annotations

import argparse
import copy
import json
import math
import re
from pathlib import Path

from assistant.visual.architecture_flow import validate_architecture
from assistant.visual.browser_lessons import validate_lesson

COLORS = {'sky':'blue','amber':'gold','emerald':'green','teal':'green','rose':'coral','violet':'purple','mint':'green'}


def convert(source):
    source=copy.deepcopy(source)
    # Preserve the worked pooling table, but correct its claimed vector length:
    # the supplied raw vector has norm ~1.8891, not 2.0.
    old=[.12,-.44,.08,.71,-.21,.36]
    raw=[.24,-.88,.16,1.42,-.42,.72]
    norm=math.sqrt(sum(v*v for v in raw))
    unit=[round(v/norm,4) for v in raw]
    replacements={f'{abs(a):.2f}':f'{abs(b):.4f}' for a,b in zip(old,unit)}
    def correct(value):
        if isinstance(value,list):
            if value==old:return unit[:]
            return [correct(item) for item in value]
        if isinstance(value,dict):return {key:correct(item) for key,item in value.items()}
        if isinstance(value,str):
            for before,after in replacements.items():
                value=re.sub(r'(?<![\d.])'+re.escape(before)+r'(?!\d)',after,value)
            value=re.sub(r'(?<![\d.])2\.00?(?!\d)','1.8891',value)
            value=value.replace('@@','@').replace('✕ drop नीचे','✕ drop')
            value=value.replace('Length: 40 chars','Length: 39 chars').replace('a clickable [refund-policy] proof link','the [refund-policy] evidence reference').replace('Clicking [refund-policy] verifies','Comparing the [refund-policy] passage verifies').replace('Click [refund-policy] anywhere in the app to inspect the source passage','Inspect the answer and its connected source passage').replace('(click citation to inspect)','(inspect the connected source)').replace('Click \"Inspect Function ↘\"','Choose \"Enter function\"')
            return value
        return value
    source=correct(source)
    tokenizer=source['functions']['emb-tokenize']
    for node in tokenizer['graph']['nodes']:
        visual=node.get('customVisual',{})
        if node['id']=='tok-tiles':
            visual.update(title='Split the actual input into words and punctuation',
                tiles=[{'text':word,'subtext':f'piece {i+1}','color':'sky'} for i,word in enumerate(['How','long','do','I','have','to','request','a','refund','?'])])
        elif node['id']=='tok-filter':
            visual.update(title='Apply the explicit toy cleanup rules',rows=[
                {'leftChip':'How','rightValue':'how','note':'lowercase'},
                {'leftChip':'do / I / have','rightValue':'drop','note':'toy stopwords'},
                {'leftChip':'to / a','rightValue':'drop','note':'toy stopwords'},
                {'leftChip':'refund','rightValue':'refund','note':'keep'},
                {'leftChip':'?','rightValue':'drop','note':'punctuation'}])
        elif node['id']=='tok-drop':
            visual.update(title='Dropped: do, I, have, to, a, ?',subtitle='Explicit toy stopword and punctuation rules; not a production LLM tokenizer.')
    tokenizer['steps'][1]['narration']+=' This toy example also removes the explicitly listed stopwords do, I, have, to, and a. Production language-model tokenizers use different rules.'
    for node in source['functions']['fn-embed']['graph']['nodes']:
        if node['id']=='emb-rules' and node.get('staticData'):
            node['staticData']['entries'].append({'key':'toy_stopwords','value':'do, I, have, to, a'})
    for step in source['functions']['ret-scorer']['steps']:
        step['narration']+=' These are prepared illustrative scores; document vectors and a live similarity calculation are not supplied.'
    source['functions']['fn-embed']['graph']['nodes'][2]['nonSummary']['goalText']+=' This toy cleanup also drops the listed stopwords do, I, have, to, and a.'
    functions = source['functions']

    def module(raw_graph, raw_steps, code_lines, default_file, current=None):
        files={default_file: {line['lineNumber']: copy.deepcopy(line) for line in code_lines}}
        for file in files.values():
            for line in file.values():
                if line.get('drillDownFunctionId') not in functions or line.get('drillDownFunctionId')==current:
                    line.pop('drillDownFunctionId',None)

        def reference(ref, explanation=''):
            file=ref.get('file',default_file);numbers=ref.get('lines') or [1]
            rows=files.setdefault(file,{})
            snippet=ref.get('snippet','').splitlines()
            for i,n in enumerate(numbers):
                rows.setdefault(n,{'lineNumber':n,'text':snippet[i] if i<len(snippet) else '# '+explanation,
                                   'explanation':explanation})
            return {'file':file,'lines':numbers}

        nodes=[]
        for n in raw_graph['nodes']:
            node={k:copy.deepcopy(n[k]) for k in ('id','label','kind','description','defaultPreview')}
            node['label']=node['label'][:65]
            node['color']=COLORS.get(n.get('accentColor'),'blue')
            node['codeReference']=reference(n['codeReference'],n['label'])
            if n.get('drillDownFunctionId') in functions and n['drillDownFunctionId']!=current:
                node['drillDownFunctionId']=n['drillDownFunctionId']
            if n.get('customVisual'):
                node['visual']=copy.deepcopy(n['customVisual'])
                for key in ('rows','tiles'):
                    for row in node['visual'].get(key,[]):
                        if row.get('color'):row['color']=COLORS.get(row['color'],row['color'])
            elif n.get('staticData'):
                node['visual']={'variant':'paper-card','title':n['staticData']['header'],
                    'lines':[row['key']+': '+row['value'] for row in n['staticData']['entries']]}
            elif n.get('nonSummary'):
                spec=n['nonSummary'];node['visual']={'variant':'blueprint-slots','title':spec['blockTitle'],
                    'lines':['@'+row['name'].lstrip('@')+': '+row['value'] for row in spec['inputs']]+
                        ['Goal: '+spec['goalText'],'@'+spec['outputLabel'].lstrip('@')+': '+spec['outputValue']]}
            nodes.append(node)
        graph={'id':raw_graph['id'],'title':raw_graph['title'],'nodes':nodes,
               'edges':[{k:copy.deepcopy(e.get(k,'')) for k in ('id','source','target','label','relationship','description')} for e in raw_graph['edges']]}
        steps=[]
        for i,s in enumerate(raw_steps):
            duration=round(max(6,s['duration'],len(s['narration'].split())/2.2+3),2)
            scale=duration/s['duration']
            flow={k:copy.deepcopy(s.get(k,{})) for k in ('stateBefore','stateAfter','nodeDataBefore','nodeDataAfter')}
            flow.update(focusNodes=s['focusNodes'],activeEdges=s['activeEdges'],code=reference(s['code'],s['title']),
                        packets=[{**p,'start':round(p['start']*scale,3),'end':round(p['end']*scale,3),'id':f"{s['id']}-packet-{j+1}"} for j,p in enumerate(s['packets'])])
            if s.get('drillDownFunctionId') in functions and s['drillDownFunctionId']!=current:
                flow['drillDownFunctionId']=s['drillDownFunctionId']
            steps.append({'id':s['id'],'title':s['title'],'question':s['question'],'narration':s['narration'],
                          'insight':s['takeaway'],'safeguard':'Illustrative data and displayed code; no model, database or Python interpreter is executed.',
                          'duration':duration,'flow':flow})
        return {'graph':graph,'codeFiles':[{'file':file,'language':'trace' if all(row['text'].lstrip().startswith('@') for row in rows.values()) else 'python','lines':sorted(rows.values(),key=lambda r:r['lineNumber'])} for file,rows in files.items()], 'steps':steps}

    root=module(source['graph'],source['steps'],source['codeLines'],'answer.py')
    architecture={'version':1,'illustrative':True,'graph':root['graph'],'codeFiles':root['codeFiles'],'functions':{}}
    for fid,fn in functions.items():
        nested=module(fn['graph'],fn['steps'],fn['codeLines'],fn['fileName'],fid)
        architecture['functions'][fid]={**nested,'id':fid,'title':fn['functionName'],'summary':fn['summary']}
    architecture=validate_architecture(architecture)
    chapters=[]
    for i,row in enumerate(root['steps']):
        bridge='Follow the raw question through the system.' if i==0 else 'The previous result supplies the input for this next operation.'
        chapters.append({**row,'teaching':'architecture','layout':'architecture_flow','sourcePages':[],
            'continuity':{'from':root['steps'][i-1]['id'] if i else None,'bridge':bridge},
            'narration':bridge+' '+row['narration'],'takeaway':row['insight'],
            'presentation':{'method':'Architecture and code execution trace','why':row['question'],
                            'visualEvidence':row['insight'],'textMode':'labels'}})
    raw={'title':'How a RAG answer is assembled','question':'How does a question become an answer supported by retrieved documents?',
         'representation':'One fictional shop-policy example, a stable system graph, linked code excerpts and inspectable input/output states. All vectors, ranking and generation are illustrative.',
         'example':{'title':'Follow one refund question','description':'Inspect each function and its inner logic. Illustrative source and data; code is not executed.','icon':'code'},
         'architecture':architecture,'chapters':chapters}
    lesson=validate_lesson(raw,None,{'code'},require_continuity=True,require_presentation=True)
    lesson.update(id='a7c4e71f90d3426b84c719ea064bd230',kind='live_generated',
        provenance={'kind':'user-provided-reference','source':'Google AI Studio architecture and code tracing prototype',
                    'adaptation':'QWEEPS schema, deterministic ELK layout and shared lesson player; corrected normalization and explicit toy-tokenizer rules; no prepared AI answers imported'},
        review={'method':'authored prototype adaptation; pending QWEEPS browser verification','approved':False})
    return lesson


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path)
    args=p.parse_args();lesson=convert(json.loads(args.source.read_text()));args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(lesson,ensure_ascii=False,indent=2)+'\n')
    print('Converted',len(lesson['chapters']),'beats and',len(lesson['architecture']['functions']),'function modules')


if __name__=='__main__':main()
