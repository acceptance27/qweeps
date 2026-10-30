import json
from unittest.mock import Mock,patch
from pathlib import Path
from assistant.visual.browser_rizal import reply

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=json.loads((ROOT/'visual-studio/public/lessons/rizal_live.json').read_text())

def test_live_branch_uses_the_model_and_preserves_paused_context_without_native_rendering():
 model=Mock(spec=['compose']);model.compose.return_value=json.dumps({'answer':'The earlier uprising rules out that proposed order.',
  'nativeBranch':{'chapter':4,'focus':'chronology-test','visualReason':'Compare the August and December dates.'}})
 context={'sceneId':'rizal_live','time':98,'selection':['exile-route'],'camera':{'zoom':1.4},'region':{'x1':1,'x2':2}}
 result=reply(model,'Did his execution start the revolution?',context,[],MANIFEST,'branch',[])
 assert 'nativeBranch' not in result
 assert result['browserBranch']=={'lessonId':'rizal_live','chapter':4,'focus':'chronology-test','visualReason':'Compare the August and December dates.'}
 sent=json.loads(model.compose.call_args.args[0])
 assert sent['paused']['time']==98 and sent['paused']['selection']==['exile-route']

def test_browser_questions_reach_the_live_route_and_never_request_native_frames():
 from assistant.visual.server import VisualService
 from assistant.config import Config
 model=Mock(spec=['compose']);model.compose.return_value=json.dumps({'answer':'A military court convicted him.','scene':None})
 with patch('assistant.visual.server.manim_python',return_value=None),patch('assistant.visual.research.gather',return_value=[]):
  service=VisualService(cfg=Config(),llm=model);sid,_=service.session()
  service.native=Mock()
  result=service.ask({'sessionId':sid,'mode':'question','question':'Why was Rizal executed?','context':{'sceneId':'rizal_live','time':10,'selection':[]}})
  assert result['answer']=='A military court convicted him.'
  assert not service.native.mock_calls

def test_broad_rizal_history_request_opens_the_authored_live_lesson():
 from assistant.visual.runner import VisualRunner
 with patch('assistant.visual.runner.ensure_studio_server'),patch('shutil.which',return_value='/usr/bin/omarchy-launch-webapp'),patch('assistant.visual.runner.subprocess.Popen') as launch:
  assert VisualRunner().launch_studio('Explain Jose Rizal history')
  url=launch.call_args.args[0][1]
  assert 'scene=rizal_live' in url and 'topic=' not in url

def test_browser_branch_uses_the_adapted_storyboard_not_the_old_native_manifest():
 from assistant.visual.server import VisualService
 from assistant.config import Config
 model=Mock(spec=['compose']);model.compose.return_value=json.dumps({'answer':'Gomburza refers to the three priests.',
  'nativeBranch':{'chapter':0,'focus':'gomburza','visualReason':'See their names and the 1872 date.'}})
 with patch('assistant.visual.server.manim_python',return_value=None),patch('assistant.visual.research.gather',return_value=[]):
  service=VisualService(cfg=Config(),llm=model);sid,_=service.session();service.native=Mock()
  result=service.ask({'sessionId':sid,'mode':'branch','question':'Who were Gomburza?',
   'context':{'sceneId':'rizal_live','time':60,'selection':['education-route']}})
  assert result['browserBranch']['focus']=='gomburza'
  assert not service.native.mock_calls
