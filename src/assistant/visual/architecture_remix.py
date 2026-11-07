"""Host the complete supplied Node architecture backend behind QWEEPS' local API."""
from __future__ import annotations
import atexit
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parents[3]
_lock=threading.Lock()
_process=None
_port=int(os.environ.get('QWEEPS_ARCHITECTURE_PORT','4175'))
_routes=re.compile(r'^/api/(?:ai/(?:status|fill-gaps|ask)|repo/scan-github|architecture/walkthroughs(?:/[a-f0-9]{32})?)$')

def handles(path):return bool(_routes.fullmatch(path))

def _stop():
    if _process is not None and _process.poll() is None:_process.terminate()
atexit.register(_stop)

def _ensure_started():
    global _process
    with _lock:
        if _process is not None and _process.poll() is None:return
        node=shutil.which('node');executable=ROOT/'node_modules/tsx/dist/cli.mjs'
        if not node or not executable.exists():raise RuntimeError('Install Node.js and run npm install for the supplied architecture backend.')
        logs=Path.home()/'.cache/qweeps';logs.mkdir(parents=True,exist_ok=True)
        env={**os.environ,'QWEEPS_ARCHITECTURE_PORT':str(_port),'QWEEPS_ARCHITECTURE_API_ONLY':'1'}
        with (logs/'architecture-remix.log').open('a') as log:
            _process=subprocess.Popen([node,str(executable),'server.ts'],cwd=ROOT/'vendor/architecture-remix',env=env,stdout=log,stderr=log)
        for _ in range(80):
            if _process.poll() is not None:raise RuntimeError('The architecture backend stopped; check ~/.cache/qweeps/architecture-remix.log.')
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{_port}/api/ai/status',timeout=.3):return
            except (OSError,urllib.error.URLError):time.sleep(.1)
        raise RuntimeError('The architecture backend did not start in time.')

def request(method,path,payload=None):
    if not handles(path):raise ValueError('Unknown architecture API route')
    _ensure_started()
    data=json.dumps(payload).encode() if payload is not None else None
    req=urllib.request.Request(f'http://127.0.0.1:{_port}'+path,data=data,headers={'Content-Type':'application/json'},method=method)
    try:
        with urllib.request.urlopen(req,timeout=300) as response:return response.status,json.load(response)
    except urllib.error.HTTPError as exc:
        try:body=json.load(exc)
        except ValueError:body={'error':f'Architecture backend returned HTTP {exc.code}'}
        return exc.code,body
