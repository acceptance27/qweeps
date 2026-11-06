"""Small, deterministic worked examples. Never evaluate model-authored code."""
from __future__ import annotations
import copy
import json
import math
import re
from .plan import PlanError

OPERATIONS={'normalize','mean','dot','cosine','similarities','rank','take','tokenize','concat','format','get'}

def _finite(value):
    if type(value) not in (int,float) or not math.isfinite(value):raise PlanError('Example numbers must be finite')
    return value

def _vector(value):
    if not isinstance(value,list) or not 1<=len(value)<=64:raise PlanError('Example vectors need 1-64 numbers')
    return [_finite(v) for v in value]

def _cosine(a,b):
    a,b=_vector(a),_vector(b)
    if len(a)!=len(b):raise PlanError('Compared vectors must have equal dimensions')
    denominator=math.hypot(*a)*math.hypot(*b)
    if denominator==0:raise PlanError('Cosine similarity is undefined for a zero vector')
    return sum(x*y for x,y in zip(a,b))/denominator

def display(value):
    return value if isinstance(value,str) else json.dumps(value,ensure_ascii=False,separators=(', ',': '),allow_nan=False)

def preview(value):
    if isinstance(value,list):return [display(v)[:1000] for v in value[:12]] or ['[]']
    return [display(value)[:1000]]

def transfer_preview(value):
    if isinstance(value,list) and value and all(isinstance(row,dict) and 'id' in row for row in value):
        text=' · '.join(str(row['id'])+(f': {row["score"]:.4f}' if type(row.get('score')) in (int,float) else '') for row in value[:3])
        if len(value)>3:text+=f' · +{len(value)-3}'
    else:text=display(value)
    return text if len(text)<=100 else text[:97]+'…'

def _run(op,args,params):
    expected={'normalize':1,'mean':1,'dot':2,'cosine':2,'similarities':2,'rank':1,'take':1,'tokenize':1,'concat':1,'get':1}
    if op in expected and len(args)!=expected[op]:raise PlanError(f'{op} needs {expected[op]} input references')
    if op=='normalize':
        values=_vector(args[0]);length=math.hypot(*values)
        if length==0:raise PlanError('Cannot normalize a zero vector')
        return [v/length for v in values]
    if op=='mean':
        if not isinstance(args[0],list) or not args[0]:raise PlanError('Mean pooling needs vectors')
        vectors=[_vector(v) for v in args[0]]
        if len({len(v) for v in vectors})!=1:raise PlanError('Pooled vectors must have equal dimensions')
        return [sum(row[i] for row in vectors)/len(vectors) for i in range(len(vectors[0]))]
    if op=='dot':
        a,b=_vector(args[0]),_vector(args[1])
        if len(a)!=len(b):raise PlanError('Compared vectors must have equal dimensions')
        return sum(x*y for x,y in zip(a,b))
    if op=='cosine':return _cosine(*args)
    if op=='similarities':
        metric=params.get('metric','cosine')
        if metric not in {'cosine','dot'}:raise PlanError('Document similarity metric must be cosine or dot')
        if not isinstance(args[1],list) or not 1<=len(args[1])<=24:raise PlanError('Similarity examples need 1-24 documents')
        result=[];ids=set()
        for doc in args[1]:
            if not isinstance(doc,dict) or not isinstance(doc.get('id'),str) or doc['id'] in ids:raise PlanError('Example documents need unique string IDs')
            if not isinstance(doc.get('text'),str):raise PlanError('Example documents need text')
            score=_cosine(args[0],doc.get('vector')) if metric=='cosine' else _run('dot',[args[0],doc.get('vector')],{})
            ids.add(doc['id']);result.append({'id':doc['id'],'text':doc['text'],'score':score})
        return result
    if op=='rank':
        if not isinstance(args[0],list) or any(not isinstance(v,dict) or 'score' not in v for v in args[0]):raise PlanError('Ranking needs rows with numerical scores')
        return sorted(copy.deepcopy(args[0]),key=lambda row:-_finite(row['score']))
    if op=='take':
        count=params.get('count')
        if type(count) is not int or not 1<=count<=24 or not isinstance(args[0],list):raise PlanError('Top-k needs a list and count 1-24')
        return copy.deepcopy(args[0][:count])
    if op=='get':
        key=params.get('key')
        if not isinstance(key,str):raise PlanError('Example get needs a key')
        if isinstance(args[0],list):
            if any(not isinstance(v,dict) or key not in v for v in args[0]):raise PlanError('The example key must exist on every row')
            return [copy.deepcopy(v[key]) for v in args[0]]
        if not isinstance(args[0],dict) or key not in args[0]:raise PlanError('The example key must exist')
        return copy.deepcopy(args[0][key])
    if op=='tokenize':
        if not isinstance(args[0],str):raise PlanError('Tokenization needs text')
        stopwords=params.get('stopwords',[])
        if not isinstance(stopwords,list) or any(not isinstance(v,str) for v in stopwords):raise PlanError('Declare the toy stopwords explicitly')
        if params.get('lowercase',True):stopwords=[word.lower() for word in stopwords]
        value=args[0].lower() if params.get('lowercase',True) else args[0]
        return [token for token in re.findall(r'\w+',value) if token not in stopwords]
    if op=='concat':
        separator=params.get('separator','\n\n')
        if not isinstance(separator,str) or not isinstance(args[0],list) or any(not isinstance(v,str) for v in args[0]):raise PlanError('Concatenation needs a list of strings and text separator; extract document text first with get(parameters.key="text")')
        return separator.join(args[0])
    if op=='format':
        template=params.get('template');keys=params.get('keys')
        if not isinstance(template,str) or len(template)>5000 or not isinstance(keys,list) or len(keys)!=len(args) or any(not isinstance(k,str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*',k) for k in keys):raise PlanError('Example formatting needs a template and one simple key per input')
        values=dict(zip(keys,args));tokens=re.findall(r'\{([^{}]+)\}',template)
        if any(token not in values for token in tokens):raise PlanError('Every template slot needs an input; attributes and expressions are unsupported')
        return re.sub(r'\{([^{}]+)\}',lambda m:display(values[m[1]]),template)
    raise PlanError('Unsupported worked-example operation')

def compile_example(raw):
    if not isinstance(raw,dict) or not isinstance(raw.get('inputs'),dict) or not 1<=len(raw['inputs'])<=32:raise PlanError('A worked example needs 1-32 named inputs')
    try:encoded=json.dumps({'inputs':raw['inputs'],'calculations':raw.get('calculations',[])},allow_nan=False)
    except (ValueError,TypeError,RecursionError) as exc:raise PlanError('Worked examples need finite JSON data') from exc
    if len(encoded)>64000:raise PlanError('Keep the worked example within 64 KB')
    inputs=copy.deepcopy(raw['inputs']);values=copy.deepcopy(inputs)
    def valid_id(key):return isinstance(key,str) and re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,79}',key)
    if any(not valid_id(key) for key in inputs):raise PlanError('Example values need semantic IDs')
    calculations=raw.get('calculations',[])
    if not isinstance(calculations,list) or len(calculations)>32:raise PlanError('Use at most 32 worked-example operations')
    checked=[]
    for calc in calculations:
        if not isinstance(calc,dict) or not valid_id(calc.get('id')) or calc['id'] in values:raise PlanError('Calculated value IDs must be valid and unique')
        op=calc.get('operation');refs=calc.get('inputs');params=calc.get('parameters',{})
        if op not in OPERATIONS or not isinstance(refs,list) or any(not isinstance(ref,str) or ref not in values for ref in refs):raise PlanError('Calculations must use supported operations and earlier value IDs')
        if not isinstance(params,dict):raise PlanError('Calculation parameters must be an object')
        try:
            result=_run(op,[values[ref] for ref in refs],params)
            if len(json.dumps(result,allow_nan=False))>16000:raise PlanError('Calculated values must fit within 16 KB')
        except (OverflowError,ValueError,TypeError,KeyError) as exc:raise PlanError('Invalid worked-example inputs: '+str(exc)) from exc
        values[calc['id']]=result
        if len(json.dumps(values,allow_nan=False))>96000:raise PlanError('Keep calculated example data within 96 KB')
        checked.append({'id':calc['id'],'operation':op,'inputs':refs,'parameters':copy.deepcopy(params)})
    return {'inputs':inputs,'calculations':checked,'values':values,'method':'deterministic-example-calculations'}

def resolve(ref,values):
    if not isinstance(ref,str) or ref not in values:raise PlanError('Value references must name a worked-example input or calculated result')
    return copy.deepcopy(values[ref])

def bind_visual(visual,value):
    result=copy.deepcopy(visual or {'variant':'paper-card','title':'Worked example'})
    result['lines']=preview(value)
    variant=result['variant']
    if variant=='vector-bars':result['floats']=_vector(value);result['normLabel']=f'L2 norm: {math.hypot(*value):.4f}'
    if variant=='token-tiles':
        if not isinstance(value,list):raise PlanError('Token visuals need a list value')
        result['tiles']=[{'text':display(v),'color':'blue'} for v in value[:24]]
    if variant in {'lookup-table','funnel-pool','score-meter','podium-rank','gate-keep-drop','blueprint-slots','heatmap-spotlight','citation-verifier'}:
        rows=value if isinstance(value,list) else list(value.items()) if isinstance(value,dict) else [value]
        scores=[abs(row['score']) for row in rows if isinstance(row,dict) and type(row.get('score')) in (int,float)]
        scale=max(scores,default=0) or 1
        result['rows']=[]
        for i,row in enumerate(rows[:6]):
            bar={}
            if isinstance(row,dict):
                score=row.get('score');left=str(row.get('id',i+1));note=str(row.get('text',''))
                if variant=='citation-verifier' and note:right,note=note,''
                elif type(score) in (int,float):
                    right=f'{score:.4f}';bar={'barPercent':abs(score)/scale*100}
                elif 'vector' in row:right=display(row['vector'])
                elif note:right,note=note,''
                else:right=display(row)
            elif isinstance(row,tuple):left,right,note=str(row[0]),display(row[1]),''
            else:left,right,note=str(i+1),display(row),''
            result['rows'].append({'leftChip':left[:120],'rightValue':right[:1000],'note':note[:1000],'color':'coral' if isinstance(row,dict) and type(row.get('score')) in (int,float) and row['score']<0 else 'green',**bar})
        result['footerNote']='Calculated example'+(f' · 6 of {len(rows)} rows; inspect for all values' if len(rows)>6 else '')
        if variant=='score-meter' and scores:result['footerNote']+=' · bars: |score| / max |score|'
    if variant=='output-pill':result['highlightText']=display(value)[:600]
    return result
