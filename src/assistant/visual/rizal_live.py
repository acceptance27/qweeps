"""Original native ManimGL history scene, evaluated on an audio-measured timeline.

The scene is illustrative. Geometry never estimates historical readership or
causal strength, and interaction cannot change documented dates.
"""
from bisect import bisect_right
import numpy as np
import json
import math
import os
from functools import lru_cache
from pathlib import Path
from manimlib import *
from .native_live import ProductionScene, words, INK, MUTED, BLUE, GOLD, PURPLE, GREEN, RED
from .rizal import settings

CENTERS=[np.array(p,float) for p in [(0,0,0),(16,0,0),(32,0,0),(32,-10,0),(16,-10,0),(0,-10,0)]]


def stroke(m,color=INK,width=2,fill=0):return m.set_stroke(color,width).set_fill(color,fill)
def path(points,color=INK,width=2):return stroke(VMobject().set_points_smoothly([np.array(p,float) for p in points]),color,width)
# Natural Earth is modern generalized geography. It provides coastlines for
# orientation, not a claim about colonial-era political borders.
@lru_cache(maxsize=1)
def _geographic_data():
    default=Path(__file__).resolve().parents[3]/'visual-studio/lessons/jose_rizal/assets/natural-earth-50m.json'
    path=Path(os.environ.get('QWEEPS_RIZAL_GEOGRAPHY',str(default)))
    return json.loads(path.read_text())['countries']

def geographic_map(codes, bounds, center, width, height):
    data=_geographic_data()
    lo,hi,bottom,top=bounds;lat=(bottom+top)/2;aspect=math.cos(math.radians(lat))
    scale=min(width/((hi-lo)*aspect),height/(top-bottom))
    def at(lon,latitude):
        return np.array(center,float)+np.array([(lon-(lo+hi)/2)*aspect*scale,(latitude-(bottom+top)/2)*scale,0])
    pieces=[]
    for code in codes:
        for ring in data[code]:
            if not ring or not all(lo<=x<=hi and bottom<=y<=top for x,y in ring):continue
            vertices=[at(lon,latitude) for lon,latitude in ring]
            if len(vertices)>=4:
                pieces.append(stroke(Polygon(*vertices),BLUE if code in ('PHL','ESP') else MUTED,1.25,.09))
    return VGroup(*pieces),at

def location_label(point,text,offset,color=GOLD):
    point=np.array(point,float);end=point+np.array(offset,float)
    mark=Dot(point,radius=.055).set_color(color)
    lead=stroke(Line(point,end),color,1.3)
    label=words(text,18,color).next_to(end,RIGHT,buff=.1)
    return VGroup(mark,lead,label)

def person(color=INK,size=1):
    head=stroke(Circle(radius=.14).shift(UP*.3),color,2)
    body=path([[-.24,-.3,0],[-.19,.02,0],[0,.11,0],[.19,.02,0],[.24,-.3,0]],color,2)
    return VGroup(head,body).scale(size)
def profile(size=1):
    face=stroke(Circle(radius=.33).shift(UP*.22),BLUE,2.5,.06)
    hair=stroke(Arc(start_angle=.1,angle=2.9,radius=.34).shift(UP*.23),INK,5)
    jacket=stroke(Polygon([-.6,-.65,0],[-.4,-.25,0],[0,-.12,0],[.4,-.25,0],[.6,-.65,0]),BLUE,2,.08)
    collar=stroke(VMobject().set_points_as_corners([[-.23,-.23,0],[0,-.52,0],[.23,-.23,0]]),INK,2)
    return VGroup(face,hair,jacket,collar).scale(size)
def book(title='',color=GOLD):
    cover=stroke(RoundedRectangle(width=1.05,height=1.45,corner_radius=.06),color,2,.12)
    spine=stroke(Line([-.38,-.67,0],[-.38,.67,0]),color,1.4)
    lines=VGroup(*[stroke(Line([-.2,y,0],[.34,y,0]),color,1) for y in [-.15,-.3,-.45]])
    group=VGroup(cover,spine,lines)
    if title:group.add(words(title,17,color).set_width(.72).move_to(UP*.32))
    return group

def page():
    outline=stroke(Polygon([-.38,-.55,0],[.38,-.55,0],[.38,.35,0],[.15,.55,0],[-.38,.55,0]),GOLD,1.5,.06)
    lines=VGroup(*[stroke(Line([-.23,y,0],[.23,y,0]),MUTED,1) for y in [.2,0,-.2,-.4]])
    return VGroup(outline,lines)
def eye():
    top=path([[-.62,0,0],[0,.3,0],[.62,0,0]],BLUE,2)
    bottom=path([[-.62,0,0],[0,-.3,0],[.62,0,0]],BLUE,2)
    return VGroup(top,bottom,stroke(Circle(radius=.13),BLUE,2,.35))
def pen():
    nib=stroke(Polygon([-.16,-.5,0],[0,-.75,0],[.16,-.5,0],[.11,.25,0],[-.11,.25,0]),GOLD,2,.15)
    feather=path([[0,.15,0],[.05,.8,0],[.45,1.1,0],[.32,.4,0],[0,.15,0]],GOLD,2)
    return VGroup(nib,feather).rotate(-.35)
def house(color=GREEN):
    roof=stroke(Polygon([-.68,.23,0],[0,.72,0],[.68,.23,0]),color,2,.12)
    walls=stroke(Rectangle(width=.95,height=.7).shift(DOWN*.12),color,2,.08)
    floor=stroke(Line([-.6,-.49,0],[.6,-.49,0]),color,2)
    stilts=VGroup(*[stroke(Line([x,-.49,0],[x,-.73,0]),color,1.6) for x in [-.43,.43]])
    door=stroke(Rectangle(width=.23,height=.43).shift(DOWN*.25),color,1.4)
    windows=VGroup(*[stroke(Rectangle(width=.17,height=.2).move_to([x,-.04,0]),color,1.2) for x in [-.28,.28]])
    return VGroup(roof,walls,floor,stilts,door,windows)
def simple_house(color=GREEN):
    roof=stroke(Polygon([-.55,.16,0],[0,.62,0],[.55,.16,0]),color,2,.08)
    walls=stroke(Rectangle(width=.86,height=.65).shift(DOWN*.16),color,2,.06)
    door=stroke(Rectangle(width=.22,height=.4).shift(DOWN*.27),color,1.3)
    return VGroup(roof,walls,door)

def flame():
    return stroke(VMobject().set_points_smoothly([[-.35,-.4,0],[-.4,.05,0],[-.08,.65,0],[.02,.22,0],[.28,.46,0],[.4,-.06,0],[.2,-.4,0],[-.35,-.4,0]]),RED,2.2,.25)


class RizalScene(ProductionScene):
    def __init__(self,manifest):
        Scene.__init__(self,camera_config={'resolution':(1280,720),'fps':30,'background_color':'#05070B'},file_writer_config={'write_to_movie':False})
        self.manifest=manifest;self.lesson_id='jose_rizal';self.duration=manifest['duration'];self.chapter_titles=[c['title'] for c in manifest['chapters']]
        self.header=words('QWEEPS · JOSÉ RIZAL',17,BLUE).to_corner(UL,buff=.3).fix_in_frame()
        self.chapter_label=words(self.chapter_titles[0],27).move_to(UP*3.25).fix_in_frame()
        self.select_group=VGroup();self.active_chapter=0;self.settings=None
        self.build({})
    def chapter_at(self,t):return min(len(self.chapter_titles)-1,max(0,bisect_right([c['start'] for c in self.manifest['chapters']],t)-1))
    def validate_settings(self,raw):return settings(self.manifest,raw)
    def show(self,mob,at,length=1.2,kind='draw'):
        self.add(mob)
        self.track(at,length,Write(mob) if kind=='write' else FadeIn(mob) if kind=='fade' else ShowCreation(mob))
        return mob
    def caption(self,value,point,at,size=23,color=INK):
        return self.show(words(value,size,color).move_to(point),at,1,'write')
    def build(self,raw):
        self.settings=self.validate_settings(raw);self.clear();self.tracks=[];self.roles={};self.last_alphas={};self.previous_time=-1
        self.frame.move_to(ORIGIN).set_width(15)
        self.add(self.header,self.chapter_label)
        self.water_dots=[]
        # A continuous spatial route remains in the world as the camera visits it.
        route=stroke(VMobject().set_points_as_corners([np.array(p,float) for p in [(0,-3.7,0),(16,-3.7,0),(39,-3.7,0),(39,-13.7,0),(16,-13.7,0),(0,-13.7,0)]]),MUTED,.6)
        self.add(route)
        for i,(c,ch) in enumerate(zip(CENTERS,self.manifest['chapters'])):
            self.caption(ch['years'],c+UP*(2.75 if i==4 else 2.55),ch['start']+.1,22,GOLD)
            self.track(ch['start'],.75,Transform(self.frame,self.frame.copy().move_to(c)))
            if i>0:
                # Continuity medallion: same person throughout, not a new anonymous actor.
                self.show(profile(.32).move_to(c+np.array([-6.3,2.7,0])),ch['start']+.15,.6)
        self.formation();self.novels();self.liga();self.dapitan();self.chronology();self.memory()
        self.tracks.sort(key=lambda row:row[0]);self.evaluate(0,[],None)
    def cue(self,chapter,index):return self.manifest['chapters'][chapter]['start']+self.manifest['chapters'][chapter]['cues'][index]['at']
    def formation(self):
        c=CENTERS[0];a,b,d=[self.cue(0,i) for i in range(3)]
        # Real generalized coastlines; side-by-side panels are NOT world distances.
        philippines,ph=geographic_map(['PHL'],(116,127,5,21),c+[-4.2,-.1,0],4.2,4.6)
        iberia,eu=geographic_map(['ESP','PRT','FRA'],(-11,9,35,52),c+[3.4,0,0],4.5,4.1)
        self.show(philippines,a-.6,1.7);self.show(iberia,a+.5,1.7)
        calamba=location_label(ph(121.165,14.212),'Calamba',[-.7,-.6,0]);manila=location_label(ph(120.984,14.6),'Manila',[-.7,.55,0],BLUE)
        madrid=location_label(eu(-3.704,40.417),'Madrid',[.3,.6,0])
        self.show(calamba,a+.6,1);self.show(manila,a+1.3,1);self.show(madrid,a+2,1)
        ph_title=self.caption('Philippines',c+[-4.25,2.35,0],a+.2,21,BLUE)
        eu_title=self.caption('Spain and neighbors',c+[3.4,2.35,0],a+1,21,BLUE)
        route=path([ph(120.984,14.6),c+[-1.2,1.6,0],c+[.8,1.6,0],eu(-3.704,40.417)],GOLD,2.3)
        self.show(route,a+3,2.4);traveler=profile(.34).move_to(ph(120.984,14.6));self.show(traveler,a+3,.6)
        self.track(a+3.5,3.5,MoveAlongPath(traveler,route))
        route_note=self.caption('Selected journey · panels are not a distance scale',c+[0,-2.95,0],a+4,18,MUTED)
        self.caption('Modern coastlines · not historical borders',c+[0,-3.25,0],a+1.7,18,MUTED)
        self.register('calamba',calamba,0);self.register('education-route',VGroup(route,manila,madrid),0)
        # Keep recognizable geographic anchors as the lens and pen become the focus.
        self.track(b-.5,1.8,Transform(philippines,philippines.copy().scale(.43).move_to(c+[-5.15,1.45,0])),
                   Transform(iberia,iberia.copy().scale(.43).move_to(c+[5.15,1.45,0])),
                   Transform(ph_title,ph_title.copy().scale(.85).move_to(c+[-5.15,2.35,0])),
                   Transform(eu_title,eu_title.copy().scale(.85).move_to(c+[5.15,2.35,0])),
                   FadeOut(calamba),FadeOut(manila),FadeOut(madrid),FadeOut(route),FadeOut(traveler),FadeOut(route_note))
        organ=eye().move_to(c+[-3,-.55,0]);lens=stroke(Ellipse(width=.25,height=1.1).move_to(c+[-1.7,-.55,0]),BLUE,2,.08)
        rays=VGroup(*[stroke(Line(c+[-2.3,-.55+v,0],c+[-1.7,-.55+v,0]),BLUE,1.2) for v in [-.25,0,.25]],*[stroke(Line(c+[-1.7,-.55+v,0],c+[-.75,-.55,0]),BLUE,1.2) for v in [-.25,0,.25]])
        self.show(VGroup(organ,lens),b,1.4);self.show(rays,b+1.5,2);self.caption('Eye care',c+[-2.4,-1.65,0],b+2,24,BLUE)
        quill=pen().move_to(c+[2,-.45,0]);sheet=page().scale(.85).move_to(c+[3,-.8,0]);self.show(quill,b+2.6,1.7);self.show(sheet,b+4,1.3)
        self.caption('Writing',c+[2.4,-1.95,0],b+5,24,GOLD);self.register('medical-lens',VGroup(organ,lens,rays),0);self.register('writing-pen',VGroup(quill,sheet),0)
        self.track(d+1,1.8,Transform(sheet,sheet.copy().scale(1.15).move_to(c+[.6,-.8,0])))
    def novels(self):
        c=CENTERS[1];a,b,d=[self.cue(1,i) for i in range(3)]
        noli=book('NOLI').move_to(c+[-4.4,1.15,0]);fili=book('FILI',PURPLE).move_to(c+[-2.2,1.15,0])
        self.show(noli,a-.1,1.5);self.show(fili,a+2,1.5);self.caption('Berlin · 1887',c+[-4.4,-.05,0],a+1,19,GOLD);self.caption('Ghent · 1891',c+[-2.2,-.05,0],a+3,19,PURPLE)
        self.register('noli',noli,1);self.register('fili',fili,1)
        opening=page().move_to(noli.get_center());self.show(opening,a+5,.5);self.track(a+5.5,1.7,Transform(opening,opening.copy().scale(1.7).move_to(c+[-.1,1.1,0])))
        # An illustrative unequal encounter, kept as concrete content in the page.
        gate=VGroup(stroke(Rectangle(width=1.4,height=1.5),MUTED,2),*[stroke(Line([x,-.7,0],[x,.7,0]),MUTED,1.5) for x in [-.4,0,.4]]).move_to(c+[3.2,.3,0])
        official=person(PURPLE,1.1).move_to(c+[4.5,.1,0]);petitioner=person(BLUE,1).move_to(c+[1.65,-.1,0]);petition=page().scale(.35).move_to(c+[2.2,.15,0])
        link=path([opening.get_right(),c+[1,.9,0],gate.get_top()+UP*.16],INK,1.2)
        self.show(link,b-.1,1.5);self.show(VGroup(gate,official,petitioner,petition),b,2.4)
        self.caption('Filipino petitioner',c+[1.55,-1.05,0],b+1.5,18,BLUE)
        self.caption('Colonial authority',c+[4.5,-1.05,0],b+1.5,18,PURPLE)
        self.caption('Illustrative scene of unequal power',c+[3,1.5,0],b+2.5,18,MUTED)
        self.register('colonial-abuses',VGroup(gate,official,petitioner,petition),1)
        readers=VGroup()
        for j,x in enumerate([-4.6,-1.5,1.6,4.7]):
            group=VGroup(person(BLUE).shift(LEFT*.35),person(BLUE).shift(RIGHT*.35),book('',GOLD).scale(.35).shift(DOWN*.15)).move_to(c+[x,-2,0])
            self.show(group,d+j*.55,1.3);readers.add(group)
            copy=page().scale(.35).move_to(opening.get_center());self.show(copy,d+j*.55,.2)
            curve=path([copy.get_center(),c+[(x-.1)/2,-.2,0],group.get_center()+UP*.45],GOLD,1)
            self.track(d+.3+j*.55,2,MoveAlongPath(copy,curve))
        self.register('readers',readers,1)
        self.caption('Filipino readers shown illustratively · written in Spanish',c+[0,-3.15,0],d+4,18,MUTED)
    def liga(self):
        c=CENTERS[2];a,b,d=[self.cue(2,i) for i in range(3)]
        positions=[np.array([-3+1.65*np.cos(v),.1+1.5*np.sin(v),0]) for v in np.linspace(0,2*np.pi,6,endpoint=False)]
        figures=VGroup(*[person(GREEN if j else BLUE).move_to(c+p) for j,p in enumerate(positions)])
        ring=stroke(Circle(radius=2).move_to(c+[-3,.1,0]),GREEN,1.5)
        self.show(ring,a-.2,1.5);self.show(figures,a,2)
        tasks=VGroup(book().scale(.5).shift(LEFT*.55),stroke(Rectangle(width=.55,height=.45),GREEN,1.5).shift(RIGHT*.55)).move_to(c+[-3,.1,0]);self.show(tasks,a+2,1.3)
        links=VGroup(*[stroke(Line(c+p,c+[-3,.1,0]),GREEN,1) for p in positions]);self.show(links,a+3.5,2)
        self.caption('La Liga Filipina · 3 July 1892',c+[-3,2.35,0],a+.5,21,GREEN)
        self.caption('Unity · mutual aid · reform',c+[-3,-2.5,0],a+4,22,GREEN);self.register('la-liga',VGroup(ring,tasks,links),2)
        rizal=profile(.55).move_to(figures[0].get_center());self.show(rizal,b,.4);self.track(b,.5,FadeOut(figures[0]))
        mapview,ph=geographic_map(['PHL'],(116,127,5,21),c+[.65,.05,0],2.7,4.15)
        self.show(mapview,b+.5,1.7)
        manila=location_label(ph(120.984,14.6),'Manila',[.2,.35,0],BLUE)
        dapitan=location_label(ph(123.417,8.656),'Dapitan',[.2,-.3,0],RED)
        self.show(manila,b+1.2,.8);self.show(dapitan,b+2.2,.8)
        approach=path([rizal.get_center(),c+[-.1,1.4,0],ph(120.984,14.6)],MUTED,1.2)
        deport=path([ph(120.984,14.6),c+[.4,-.4,0],ph(123.417,8.656)],RED,2.2)
        self.show(deport,b+2.3,2);self.track(b+1.2,1.6,MoveAlongPath(rizal,approach));self.track(b+3,2.8,MoveAlongPath(rizal,deport));self.track(b+2,1,links.animate.set_stroke(opacity=.28))
        exile_label=self.caption('Exiled · July 1892',c+[.6,-2.6,0],b+3,20,RED);self.register('exile-route',VGroup(deport,rizal,mapview,manila,dapitan),2)
        map_center=mapview.get_center();thumbnail=c+[.55,-2.08,0]
        destination=thumbnail+(ph(123.417,8.656)-map_center)*.32
        self.track(d-.5,1.2,Transform(mapview,mapview.copy().scale(.32).move_to(thumbnail)),
                   FadeOut(manila),FadeOut(dapitan),FadeOut(deport),FadeOut(rizal),FadeOut(exile_label))
        pin=Dot(destination,radius=.045).set_color(RED);self.show(pin,d+.8,.5)
        self.caption('Dapitan · Mindanao',c+[.55,-3.05,0],d+.9,18,RED)
        # One member is shared; the organizational boundary is explicitly separate.
        boni=person(GOLD,1.1).move_to(c+[-1.5,-1,0]);self.show(boni,d,.5)
        bonilabel=self.caption('Bonifacio',c+[-1.5,-1.8,0],d+.2,19,GOLD)
        kat=stroke(Circle(radius=1.35).move_to(c+[3.2,.9,0]),RED,2)
        self.show(kat,d+1.2,1.4);self.caption('KATIPUNAN',c+[3.2,1.15,0],d+2,23,RED)
        others=VGroup(*[person(RED,.8).move_to(c+[x,.2,0]) for x in [2.5,3.2,3.9]]);self.show(others,d+2.4,1.4)
        self.track(d+1.5,2.4,Transform(boni,boni.copy().move_to(c+[3.2,-.4,0])),Transform(bonilabel,bonilabel.copy().move_to(c+[3.2,-1.25,0])))
        self.caption('Separate revolutionary society',c+[3.2,2.45,0],d+3,20,RED)
        self.register('bonifacio',boni,2);self.register('katipunan',VGroup(kat,others),2)
    def dapitan(self):
        c=CENTERS[3];a,b,d=[self.cue(3,i) for i in range(3)]
        coast=path([c+[-6,-2.8,0],c+[-3,-2.5,0],c+[0,-2.7,0],c+[3,-2.55,0],c+[6,-2.75,0]],BLUE,1.4)
        self.show(coast,a-.3,2.5);hut=house().scale(1.3).move_to(c+[-4.6,.35,0]);self.show(hut,a+.4,2)
        self.caption('Dapitan · four years of exile',c+[0,2.2,0],a+1,26,BLUE);self.register('dapitan',VGroup(hut,coast),3)
        self.track(b-.5,1.4,Transform(hut,hut.copy().scale(.48).move_to(c+[-5.65,1.45,0])))
        clinic=VGroup(house(BLUE),stroke(Line([-.15,.1,0],[.15,.1,0]),BLUE,3),stroke(Line([0,-.05,0],[0,.25,0]),BLUE,3)).move_to(c+[-3.7,-.1,0])
        patients=VGroup(person().move_to(c+[-4.4,-1.2,0]),profile(.5).move_to(c+[-3.2,-1.2,0]),eye().scale(.45).move_to(c+[-3.8,-.45,0]))
        self.show(VGroup(clinic,patients),b,2);self.caption('patient',c+[-4.4,-1.83,0],b+1.2,16,INK);self.caption('Rizal · doctor',c+[-3.05,-1.83,0],b+1.2,16,BLUE)
        self.caption('Medicine',c+[-3.7,-2.35,0],b+1.5,22,BLUE);self.register('clinic',VGroup(clinic,patients),3)
        school=VGroup(stroke(Polygon([-.9,.4,0],[0,1,0],[.9,.4,0]),GOLD,2),stroke(Line([-.75,.4,0],[-.75,-.4,0]),GOLD,2),stroke(Line([.75,.4,0],[.75,-.4,0]),GOLD,2),book().scale(.45)).move_to(c+[0,.2,0])
        pupils=VGroup(*[person(GOLD,.65).move_to(c+[x,-1.1,0]) for x in [-.6,0,.6]])
        self.show(VGroup(school,pupils),b+2,2);self.caption('Teaching',c+[0,-2,0],b+3,22,GOLD);self.register('school',VGroup(school,pupils),3)
        homes=VGroup(*[house(GREEN).scale(.65).move_to(c+[x,y,0]) for x,y in [(3.2,.2),(4.9,.2),(4,-1.1)]])
        self.show(homes,d,1.8)
        source=stroke(Circle(radius=.25).move_to(c+[1.5,1.6,0]),BLUE,2,.18);self.show(source,d,.8)
        channel=path([c+[1.5,1.6,0],c+[2.1,1.2,0],c+[2.4,.6,0],c+[3.4,.7,0],c+[4.8,.65,0]],BLUE,3)
        branch=path([c+[3.6,.7,0],c+[3.65,-.4,0],c+[4,-.6,0]],BLUE,2.3)
        self.show(channel,d+.7,3);self.show(branch,d+2.8,1.6)
        for j in range(4):
            dot=Dot(radius=.045).set_color(BLUE);self.add(dot);self.water_dots.append((dot,channel,d+.8,j*.2))
        self.caption('Waterworks',c+[4,-2.1,0],d+3,22,GREEN)
        self.caption('Village and channel are schematic',c+[0,-3.25,0],d+4,18,MUTED)
        self.register('waterworks',VGroup(homes,source,channel,branch),3)
    def chronology(self):
        c=CENTERS[4];a,b,d=[self.cue(4,i) for i in range(3)]
        for y,color in [(1.05,RED),(-1.1,BLUE)]:
            self.show(stroke(Line(c+[-5.7,y,0],c+[5.7,y,0]),color,1.5),a-.2,2)
        self.caption('Revolution',c+[-4.2,.55,0],a,22,RED);self.caption('Rizal',c+[-4.6,-1.95,0],a,22,BLUE)
        for i,month in enumerate(['Aug','Sep','Oct','Nov','Dec']):
            x=-5.2+i*2.6
            self.show(stroke(Line(c+[x,-1.3,0],c+[x,1.35,0]),MUTED,.6),a+.4+i*.15,1)
            self.caption(month+' 1896' if i==0 else month,c+[x,2.25,0],a+.5+i*.15,19,MUTED)
        uprising=flame().scale(.6).move_to(c+[-5.2,1.1,0]);self.show(uprising,a+.8,1.1)
        underway=stroke(Arrow(c+[-4.8,1.1,0],c+[5.5,1.1,0],buff=0),RED,3);self.show(underway,a+2.2,4)
        self.register('revolution-august',VGroup(uprising,underway),4)
        jail=VGroup(*[stroke(Line(c+[x,-1.55,0],c+[x,-.6,0]),MUTED,1.4) for x in [-2.8,-2.5,-2.2]],profile(.45).move_to(c+[-2.5,-1.15,0]));self.show(jail,a+3,1.5)
        marker=stroke(Circle(radius=.35).move_to(c+[5.2,-1.1,0]),RED,2.5,.12);self.show(marker,b,1.2)
        self.caption('30 Dec · execution',c+[4.4,-2.05,0],b+.4,22,RED)
        self.caption('Bagumbayan · Manila',c+[4.25,-2.55,0],b+1.4,18,MUTED)
        vertical=stroke(DashedLine(c+[5.2,-.65,0],c+[5.2,1.6,0]),GOLD,1.7);self.show(vertical,b+2,1.2)
        self.register('execution-december',VGroup(marker,vertical),4)
        wrong=stroke(Arrow(c+[4.9,-.65,0],c+[-4.7,.75,0],buff=0),MUTED,1.5)
        self.show(wrong,d,.9);claim=self.caption('Did this START that?',c+[.1,-.65,0],d,21,MUTED)
        cross=VGroup(stroke(Line(c+[-.25,-.15,0],c+[.25,.35,0]),RED,3),stroke(Line(c+[-.25,.35,0],c+[.25,-.15,0]),RED,3));self.show(cross,d+1.5,.65)
        self.caption('Already underway before his death',c+[.2,1.58,0],d+2.2,24,GOLD)
        self.register('chronology-test',VGroup(wrong,cross,claim),4)
        mini=book().scale(.45).move_to(c+[-4.9,-2.6,0]);self.show(mini,d+4,1)
        label=self.caption('Influence ≠ military command',c+[-1,-2.8,0],d+4.5,21,GOLD);self.register('influence',VGroup(mini,label),4)
    def memory(self):
        c=CENTERS[5];a,b,d=[self.cue(5,i) for i in range(3)]
        pedestal=VGroup(stroke(Rectangle(width=1.9,height=.35).shift(DOWN*1.05),MUTED,2,.15),stroke(Rectangle(width=1.1,height=.9).shift(DOWN*.45),MUTED,2,.12),profile(.7).shift(UP*.55)).move_to(c+[0,.4,0])
        self.show(pedestal,a-.2,2);self.register('monument',pedestal,5)
        evidence=VGroup(eye().scale(.65).move_to(c+[-4.8,1.1,0]),book('NOLI').scale(.65).move_to(c+[-2.5,1.2,0]),VGroup(*[person(GREEN,.7).shift(RIGHT*x) for x in [-.4,0,.4]]).move_to(c+[2.5,1.1,0]),simple_house(GREEN).scale(.75).move_to(c+[4.9,1.1,0]))
        for j,mob in enumerate(evidence):
            small=mob.copy().scale(.05).move_to(pedestal.get_center());self.add(small);self.track(a+2+j*.4,1.5,Transform(small,mob));
        for x,label in [(-4.8,'Medicine'),(-2.5,'Writing'),(2.5,'Civic work'),(4.9,'Service')]:self.caption(label,c+[x,-.05,0],a+4,18,MUTED)
        self.register('contributions',evidence,5)
        # A law opens a new channel of transmission; it does not create the prior life.
        law=page().scale(1.25).move_to(c+[-4,-1.8,0]);self.show(law,b,1.2)
        lawlabel=self.caption('RA 1425 · 1956',c+[-4,-2.8,0],b+1,21,GOLD);self.register('rizal-law',VGroup(law,lawlabel),5)
        desks=VGroup();books=VGroup()
        for j,x in enumerate([-1.8,-.5,.8,2.1,3.4,4.7]):
            table=stroke(Line(c+[x-.4,-2.25,0],c+[x+.4,-2.25,0]),MUTED,2)
            pupil=person(INK,.7).move_to(c+[x,-1.5,0]);self.show(VGroup(table,pupil),b+1+j*.18,1)
            reading=book().scale(.3).move_to(c+[x,-1.95,0]);books.add(reading)
            copied=book().scale(.3).move_to(c+[-2.5,1.2,0]);self.add(copied);self.track(d+j*.25,1.6,Transform(copied,reading))
            desks.add(VGroup(table,pupil,copied))
        self.caption('New generations encounter the same works',c+[1.35,-2.85,0],d+2,21,GOLD)
        self.register('legacy-books',desks,5)
    def evaluate(self,t,selected,camera):
        super().evaluate(t,selected,camera)
        for dot,channel,start,phase in self.water_dots:
            active=t>=start
            dot.set_opacity(1 if active else 0)
            if active:dot.move_to(channel.pfp(((t-start)*.17+phase)%1))
        focus=self.settings.get('focus','')
        if focus and camera is None:
            objects=[m for m,p in self.roles.get(focus,[]) if p==self.chapter_at(t)]
            if objects:
                group=VGroup(*objects);self.frame.move_to(group.get_center()).set_width(max(4.5,min(15,group.get_width()*1.6)))
