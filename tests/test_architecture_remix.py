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

def test_opencode_setup_reports_missing_credentials_without_claiming_ai_success(backend):
 status=json.load(urllib.request.urlopen(backend+'/api/ai/status'))
 assert status['ready'] is False and status['model']=='opencode-go/muse-spark-1.3-contributor'
 assert status['provider']=='opencode-go'
 with pytest.raises(urllib.error.HTTPError) as error:post(backend,'/api/ai/ask',{'question':'Explain this request'})
 assert error.value.code==500
 assert 'QWEEPS Settings / API' in json.load(error.value)['error']

def test_proxy_uses_current_shared_go_settings_without_changing_payload(monkeypatch):
 from types import SimpleNamespace
 from unittest.mock import Mock
 from assistant.visual import architecture_remix as remix
 cfg=SimpleNamespace(llm=SimpleNamespace(visual_model='opencode-go/qwen3.8-flash',model='unused'),secret=lambda name:'shared-go-key')
 captured=[]
 def respond(request,**kwargs):
  captured.append(request)
  response=Mock()
  response.__enter__=Mock(return_value=response)
  response.__exit__=Mock(return_value=False)
  response.status=200
  response.read.return_value=b'{"answer":"ok"}'
  return response
 monkeypatch.setattr(remix,'_ensure_started',lambda:None)
 monkeypatch.setattr(remix.urllib.request,'urlopen',respond)
 payload={'question':'Keep the exact question','sourceCode':'def run(x): return x'}
 assert remix.request('POST','/api/ai/ask',payload,cfg=cfg)==(200,{'answer':'ok'})
 assert captured[-1].get_header('Authorization')=='Bearer shared-go-key'
 assert captured[-1].get_header('X-qweeps-ai-model')=='opencode-go/qwen3.8-flash'
 assert json.loads(captured[-1].data)==payload
 cfg.llm.visual_model='opencode-go/muse-spark-1.3-contributor'
 remix.request('GET','/api/ai/status',cfg=cfg)
 assert captured[-1].get_header('X-qweeps-ai-model')==cfg.llm.visual_model
 remix.request('POST','/api/architecture/walkthroughs',{},cfg=cfg)
 assert captured[-1].get_header('Authorization') is None

def test_status_identifies_go_model_without_exposing_credentials(backend):
 request=urllib.request.Request(backend+'/api/ai/status',headers={'Authorization':'Bearer test-secret','X-Qweeps-AI-Model':'opencode-go/qwen3.8-flash'})
 status=json.load(urllib.request.urlopen(request))
 assert status['ready'] is True and status['model']=='opencode-go/qwen3.8-flash'
 assert 'test-secret' not in json.dumps(status)

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
