import json
import os
from pathlib import Path
import socket
import subprocess
import time
import urllib.request
import urllib.error
import pytest
from assistant.visual.architecture_remix import handles

ROOT=Path(__file__).resolve().parents[1]

def test_backend_proxy_accepts_only_its_explicit_routes():
 assert handles('/api/ai/ask')
 assert handles('/api/architecture/walkthroughs/'+'a'*32)
 for path in ['/api/visual/settings','/api/architecture/walkthroughs/../../.env','/api/ai/not-a-route','https://elsewhere/api/ai/status']:assert not handles(path)

@pytest.fixture(scope='module')
def backend(tmp_path_factory):
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 folder=tmp_path_factory.mktemp('architecture-remix')
 env={**os.environ,'GEMINI_API_KEY':'','GOOGLE_API_KEY':'','QWEEPS_ARCHITECTURE_API_ONLY':'1','QWEEPS_ARCHITECTURE_PORT':str(port),'QWEEPS_WALKTHROUGH_DIR':str(folder)}
 process=subprocess.Popen([str(ROOT/'node_modules/.bin/tsx'),'server.ts'],cwd=ROOT/'vendor/architecture-remix',env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 base=f'http://127.0.0.1:{port}'
 try:
  for _ in range(150):
   try:urllib.request.urlopen(base+'/api/ai/status',timeout=.2);break
   except urllib.error.URLError:
    if process.poll() is not None:raise AssertionError('Copied architecture backend stopped')
    time.sleep(.05)
  else:raise AssertionError('Copied architecture backend did not start')
  yield base
 finally:process.terminate();process.wait(timeout=10)

def post(base,path,payload):
 return urllib.request.urlopen(urllib.request.Request(base+path,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'}),timeout=5)

def test_gemini_setup_reports_missing_credentials_without_claiming_ai_success(backend):
 status=json.load(urllib.request.urlopen(backend+'/api/ai/status'))
 assert status['ready'] is False and status['model']=='gemini-3.8-flash'
 with pytest.raises(urllib.error.HTTPError) as error:post(backend,'/api/ai/ask',{'question':'Explain this request'})
 assert error.value.code==500
 assert 'error' in json.load(error.value)

def test_compiled_walkthroughs_save_and_reload_without_changing_the_bundle(backend):
 bundle={'id':'fixture','title':'Saved pipeline','sourceCode':'def run(request): return request','sampleInput':'hello','macroGraph':{'nodes':[{'id':'input'}],'edges':[]},'macroSteps':[{'id':'start','duration':5}],'subFunctions':{},'customPreservedField':{'value':17}}
 result=json.load(post(backend,'/api/architecture/walkthroughs',{'bundle':bundle}))
 saved=json.load(urllib.request.urlopen(backend+'/api/architecture/walkthroughs/'+result['id']))
 assert saved['bundle']==bundle
 catalog=json.load(urllib.request.urlopen(backend+'/api/architecture/walkthroughs'))
 assert catalog['walkthroughs'][0]['id']==result['id']
 assert catalog['walkthroughs'][0]['duration']==5
 with pytest.raises(urllib.error.HTTPError) as error:post(backend,'/api/architecture/walkthroughs',{'bundle':{'title':'Incomplete'}})
 assert error.value.code==400
