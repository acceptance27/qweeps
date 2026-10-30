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


def check_boxes_overlap(b1, b2, margin=15):
    """Return True if two boxes violate margin clearance."""
    return not (b1['x'] + b1['width'] + margin <= b2['x'] or
                b2['x'] + b2['width'] + margin <= b1['x'] or
                b1['y'] + b1['height'] + margin <= b2['y'] or
                b2['y'] + b2['height'] + margin <= b1['y'])


def resolve_diagram_clearance(nodes, min_margin=15):
    """Resolve and validate diagram node clearance to prevent overlapping bounding boxes."""
    if len(nodes) <= 1:
        return nodes

    positions = [dict(n['position']) for n in nodes]
    canvas_min_x = 45.0
    canvas_max_x = 1395.0
    canvas_min_y = 110.0
    canvas_max_y = 505.0
    min_width = 100.0
    min_height = 120.0

    for iteration in range(25):
        any_overlap = False
        for i in range(len(positions)):
            for j in range(i + 1, len(positions)):
                a, b = positions[i], positions[j]
                x1_a, x2_a = a['x'], a['x'] + a['width']
                y1_a, y2_a = a['y'], a['y'] + a['height']
                x1_b, x2_b = b['x'], b['x'] + b['width']
                y1_b, y2_b = b['y'], b['y'] + b['height']

                req_ox = min(x2_a, x2_b) - max(x1_a, x1_b) + min_margin
                req_oy = min(y2_a, y2_b) - max(y1_a, y1_b) + min_margin

                if req_ox > 0 and req_oy > 0:
                    any_overlap = True
                    center_a_x = x1_a + a['width'] / 2.0
                    center_b_x = x1_b + b['width'] / 2.0
                    center_a_y = y1_a + a['height'] / 2.0
                    center_b_y = y1_b + b['height'] / 2.0

                    if req_ox <= req_oy:
                        shift = req_ox / 2.0
                        if center_a_x < center_b_x:
                            a['x'] -= shift
                            b['x'] += shift
                        elif center_a_x > center_b_x:
                            a['x'] += shift
                            b['x'] -= shift
                        else:
                            a['x'] -= shift
                            b['x'] += shift + 1.0
                    else:
                        shift = req_oy / 2.0
                        if center_a_y < center_b_y:
                            a['y'] -= shift
                            b['y'] += shift
                        elif center_a_y > center_b_y:
                            a['y'] += shift
                            b['y'] -= shift
                        else:
                            a['y'] -= shift
                            b['y'] += shift + 1.0

        for p in positions:
            p['x'] = max(canvas_min_x, min(canvas_max_x - p['width'], p['x']))
            p['y'] = max(canvas_min_y, min(canvas_max_y - p['height'], p['y']))

        if not any_overlap:
            break

        if iteration >= 10:
            scale = 0.96
            for p in positions:
                if p['width'] * scale >= min_width:
                    new_w = p['width'] * scale
                    p['x'] += (p['width'] - new_w) / 2.0
                    p['width'] = new_w
                if p['height'] * scale >= min_height:
                    new_h = p['height'] * scale
                    p['y'] += (p['height'] - new_h) / 2.0
                    p['height'] = new_h

    for p in positions:
        p['x'] = round(p['x'], 1)
        p['y'] = round(p['y'], 1)
        p['width'] = round(p['width'], 1)
        p['height'] = round(p['height'], 1)

    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            if check_boxes_overlap(positions[i], positions[j], margin=0):
                raise PlanError(f"Diagram objects '{nodes[i]['id']}' and '{nodes[j]['id']}' overlap; allocate distinct coordinates with at least {min_margin}px clearance.")

    for node, p in zip(nodes, positions):
        node['position'] = p

    return nodes

