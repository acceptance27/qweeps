"""Trusted ManimGL scene worker: seekable native animations, not browser geometry.

Receives bounded experiment/time snapshots over stdin and publishes GPU-rendered
JPEG frames in a private local directory. No user/model Python is executed.
"""
from __future__ import annotations
import io
import json
import math
import os
from pathlib import Path
import queue
import sys
import threading
import time
import numpy as np
from manimlib import *
from manimlib.animation.animation import prepare_animation
from assistant.visual.production import DEFAULTS,experiment,token_cost,interval_union

INK='#E7EBF0'; MUTED='#8090A0'; BLUE='#58C4DD'; GOLD='#FFD166'; PURPLE='#B9A0F7'; GREEN='#83C167'; RED='#FC6255'
CENTERS=[np.array(p,dtype=float) for p in [(0,0,0),(16,0,0),(16,-10,0),(0,-10,0),(0,-20,0),(16,-20,0)]]
TITLES=['Two clocks: playback and production','Open the production clock','What the renderer repeats','The same tokens, re-encoded as dollars','Remove repeated work','Choose the useful tradeoff']


def words(s,size=25,color=INK):
    m=Text(str(s),font='Sans',font_size=size).set_color(color)
    if m.get_width()>13:m.set_width(13)
    return m


def duration(s):return f'{int(s//60)}m {round(s%60)}s'


class ProductionScene(Scene):
    def __init__(self,report,svg_path):
        super().__init__(camera_config={'resolution':(1280,720),'fps':30,'background_color':'#05070B','max_allowable_norm':1000},file_writer_config={'write_to_movie':False})
        self.report=report;self.svg_path=svg_path;self.settings=None;self.tracks=[];self.roles={};self.previous_time=-1;self.last_alphas={}
        self.header=words('QWEEPS · NATIVE MANIMGL',18,BLUE).to_corner(UL,buff=.3).fix_in_frame()
        self.chapter_label=words(TITLES[0],26).move_to(UP*3.25).fix_in_frame()
        self.select_group=VGroup()
        self.active_chapter=0;self.duration=120;self.chapter_titles=TITLES
        self.build(DEFAULTS)
    def chapter_at(self,t):return min(5,int(t//20))
    def validate_settings(self,raw):return experiment(self.report,raw)
    def track(self,start,length,*animations):
        for value in animations:
            anim=prepare_animation(value)
            anim.set_run_time(length)
            anim.begin();anim.interpolate(1);anim.finish()
            self.tracks.append((start,length,anim))
    def add_label(self,value,center,size=24,color=INK):
        m=words(value,size,color).move_to(center);self.add(m);return m
    def register(self,key,mob,chapter):self.roles.setdefault(key,[]).append((mob,chapter))
    def build(self,raw):
        s=experiment(self.report,raw);self.settings=s;self.tracks=[];self.roles={};self.last_alphas={};self.previous_time=-1
        self.clear();self.frame.move_to(ORIGIN).set_width(15)
        self.add(self.header,self.chapter_label,self.select_group)
        turns=[t for t in self.report['turns'] if s['scope']=='all' or t['id']==s['scope']]
        scopes={t['id'] for t in turns};seconds=sum(t['seconds'] for t in turns)
        start=min(t['start'] for t in turns);span=max(t['end'] for t in turns)-start
        jobs=[(i,j) for i,j in enumerate(self.report['jobs']) if j['scope'] in scopes]
        rates=token_cost(self.report,s)
        u={k:sum(t['usage'][k] for t in turns) for k in ['input_tokens','cached_input_tokens','output_tokens']}
        # Camera moves over one persistent blackboard, in the native renderer.
        self.track(0,.01,Transform(self.frame,self.frame.copy().move_to(CENTERS[0])))
        for i in range(1,6):self.track(i*20,1.6,Transform(self.frame,self.frame.copy().move_to(CENTERS[i])))
        c=CENTERS[0]
        clock=SVGMobject(str(self.svg_path)).set_height(1.65).set_color(BLUE).move_to(c+LEFT*4+UP*.6)
        self.add(clock);self.track(.2,1.8,ShowCreation(clock))
        playback=self.add_label('113.4 seconds of playback',c+RIGHT*.9+UP*1.25,32,BLUE)
        label=self.add_label('The reference history clip',c+RIGHT*.9+UP*.55,22,MUTED)
        production=self.add_label(duration(seconds)+' of production',c+RIGHT*.9+DOWN*.75,32,GOLD)
        scope=self.add_label(turns[0]['label'] if len(turns)==1 else 'Recorded project turns',c+RIGHT*.9+DOWN*1.45,22,MUTED)
        self.track(1,1.6,Write(playback),Write(label));self.track(4,1.8,Write(production),Write(scope))
        self.register('production-clock',VGroup(production,scope),0)
        note=self.add_label('Making the scene also includes authoring, synthesis, renders and review.',c+DOWN*2.55,21)
        self.track(8,1.5,Write(note))
        # The widths are recorded job bounds. No invented phase-duration pie chart.
        c=CENTERS[1];colors={'audio':PURPLE,'render':GOLD,'verification':GREEN,'build':BLUE}
        for row,category in enumerate(colors):
            y=1.7-row*.92
            lane=Line(c+np.array([-4.7,y,0]),c+np.array([6.2,y,0])).set_stroke(MUTED,.7)
            caption=self.add_label({'audio':'Voice','render':'Render / probes','verification':'Checks','build':'Build'}[category],c+np.array([-5.65,y,0]),20,colors[category])
            self.add(lane);self.track(22+row*.35,1,ShowCreation(lane),Write(caption))
            for idx,j in jobs:
                if j['category']!=category:continue
                width=max(.025,((j.get('end',j['start']+10)-j['start'])/span)*10.9)
                x=-4.7+(j['start']-start)/span*10.9
                bar=Rectangle(width=width,height=.32).set_stroke(RED if j['status']=='failed' else colors[category],1.5).set_fill(colors[category],.6).move_to(c+np.array([x+width/2,y,0]))
                self.add(bar);self.track(23+row*.5,1.8,FadeIn(bar,shift=UP*.1));self.register(f'job-{idx}',bar,1)
        note=self.add_label('Jobs can overlap. Width = dispatch to completion detection.',c+DOWN*2.7,21,MUTED);self.track(27,1.5,Write(note))
        # Genuine native paths and linked objects, evaluated on the same playhead.
        c=CENTERS[2]
        frames=round(113.433333*s['fps'])
        title=self.add_label(f"113.43 seconds × {s['fps']} fps = {frames:,} frames",c+UP*2.25,29,GOLD);self.track(42,1.5,Write(title))
        static=VGroup(*[Rectangle(width=.72,height=1.05).set_stroke(BLUE,2).set_fill(BLUE,.1).shift(RIGHT*i*.16) for i in range(7)]).move_to(c+LEFT*3)
        dynamic=VGroup(*[Rectangle(width=.72,height=1.05).set_stroke(GOLD,2).set_fill(GOLD,.08).shift(RIGHT*i*.95) for i in range(5)]).move_to(c+RIGHT*2.4)
        self.add(static,dynamic);self.track(43,2,ShowCreation(static),LaggedStart(*[ShowCreation(m) for m in dynamic],lag_ratio=.15))
        self.live_dots=VGroup(*[Dot(m.get_center(),radius=.065).set_color(GOLD) for m in dynamic]);self.add(self.live_dots);self.track(45,1,FadeIn(self.live_dots))
        a=self.add_label('Reuse unchanged geometry',c+LEFT*3+DOWN*1.25,22,BLUE)
        b=self.add_label('Evaluate changing geometry',c+RIGHT*2.4+DOWN*1.25,22,GOLD)
        note=self.add_label('A frame budget is visual work, not an AI token charge.',c+DOWN*2.6,21,MUTED)
        self.track(45,1.5,Write(a),Write(b),Write(note));self.register('static-layer',static,2);self.register('live-redraw',dynamic,2)
        # Keep categories and colors while changing the unit from tokens to dollars.
        c=CENTERS[3]
        cache=u['cached_input_tokens']*s['contextFraction'] if s['cache'] else 0
        counts=[u['input_tokens']*s['contextFraction']-cache,cache,u['output_tokens']]
        values=[rates['fresh'],rates['cached'],rates['output']]
        top=self.add_label('Token volume'+(' · recorded' if s['cache'] and s['contextFraction']==1 else ' · what-if'),c+UP*2,24,MUTED)
        lower=self.add_label('Same categories → hypothetical dollar value',c+DOWN*.1,24,MUTED)
        countbars=VGroup();copybars=VGroup();targets=VGroup();x=-5.8
        for idx,(n,color) in enumerate(zip(counts,[BLUE,PURPLE,GOLD])):
            w=max(.012,n/sum(counts)*11.6)
            bar=Rectangle(width=w,height=.65).set_stroke(color,1.5).set_fill(color,.65).move_to(c+np.array([x+w/2,1.1,0]));countbars.add(bar)
            copybars.add(bar.copy().shift(DOWN*2.1));x+=w
        x=-5.8
        for n,color in zip(values,[BLUE,PURPLE,GOLD]):
            w=max(.012,n/sum(values)*11.6);targets.add(Rectangle(width=w,height=.65).set_stroke(color,1.5).set_fill(color,.65).move_to(c+np.array([x+w/2,-1,0])));x+=w
        self.add(countbars,copybars);self.track(62,1.6,Write(top),ShowCreation(countbars));self.track(65,1,FadeIn(copybars),Write(lower));self.track(66,3,Transform(copybars,targets))
        for idx,key in enumerate(['fresh-input','cached-input','output']):self.register(key,countbars[idx],3);self.register(key,copybars[idx],3)
        legend=VGroup(*[words(name,19,color).move_to(c+np.array([-4+idx*4,-1.85,0])) for idx,(name,color) in enumerate(zip(['fresh input','cached input','output incl. reasoning'],[BLUE,PURPLE,GOLD]))])
        total=self.add_label(f"${rates['total']:.3f} · hypothetical GPT-6.1 Sol value",c+DOWN*2.65,25,GOLD)
        self.add(legend);self.track(69,1.5,Write(legend),Write(total))
        # Amdahl-style scenario, explicitly bounded rather than a promised speedup.
        c=CENTERS[4]
        bounded=interval_union([(j['start'],j['end']) for _,j in jobs if j['category']=='render' and 'end'in j]);saving=min(seconds,bounded)*s['avoidRender']
        before=Rectangle(width=11.6,height=.58).set_stroke(MUTED,1).set_fill(MUTED,.4).move_to(c+UP*.9)
        after=Rectangle(width=11.6*(seconds-saving)/seconds,height=.58).set_stroke(BLUE,1).set_fill(BLUE,.7).align_to(before,LEFT).set_y(c[1]-.8)
        a=self.add_label('Recorded turn wall time · '+duration(seconds),c+UP*1.6,24)
        b=self.add_label('Optimistic critical-path scenario · '+duration(seconds-saving),c+DOWN*.1,24,BLUE)
        self.add(before,after);self.track(82,2,Write(a),ShowCreation(before));self.track(85,2,Write(b),ShowCreation(after))
        n=self.add_label('Overlap can reduce the saving. Preserve the evidence when trimming context.',c+DOWN*2.4,20,MUTED);self.track(88,1.5,Write(n))
        self.register('recorded-time',before,4);self.register('scenario-time',after,4)
        # Time and token value are independent axes, with calibrated labels.
        c=CENTERS[5]
        point_values=[token_cost(self.report,{**s,'scope':t['id']})['total'] for t in self.report['turns']]
        max_y=max(1,*point_values)*1.25
        axes=Axes(x_range=(0,40,10),y_range=(0,max_y,max_y/4),width=11,height=4,axis_config={'include_tip':False,'include_ticks':False}).move_to(c+DOWN*.1)
        self.add(axes);self.track(102,1.8,ShowCreation(axes))
        for v in [0,10,20,30,40]:
            m=self.add_label(str(v),axes.c2p(v,0)+DOWN*.28,18,MUTED);self.track(103,1,Write(m))
        for i in range(5):
            m=self.add_label(f'${max_y*i/4:.1f}',axes.c2p(0,max_y*i/4)+LEFT*.45,18,MUTED);self.track(103,1,Write(m))
        for idx,(turn,value) in enumerate(zip(self.report['turns'],point_values)):
            dot=Dot(axes.c2p(turn['seconds']/60,value),radius=.09).set_color(GOLD if turn['id']==s['scope'] else BLUE)
            self.add(dot);self.track(104+idx*.35,1.1,GrowFromCenter(dot));self.register(turn['id'],dot,5)
        xlabel=self.add_label('Recorded production minutes',c+DOWN*2.65,23,MUTED)
        ylabel=self.add_label('Hypothetical token value',c+UP*2.35,23,MUTED)
        self.track(103,1.4,Write(xlabel),Write(ylabel))
        self.tracks.sort(key=lambda row:row[0]);self.evaluate(0,[],None)
    def evaluate(self,t,selected,camera):
        if t<self.previous_time:self.last_alphas.clear()
        seen=set()
        for start,length,anim in self.tracks:
            root=id(anim.mobject)
            alpha=float(np.clip((t-start)/length,0,1)) if t>=start else 0 if root not in seen else None
            if alpha is not None and (anim.mobject is self.frame or self.last_alphas.get(id(anim))!=alpha):
                anim.interpolate(alpha);self.last_alphas[id(anim)]=alpha
            seen.add(root)
        chapter=self.chapter_at(t)
        if chapter!=self.active_chapter:
            self.chapter_label.become(words(self.chapter_titles[chapter],26).move_to(UP*3.25).fix_in_frame());self.active_chapter=chapter
        if hasattr(self,'live_dots') and chapter==2:
            for i,dot in enumerate(self.live_dots):dot.set_y(CENTERS[2][1]+math.sin(t*1.8+i)*.28)
        if camera:
            self.frame.shift([camera.get('x',0),camera.get('y',0),0]);self.frame.set_width(self.frame.get_width()/max(.3,min(3,camera.get('zoom',1))))
        highlights=[]
        for key in selected:
            for mob,phase in self.roles.get(key,[]):
                if phase<=chapter:highlights.append(SurroundingRectangle(mob,buff=.1).set_stroke('#FFFF00',2).set_fill(opacity=0))
        # New highlight geometry must enter ManimGL’s render groups, not only
        # replace children of an empty group cached at scene construction.
        if highlights or self.select_group.submobjects:
            self.remove(self.select_group)
            self.select_group=VGroup(*highlights)
            if highlights:self.add(self.select_group)
        self.previous_time=t
    def metadata(self,t):
        chapter=self.chapter_at(t);center=self.frame.get_center();w=self.frame.get_width();h=self.frame.get_height();bounds=[]
        for key,items in self.roles.items():
            for mob,phase in items:
                if phase>chapter or mob.get_width()<.003:continue
                lo=mob.get_bounding_box()[0];hi=mob.get_bounding_box()[2]
                if hi[0]<center[0]-w/2 or lo[0]>center[0]+w/2 or hi[1]<center[1]-h/2 or lo[1]>center[1]+h/2:continue
                bounds.append({'id':key,'x1':float(((lo[0]-center[0])/w+.5)*1280),'x2':float(((hi[0]-center[0])/w+.5)*1280),'y1':float((.5-(hi[1]-center[1])/h)*720),'y2':float((.5-(lo[1]-center[1])/h)*720)})
        return {'backend':'ManimGL/OpenGL','lessonId':getattr(self,'lesson_id','manim_production'),'experiment':self.settings,'time':t,'camera':{'x':float(center[0]),'y':float(center[1]),'width':float(w)},'bounds':bounds,'gpu':self.camera.ctx.info.get('GL_RENDERER','OpenGL')}


def main():
    folder=Path(sys.argv[1]);report=json.loads(Path(sys.argv[2]).read_text());svg=Path(sys.argv[3]);folder.mkdir(parents=True,exist_ok=True)
    pending=queue.Queue(maxsize=1)
    def read():
        for line in sys.stdin:
            try:state=json.loads(line)
            except ValueError:continue
            try:pending.get_nowait()
            except queue.Empty:pass
            pending.put(state)
        pending.put(None)
    threading.Thread(target=read,daemon=True).start()
    lesson_id=sys.argv[4] if len(sys.argv)>4 else 'manim_production'
    if lesson_id=='jose_rizal':
        from assistant.visual.rizal_live import RizalScene
        scene=RizalScene(report)
    elif lesson_id=='alu':
        from assistant.visual.alu_live import ALUScene
        scene=ALUScene(report)
    elif lesson_id=='generated':
        from assistant.visual.generated_live import GeneratedScene
        scene=GeneratedScene(report)
    elif lesson_id=='wbc':
        from assistant.visual.ce_native import load_native_scene
        scene=load_native_scene(Path(__file__).with_name('scenes')/'white_blood_cell_lesson.py')
    elif lesson_id=='blood3d':
        from assistant.visual.ce_native import load_native_scene
        scene=load_native_scene(Path(__file__).with_name('scenes')/'blood_3d_lesson.py')
    elif lesson_id=='neuron':
        from assistant.visual.ce_native import load_native_scene
        scene=load_native_scene(Path(__file__).with_name('scenes')/'qweeps_neuron_lesson.py')
    else:scene=ProductionScene(report,svg)
    scene.lesson_id=lesson_id
    frames=0
    while True:
        state=pending.get()
        if state is None:break
        try:
            start=time.perf_counter();settings=scene.validate_settings(state.get('experiment'))
            if settings!=scene.settings:scene.build(settings)
            t=float(np.clip(state.get('time',0),0,scene.duration));scene.evaluate(t,state.get('selected',[]),state.get('camera'))
            scene.update_frame(0,force_draw=True)
            image=scene.camera.get_image().convert('RGB');buffer=io.BytesIO();image.save(buffer,format='JPEG',quality=94,subsampling=0)
            temp=folder/'frame.next';temp.write_bytes(buffer.getvalue());temp.replace(folder/'frame.jpg')
            frames+=1;meta={**scene.metadata(t),'revision':state.get('revision'),'frames':frames,'renderMs':round((time.perf_counter()-start)*1000,2)}
            temp=folder/'state.next';temp.write_text(json.dumps(meta));temp.replace(folder/'state.json')
        except Exception as exc:
            (folder/'error.txt').write_text(type(exc).__name__+': '+str(exc));raise
if __name__=='__main__':main()
