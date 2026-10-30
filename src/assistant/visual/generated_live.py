"""Native rendering of validated generated lesson plans.

The plan is data, never executable Python. The same timed objects are evaluated
on an absolute playhead, so a rewind does not depend on playback history.
"""
from __future__ import annotations

from bisect import bisect_right
import numpy as np
import tempfile
from manimlib import *
from .native_live import ProductionScene, words, BLUE


class GeneratedScene(ProductionScene):
    def __init__(self, plan):
        Scene.__init__(self, camera_config={'resolution': (1280, 720), 'fps': 30,
                                            'background_color': '#05070B'},
                       file_writer_config={'write_to_movie': False})
        self.plan = plan
        self.lesson_id = 'generated'
        self.starts = [0.0]
        for beat in plan['beats']:
            self.starts.append(self.starts[-1] + beat['duration'])
        self.duration = self.starts[-1]
        self.chapter_titles = [b['title'] for b in plan['beats']]
        self.header = words('QWEEPS · VISUAL EXPLANATION', 17, BLUE).to_corner(UL, buff=.3).fix_in_frame()
        self.chapter_label = words(self.chapter_titles[0], 26).move_to(UP * 3.25).fix_in_frame()
        self.select_group = VGroup()
        self.active_chapter = 0
        self.settings = None
        self.build({})

    def chapter_at(self, t):
        return min(len(self.chapter_titles)-1, max(0, bisect_right(self.starts, t)-1))

    def validate_settings(self, raw):
        if raw not in ({}, None):
            raise ValueError('Generated lesson has no experiment controls')
        return {}

    def object_for(self, e, nodes):
        pos = np.array([e['x'], e['y'], 0.])
        color = e['color']
        parts = VGroup()
        if e['kind'] in ('line', 'arrow'):
            a, b = nodes[e['from']], nodes[e['to']]
            start = np.array([a['x'], a['y'], 0.])
            end = np.array([b['x'], b['y'], 0.])
            diff = end - start
            dist = np.linalg.norm(diff)
            if dist < .01:
                end = start + RIGHT*.01
                dist = .01
                diff = end - start
            p_idx = e.get('parallel_index')
            p_cnt = e.get('parallel_count', 1)
            offset = np.zeros(3)
            if p_idx is not None and p_cnt > 1:
                normal = np.array([-diff[1], diff[0], 0.]) / dist
                offset = (p_idx - (p_cnt - 1) / 2.0) * 0.22 * normal
                start = start + offset
                end = end + offset
            shape = Arrow(start, end, buff=.2) if e['kind'] == 'arrow' else Line(start, end)
            parts.add(shape.set_stroke(color, 2))
            if e['label']:
                lbl_offset = UP * .25 + offset if p_cnt > 1 else UP * .25
                parts.add(words(e['label'], 16, color).move_to((start+end)/2 + lbl_offset))
        else:
            if e['kind'] == 'circle':
                parts.add(Ellipse(width=e['width'], height=e['height']).set_stroke(color, 2).set_fill(color, .08).move_to(pos))
            elif e['kind'] == 'box':
                parts.add(RoundedRectangle(width=e['width'], height=e['height'], corner_radius=.12).set_stroke(color, 2).set_fill(color, .08).move_to(pos))
            elif e['kind'] == 'path':
                points = [pos + np.array([p[0]*e['width']/2, p[1]*e['height']/2, 0]) for p in e['points']]
                if e['closed']: points.append(points[0])
                shape = VMobject()
                if e['smooth']: shape.set_points_smoothly(points)
                else: shape.set_points_as_corners(points)
                parts.add(shape.set_stroke(color, 2).set_fill(color, .08 if e['closed'] else 0))
            elif e['kind'] == 'svg':
                with tempfile.NamedTemporaryFile(mode='w', suffix='.svg', encoding='utf-8') as svg:
                    svg.write(e['svg']); svg.flush()
                    artwork=SVGMobject(svg.name)
                # ManimGL can import SVG strokes at width zero, making outline-only
                # artwork invisible even though it has a nonempty bounding box.
                for part in artwork.family_members_with_points():
                    if part.get_stroke_width() <= 0 and part.get_fill_opacity() <= 0:
                        part.set_stroke(color, 2)
                if artwork.get_width() > .001 and artwork.get_height() > .001:
                    artwork.set_width(e['width'])
                    if artwork.get_height() > e['height']: artwork.set_height(e['height'])
                parts.add(artwork.move_to(pos))
            if e['label']:
                label = words(e['label'], 26, color)
                if label.get_width() > e['width']*.9: label.set_width(e['width']*.9)
                parts.add(label.move_to(pos))
        if not len(parts): parts.add(Dot(pos, radius=.001).set_opacity(0))
        if e['opacity'] < 1: parts.set_opacity(e['opacity'])
        return parts

    def build(self, raw):
        self.settings = self.validate_settings(raw)
        self.clear()
        self.add(self.header, self.chapter_label)
        self.drawn = VGroup()
        self.select_group = VGroup()
        self.roles = {}
        self.previous_time = -1
        self.evaluate(0, [], None)

    def evaluate(self, t, selected, camera):
        chapter = self.chapter_at(t)
        beat = self.plan['beats'][chapter]
        elapsed = t - self.starts[chapter]
        previous = self.plan['beats'][chapter-1] if chapter else None
        prev = {e['id']: e for e in previous['elements']} if previous else {}
        alpha = min(1., max(0., elapsed / beat['transitionDuration']))
        alpha = alpha*alpha*(3-2*alpha)
        current = []
        for item in beat['elements']:
            e = dict(item)
            old = prev.get(e['id'])
            if old and old['kind'] == e['kind']:
                for k in ('x','y','width','height','opacity'):
                    e[k] = old[k] + (e[k]-old[k])*alpha
            current.append(e)
        nodes = {e['id']: e for e in current if e['kind'] not in ('line','arrow')}
        edges = [e for e in current if e['kind'] in ('line', 'arrow')]
        pair_counts = {}
        for ed in edges:
            pair = tuple(sorted([ed['from'], ed['to']]))
            pair_counts[pair] = pair_counts.get(pair, 0) + 1
        pair_seen = {}
        for ed in edges:
            pair = tuple(sorted([ed['from'], ed['to']]))
            idx = pair_seen.get(pair, 0)
            pair_seen[pair] = idx + 1
            ed['parallel_index'] = idx
            ed['parallel_count'] = pair_counts[pair]
        self.remove(self.drawn, self.select_group)
        self.drawn = VGroup(); self.select_group = VGroup(); self.roles = {}
        for e in current:
            if e['id'] not in prev and elapsed < e['revealAt']: continue
            obj = self.object_for(e, nodes)
            if e['id'] not in prev:
                progress = min(1., max(0., (elapsed-e['revealAt'])/e['drawDuration']))
                if progress <= 0: continue
                if e['entrance'] == 'grow':
                    obj.scale(max(.001, progress))
                elif progress < 1:
                    for part in obj.family_members_with_points():
                        if e['entrance'] == 'draw' and hasattr(part, 'pointwise_become_partial'):
                            part.pointwise_become_partial(part.copy(), 0, progress)
                        else:
                            part.set_opacity(e['opacity']*progress)
            self.drawn.add(obj)
            self.roles[e['id']] = [(obj, chapter)]
            cue = e.get('emphasizeAt')
            if cue is not None and 0 <= elapsed-cue <= 1.2:
                phase=(elapsed-cue)/1.2
                if e['kind'] in ('line','arrow'):
                    a,b=nodes[e['from']],nodes[e['to']]
                    point=np.array([a['x']+(b['x']-a['x'])*phase,a['y']+(b['y']-a['y'])*phase,0])
                    self.drawn.add(Dot(point,radius=.07).set_color('#FFFF00'))
                else:
                    outline=SurroundingRectangle(obj,buff=.12).set_stroke('#FFFF00',2).set_fill(opacity=0)
                    outline.set_opacity(float(np.sin(np.pi*phase)))
                    self.drawn.add(outline)
            if e['id'] in selected:
                self.select_group.add(SurroundingRectangle(obj,buff=.1).set_stroke('#FFFF00',2).set_fill(opacity=0))
        self.add(self.drawn)
        if len(self.select_group): self.add(self.select_group)
        cam = beat['camera']; oldcam = previous['camera'] if previous else cam
        x = oldcam['x']+(cam['x']-oldcam['x'])*alpha
        y = oldcam['y']+(cam['y']-oldcam['y'])*alpha
        zoom = oldcam['zoom']+(cam['zoom']-oldcam['zoom'])*alpha
        self.frame.move_to([x,y,0]).set_width(15/zoom)
        if camera:
            self.frame.shift([camera.get('x',0),camera.get('y',0),0])
            self.frame.set_width(self.frame.get_width()/max(.3,min(3,camera.get('zoom',1))))
        if chapter != self.active_chapter:
            self.chapter_label.become(words(self.chapter_titles[chapter],26).move_to(UP*3.25).fix_in_frame())
            self.active_chapter = chapter
        self.previous_time = t
