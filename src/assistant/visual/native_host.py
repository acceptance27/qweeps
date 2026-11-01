"""Local process bridge for actual ManimGL frames and semantic hit regions."""
from __future__ import annotations
import json
import hashlib
import os
from pathlib import Path
import subprocess
import threading
import time
import uuid
import shutil
from .plan import PlanError, validate_plan
from .production import experiment


class NativeHost:
    def __init__(self,studio):
        self.studio=Path(studio);self.jobs={};self.lock=threading.RLock()
        default_interp=Path.home()/'.local/share/qweeps/visual-venv/bin/python' if not (Path.home()/'.local/share/omarchy-assistant/visual-venv/bin/python').is_file() else Path.home()/'.local/share/omarchy-assistant/visual-venv/bin/python'
        self.interpreter=Path(os.environ.get('QWEEPS_MANIMGL_PYTHON',str(default_interp)))
        self.report=json.loads((self.studio/'public/production/report.json').read_text()) if (self.studio/'public/production/report.json').exists() else None
    def ensure(self,sid,lesson_id=None,plan=None):
        with self.lock:
            plan_hash=hashlib.sha256(json.dumps(plan,sort_keys=True).encode()).hexdigest() if plan is not None else None
            if sid in self.jobs and self.jobs[sid]['process'].poll() is None:
                if lesson_id is None or (self.jobs[sid].get('lesson_id','manim_production')==lesson_id and self.jobs[sid].get('plan_hash')==plan_hash):return self.jobs[sid]
                self.close(sid)
            lesson_id=lesson_id or 'manim_production'
            if lesson_id not in {'manim_production','jose_rizal','alu','generated','wbc','blood3d'}:raise PlanError('Unknown native lesson')
            manifest_path=self.studio/('public/lessons/alu.json' if lesson_id=='alu' else 'public/lessons/jose_rizal.json' if lesson_id=='jose_rizal' else 'public/lessons/wbc_native.json' if lesson_id=='wbc' else 'public/lessons/blood3d_native.json' if lesson_id=='blood3d' else 'public/production/report.json')
            if lesson_id=='generated':
                if plan is None:raise PlanError('Generated lesson plan is missing')
                manifest=plan
            else:
                if not manifest_path.exists():raise PlanError('Native lesson is not prepared')
                manifest=json.loads(manifest_path.read_text())
            if not self.interpreter.exists():raise PlanError('The native ManimGL runtime is unavailable.')
            if self.report is None:raise PlanError('Production measurements are unavailable.')
            active=[j for j in self.jobs.values() if j['process'].poll() is None]
            if len(active)>=3:
                idle=min(active,key=lambda j:j['seen'])
                if time.monotonic()-idle['seen']<60:raise PlanError('Three native renderer sessions are already active. Close one to continue.')
                idle_sid=next(key for key,value in self.jobs.items() if value is idle)
                self.close(idle_sid)
            default_cache=Path.home()/'.cache/qweeps' if not (Path.home()/'.cache/omarchy-assistant').is_dir() else Path.home()/'.cache/omarchy-assistant'
            root=Path('/dev/shm') if Path('/dev/shm').is_dir() else default_cache
            folder=root/f'qweeps-manim-{uuid.uuid4().hex}'
            folder.mkdir(parents=True)
            if lesson_id=='generated':
                manifest_path=folder/'plan.json'
                manifest_path.write_text(json.dumps(manifest))
            env={k:v for k,v in os.environ.items() if not any(term in k.upper() for term in ['API_KEY','SECRET','ACCESS_TOKEN'])}
            env['PYTHONPATH']=str(Path(__file__).resolve().parents[2])
            env['QWEEPS_RIZAL_GEOGRAPHY']=str(self.studio/'lessons/jose_rizal/assets/natural-earth-50m.json')
            with (folder/'worker.log').open('wb') as log:
                process=subprocess.Popen([str(self.interpreter),'-m','assistant.visual.native_live',str(folder),str(manifest_path),str(self.studio/'public/production/stopwatch.svg'),lesson_id],stdin=subprocess.PIPE,stdout=log,stderr=log,env=env,cwd=folder)
            job={'lesson_id':lesson_id,'plan_hash':plan_hash,'manifest':manifest,'process':process,'folder':folder,'seen':time.monotonic(),'last':None,'lock':threading.Lock()};self.jobs[sid]=job
            return job
    def update(self,sid,raw):
        if not isinstance(raw,dict):raise PlanError('Native state must be an object')
        lesson_id=raw.get('lessonId','manim_production')
        if lesson_id not in {'manim_production','jose_rizal','alu','generated','wbc','blood3d'}:raise PlanError('Unknown native lesson')
        plan=validate_plan(raw.get('plan')) if lesson_id=='generated' else None
        limit=120
        if lesson_id=='jose_rizal':
            from .rizal import settings as rizal_settings
            manifest=json.loads((self.studio/'public/lessons/jose_rizal.json').read_text())
            settings=rizal_settings(manifest,raw.get('experiment'));limit=manifest['duration']
        elif lesson_id=='alu':
            manifest=json.loads((self.studio/'public/lessons/alu.json').read_text())
            from .alu_live import ALU_DEFAULTS
            raw_exp = raw.get('experiment')
            settings = raw_exp if isinstance(raw_exp, dict) else ALU_DEFAULTS
            limit=manifest['duration']
        elif lesson_id=='generated':
            if raw.get('experiment') not in (None,{}):raise PlanError('Unsupported generated experiment')
            settings={};limit=sum(b['duration'] for b in plan['beats'])
        elif lesson_id=='wbc':
            if raw.get('experiment') not in (None,{}):raise PlanError('This beat has no experiment controls')
            settings={};limit=json.loads((self.studio/'public/lessons/wbc_native.json').read_text())['duration']
        elif lesson_id=='blood3d':
            if raw.get('experiment') not in (None,{}):raise PlanError('This beat has no experiment controls')
            settings={};limit=json.loads((self.studio/'public/lessons/blood3d_native.json').read_text())['duration']
        else:settings=experiment(self.report,raw.get('experiment'))
        t=raw.get('time',0)
        if isinstance(t,bool) or not isinstance(t,(float,int)) or not 0<=t<=limit:raise PlanError('Invalid native playhead')
        selected=raw.get('selected',[])
        if not isinstance(selected,list) or len(selected)>80 or any(not isinstance(i,str) or len(i)>120 for i in selected):raise PlanError('Invalid native selection')
        camera=raw.get('camera')
        if camera is not None:
            if not isinstance(camera,dict):raise PlanError('Invalid native camera')
            for key,lo,hi,default in [('x',-100,100,0),('y',-100,100,0),('zoom',.3,3,1)]:
                v=camera.get(key,default)
                if isinstance(v,bool) or not isinstance(v,(int,float)) or not lo<=v<=hi:raise PlanError('Invalid native camera')
        job=self.ensure(sid,lesson_id,plan)
        state={'lessonId':lesson_id,'time':t,'experiment':settings,'selected':selected,'camera':camera}
        encoded=json.dumps(state)
        with job['lock']:
            job['seen']=time.monotonic()
            if job['process'].poll() is not None:raise PlanError('Native renderer stopped: '+self.error(job))
            if encoded!=job['last']:
                job['revision']=hashlib.sha256(encoded.encode()).hexdigest()[:24]
                try:
                    job['process'].stdin.write((json.dumps({**state,'revision':job['revision']})+'\n').encode())
                    job['process'].stdin.flush()
                except (BrokenPipeError,OSError) as exc:
                    raise PlanError('Native renderer disconnected') from exc
                job['last']=encoded
        return {**self.status(sid),'expectedRevision':job.get('revision')}
    def error(self,job):
        path=job['folder']/'error.txt'
        return path.read_text()[-500:] if path.exists() else (job['folder']/'worker.log').read_text(errors='replace')[-700:]
    def status(self,sid):
        job=self.jobs.get(sid)
        if not job:return {'ready':False}
        path=job['folder']/'state.json'
        if job['process'].poll() is not None:raise PlanError('Native renderer stopped: '+self.error(job))
        if path.exists():return {'ready':True,**json.loads(path.read_text())}
        return {'ready':False,'backend':'ManimGL/OpenGL'}
    def close(self,sid):
        with self.lock:
            job=self.jobs.pop(sid,None)
            if job:
                process=job['process']
                if process.poll() is None:
                    process.terminate()
                    try:process.wait(timeout=2)
                    except subprocess.TimeoutExpired:process.kill();process.wait(timeout=2)
                shutil.rmtree(job['folder'],ignore_errors=True)
