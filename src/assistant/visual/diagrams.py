"""Bounded, declarative vector diagrams. Model-generated code never executes."""
from __future__ import annotations
import math
import re
from .plan import PlanError

PAINTS={'blue','gold','green','coral','purple','white','muted','none'}

def number(value, name, low, high):
    if type(value) not in (int,float) or not math.isfinite(value) or not low<=value<=high:
        raise PlanError(f'{name} must be a finite number between {low} and {high}')
    return value

def validate_diagram(node):
    p=node.get('position')
    if not isinstance(p,dict):raise PlanError('Diagram objects need position {x,y,width,height}')
    position={k:number(p.get(k),f'diagram {k}',*bounds) for k,bounds in
              [('x',(45,1300)),('y',(110,430)),('width',(100,1000)),('height',(120,390))]}
    if position['x']+position['width']>1395 or position['y']+position['height']>505:
        raise PlanError('Keep diagram objects inside the diagram region x45–1395, y110–505')
    art=node.get('artwork',[])
    if not isinstance(art,list) or len(art)>24:raise PlanError('Use at most 24 vector primitives per diagram object')
    drawings=[]
    fields={'circle':{'cx':50,'cy':50,'r':10},'ellipse':{'cx':50,'cy':50,'rx':20,'ry':10},
            'rect':{'x':10,'y':10,'width':80,'height':80,'rx':0},
            'line':{'x1':0,'y1':50,'x2':100,'y2':50},'text':{'x':50,'y':50,'size':12}}
    for part in art:
        if not isinstance(part,dict):raise PlanError('A vector primitive must be an object')
        kind=part.get('type');out={'type':kind}
        if kind=='path':
            d=part.get('d','')
            if not isinstance(d,str) or not d or len(d)>2400 or not re.fullmatch(r'[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+',d):
                raise PlanError('Use only SVG path commands and finite numeric coordinates')
            values=re.findall(r'[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?',d)
            for value in values:number(float(value),'path coordinate',-1000,1000)
            out['d']=d
        elif kind in fields:
            for key,default in fields[kind].items():
                out[key]=number(part.get(key,default),f'{kind} {key}',0 if key in {'r','rx','ry','width','height','size'} else -200,200)
            if kind=='text':
                value=part.get('text')
                if not isinstance(value,str) or not value.strip() or len(value)>90:raise PlanError('Diagram labels need 1–90 characters')
                out['text']=value
                if out['size']<6 or out['size']>24:raise PlanError('Use readable diagram label sizes 6–24 in the 100-unit art space')
        else:raise PlanError('Supported diagram primitives: path, circle, ellipse, rect, line, text')
        for key,default in [('stroke',node.get('color','blue')),('fill','none')]:
            paint=part.get(key,default)
            if paint not in PAINTS:raise PlanError('Use named palette paints, not URLs or SVG markup')
            out[key]=paint
        out['strokeWidth']=number(part.get('strokeWidth',1.4),'stroke width',0,6)
        drawings.append(out)
    motions=[]
    if not isinstance(node.get('motion',[]),list) or len(node.get('motion',[]))>4:raise PlanError('Use at most four cue-driven motions per object')
    for move in node.get('motion',[]):
        if not isinstance(move,dict) or not isinstance(move.get('cue'),str):raise PlanError('Each motion names a semantic cue object')
        motions.append({'cue':move['cue'],**{k:number(move.get(k,default),f'motion {k}',low,high) for k,default,low,high in
            [('dx',0,-1000,1000),('dy',0,-350,350),('scale',1,0,3),('opacity',1,0,1),('duration',1.5,.2,6),('delay',0,0,6)]}})
    return {'position':position,'artwork':drawings,'motion':motions}
