import copy
import pytest
from assistant.visual.diagrams import validate_diagram, resolve_diagram_clearance, check_boxes_overlap
from assistant.visual.plan import PlanError

def node():
    return {'color':'blue','position':{'x':100,'y':120,'width':300,'height':340},
            'artwork':[{'type':'path','d':'M0 50 Q25 0 50 50 T100 50'},
                       {'type':'text','x':50,'y':70,'text':'E = pc','fill':'white'}],
            'motion':[{'cue':'interaction','dx':280,'duration':2}]}

def test_vector_art_preserves_construction_and_semantic_motion():
    out=validate_diagram(node())
    assert out['artwork'][0]['d']=='M0 50 Q25 0 50 50 T100 50'
    assert out['motion'][0]['cue']=='interaction' and out['motion'][0]['dx']==280

def test_objects_can_disappear_with_zero_scale():
    raw=node();raw['motion'][0]['scale']=0
    assert validate_diagram(raw)['motion'][0]['scale']==0

@pytest.mark.parametrize('change',[
    lambda n:n['artwork'][0].update(d='<script>alert(1)</script>'),
    lambda n:n['artwork'][0].update(stroke='url(https://example.com/a.svg)'),
    lambda n:n['artwork'][0].update(d='M1e999 20 L40 50'),
    lambda n:n['position'].update(x=float('nan')),
    lambda n:n['position'].update(x=1300),
    lambda n:n['motion'][0].update(duration=-1),
    lambda n:n['artwork'].append({'type':'foreignObject'}),
])
def test_unsafe_or_out_of_bounds_diagrams_are_rejected(change):
    raw=copy.deepcopy(node());change(raw)
    with pytest.raises(PlanError):validate_diagram(raw)

def test_resolve_diagram_clearance_nudges_overlapping_nodes_apart():
    nodes = [
        {'id': 'photon_a', 'position': {'x': 200, 'y': 150, 'width': 400, 'height': 250}},
        {'id': 'photon_b', 'position': {'x': 450, 'y': 150, 'width': 400, 'height': 250}}
    ]
    # Initially overlap: photon_a right edge is 600 > photon_b left edge 450
    assert check_boxes_overlap(nodes[0]['position'], nodes[1]['position'], margin=15)
    resolved = resolve_diagram_clearance(nodes, min_margin=15)
    p0 = resolved[0]['position']
    p1 = resolved[1]['position']
    assert not check_boxes_overlap(p0, p1, margin=0)
    assert p0['x'] + p0['width'] <= p1['x'] or p1['x'] + p1['width'] <= p0['x']
    # Check within canvas bounds
    for p in (p0, p1):
        assert 45 <= p['x'] and p['x'] + p['width'] <= 1395
        assert 110 <= p['y'] and p['y'] + p['height'] <= 505

def test_resolve_diagram_clearance_rejects_impossible_collisions():
    nodes = [
        {'id': f'node_{i}', 'position': {'x': 100, 'y': 120, 'width': 950, 'height': 380}}
        for i in range(5)
    ]
    with pytest.raises(PlanError, match='overlap'):
        resolve_diagram_clearance(nodes, min_margin=15)

