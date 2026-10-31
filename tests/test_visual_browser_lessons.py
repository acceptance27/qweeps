import base64
import copy
import json
from pathlib import Path
import struct
import time
import zlib
from unittest.mock import Mock,patch
import pytest
from assistant.visual.browser_lessons import BrowserLessonStore,validate_lesson,validate_presentation_review
from assistant.visual.documents import DocumentLibrary
from assistant.visual.plan import PlanError

STUDIO=Path(__file__).resolve().parents[1]/'visual-studio'

def sample():
 def chapter(id,layout,page):return {'id':id,'title':'Compare protections' if page==1 else 'Inspect the dependency','question':'What changes in this example?',
  'insight':'Expression and secrecy protect different assets.' if page==1 else 'An audit connects a component to its actual conditions.',
  'continuity':{'from':None if page==1 else 'protection','bridge':'Identify the assets in one project.' if page==1 else 'Knowing the asset type leaves its permitted use to check.'},
  'presentation':{'method':'Aligned comparison' if page==1 else 'Worked dependency trace','why':'Identify the assets before examining their permission conditions.','visualEvidence':'Compare the named material, then connect the inventory to its notice.','textMode':'descriptive'},
  'teaching':'comparison' if page==1 else 'procedure','sourcePages':[page],'layout':layout,'nodes':[{'id':'code' if page==1 else 'inventory','title':'Source code' if page==1 else 'Inventory','body':'Identify the concrete material before deciding which conditions apply.','icon':'code' if page==1 else 'package','color':'blue','at':1,'tag':''},
   {'id':'secret' if page==1 else 'notice','title':'Confidential information' if page==1 else 'Retain the notice','body':'Follow the actual requirement in the supplied source, preserving its qualifications.','icon':'lock' if page==1 else 'document','color':'gold','at':5,'tag':''}],
  'connections':[] if page==1 else [{'from':'inventory','to':'notice','label':'inspect terms'}],'takeaway':'Use the actual terms and the stated facts.','safeguard':'Illustrative example, not an invented legal verdict.','duration':25,'narration':'Follow one project and compare the source material with the requirement. The visible relationship explains this step.'}
 draft={'title':'A source-grounded lesson','question':'Teach this module','representation':'Comparison followed by a worked audit process.','example':{'title':'A small software project','description':'Track one component and the conditions that apply.','icon':'app'},'chapters':[chapter('protection','comparison',1),chapter('audit','process',2)]}
 for c in draft['chapters']:c['narration']=c['continuity']['bridge']+' '+c['narration']
 story={k:copy.deepcopy(v) for k,v in draft.items() if k!='chapters'};story['beats']=[{**c,'visibleOperation':'Compare the assets, then connect the material to its condition.'} for c in draft['chapters']]
 return story,draft

@pytest.fixture
def library(tmp_path):
 lib=DocumentLibrary(tmp_path/'documents');d={'id':'a'*32,'title':'Module 12: Project Rights','filename':'Module_12.pdf','aliases':['Module 12'],'pageCount':2,'pages':[{'page':1,'text':'Copyright concerns expression. Trade secrets depend on keeping information confidential.'},{'page':2,'text':'An audit inventories components and their terms. Appendix C is referenced but not included.'}]}
 f=lib.folder/d['id'];f.mkdir();(f/'document.json').write_text(json.dumps(d));(f/'source.pdf').write_bytes(b'%PDF-1.4\n')
 return lib,d

class Model:
 def __init__(self,fail_direction=False,approve=True):self.calls=[];self.image_calls=[];self.fail_direction=fail_direction;self.approve=approve
 def compose(self,text,system=''):
  r=json.loads(text);self.calls.append(r);story,draft=sample()
  if r.get('narrativeReview'):return json.dumps({'approved':True,'findings':[],'links':[{'from':a['id'],'to':b['id'],'connected':True,'connection':'The asset comparison motivates checking its actual conditions.','quote':b['narration'].split('.')[0]} for a,b in zip(r['chapters'],r['chapters'][1:])]})
  if r.get('sourceRepair'):return json.dumps({'patches':[{'op':'replace','path':'/chapters/0/safeguard','value':'Retain the source qualification; no guaranteed verdict.'}]})
  if r.get('sourceReview'):return json.dumps({'approved':True,'findings':[],'checks':[{'beat':c['id'],'supported':True,'sourcePages':c['sourcePages'],'evidence':'The source qualification is retained.'} for c in r['chapters']]})
  if 'passages' in r:return json.dumps({'answer':'The source describes an audit on page 2; the referenced appendix is absent.'})
  if 'storyboard' in r:
   if self.fail_direction:raise RuntimeError('simulated provider timeout')
   if r.get('previousDirectedSection'):return json.dumps(r['previousDirectedSection'])
   ids={b['id'] for b in r['storyboard']['beats']};draft['chapters']=[c for c in draft['chapters'] if c['id'] in ids];return json.dumps(draft)
  return json.dumps(story)
 def review_images(self,instruction,frames):
  self.image_calls.append(frames)
  return json.dumps({'approved':self.approve,'findings':[] if self.approve else [{'beat':'protection','problem':'Required text overlaps.','revision':'Separate the text and icon.'}],'observations':['The assets are compared with descriptions.','The audit has a labeled relationship.'],'presentationChecks':[{'beat':id,'methodFits':True,'evidenceVisible':True,'textSupports':True,'observation':'Named objects and the relationship support this step with useful descriptions.'} for id in ['protection','audit']]})

def await_state(store,id,status):
 deadline=time.monotonic()+4
 while time.monotonic()<deadline:
  result=store.status(id)
  if result['status'] in status:return result
  time.sleep(.015)
 raise AssertionError(store.status(id))

def image_bytes():
 def chunk(type,data):return struct.pack('!I',len(data))+type+data+struct.pack('!I',zlib.crc32(type+data)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',1280,400,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+b'\x07\x11\x17'*1280)*400))+chunk(b'IEND',b'')

def frames(candidate):return [{'chapter':i,'position':position,'time':c['finishedAt'] if position=='finished' else c['start']+3,'base64':base64.b64encode(image_bytes()).decode()} for i,c in enumerate(candidate['chapters']) for position in ['early','finished']]

def test_document_resolution_requires_a_real_unambiguous_source(library):
 lib,d=library
 assert lib.resolve('Teach me MODULE12')['id']==d['id']
 with pytest.raises(PlanError,match='Attach or import'):lib.resolve('Teach me Module 99')
 other={**d,'id':'b'*32};p=lib.folder/other['id'];p.mkdir();(p/'document.json').write_text(json.dumps(other))
 with pytest.raises(PlanError,match='More than one'):lib.resolve('Teach me Module 12')

def test_extraction_uses_page_boundaries_and_argument_lists(library):
 lib,_=library
 with patch('assistant.visual.documents.shutil.which',return_value='/usr/bin/pdftotext'),patch('assistant.visual.documents.subprocess.run') as run:
  run.side_effect=[Mock(returncode=0,stdout='First page has enough substantive source material for the lesson. '*3+'\f'+'Second page contains the source qualifications and original conditions. '*3+'\f'),Mock(stdout='Title: Module 27: Another Subject\n')]
  doc=lib.ingest({'filename':'Module_27.pdf','base64':base64.b64encode(b'%PDF-1.4\nsource').decode()})
  assert doc['pageCount']==2 and 'Module 27' in doc['aliases']
  assert run.call_args_list[0].args[0][0]=='pdftotext' and isinstance(run.call_args_list[0].args[0],list)
  assert lib.get(doc['id'])['pages'][1]['page']==2

def test_directed_lesson_cannot_invent_pages_assets_or_connections(library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,documents=lib);_,draft=sample()
 result=validate_lesson(draft,d,store.icons)
 assert result['chapters'][0]['end']==result['chapters'][1]['start']
 assert result['chapters'][1]['finishedAt']<result['duration']
 for change in ('page','asset','link'):
  bad=copy.deepcopy(draft)
  if change=='page':bad['chapters'][0]['sourcePages']=[99]
  if change=='asset':bad['chapters'][0]['nodes'][0]['icon']='https://untrusted.invalid/a.svg'
  if change=='link':bad['chapters'][0]['connections']=[{'from':'missing','to':'secret','label':'unsupported'}]
  with pytest.raises(PlanError):validate_lesson(bad,d,store.icons)
 long=copy.deepcopy(draft);long['chapters'][0]['nodes'][0]['body']='A complete explanation. '*20
 with pytest.raises(PlanError,match='rewrite concisely'):validate_lesson(long,d,store.icons)


def test_new_direction_requires_an_ordered_reasoning_bridge(library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,documents=lib);_,draft=sample()
 assert validate_lesson(draft,d,store.icons,require_continuity=True)['chapters'][1]['continuity']['from']=='protection'
 bad=copy.deepcopy(draft);bad['chapters'][1].pop('continuity')
 with pytest.raises(PlanError,match='preceding result'):validate_lesson(bad,d,store.icons,require_continuity=True)
 bad=copy.deepcopy(draft);bad['chapters'][1]['continuity']['from']='unrelated'
 with pytest.raises(PlanError,match='preceding result'):validate_lesson(bad,d,store.icons,require_continuity=True)
 bad=copy.deepcopy(draft);c=bad['chapters'][1];c['narration']='A separate topic begins. '+c['narration']
 with pytest.raises(PlanError,match='before the incoming'):validate_lesson(bad,d,store.icons,require_continuity=True)


def test_factually_correct_but_disconnected_lesson_cannot_reach_visual_publication(tmp_path,library):
 lib,d=library
 class Disconnected(Model):
  def compose(self,text,system=''):
   r=json.loads(text)
   if r.get('narrativeReview'):return json.dumps({'approved':False,'links':[{'from':'protection','to':'audit','connected':False,'connection':'The narration lists two subjects without motivating the audit.','quote':''}],
    'findings':[{'beat':'audit','problem':'The next question is not motivated by the previous result.','revision':'Explain why identifying an asset leaves its permission conditions unresolved.'}]})
   return super().compose(text,system)
 model=Disconnected();store=BrowserLessonStore(model,STUDIO,tmp_path/'lessons',lib)
 j=store.start({'question':'Teach me Module 12'});j=await_state(store,j['id'],{'failed','awaiting_review'})
 assert j['status']=='failed' and 'disconnected reasoning' in j['error']
 assert not model.image_calls


def test_narrative_approval_requires_a_quote_from_the_actual_next_narration(tmp_path,library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,tmp_path/'lessons',lib);_,raw=sample();candidate=validate_lesson(raw,d,store.icons)
 (store.folder/'x').mkdir();j={'lessonId':'x','stage':'Checking narrative'}
 bad={'approved':True,'findings':[],'links':[{'from':'protection','to':'audit','connected':True,'connection':'A plausible description of a connection.','quote':'This bridge was invented and is absent from the spoken lesson.'}]}
 with patch.object(store.llm,'compose',return_value=json.dumps(bad)):
  with pytest.raises(PlanError,match='absent|validate'):store._narrative_check(j,candidate)


def test_question_during_a_bridge_uses_the_diagram_still_visible(tmp_path,library):
 lib,d=library;model=Model();store=BrowserLessonStore(model,STUDIO,tmp_path/'lessons',lib);_,draft=sample()
 lesson=validate_lesson(draft,d,store.icons);lesson.update(id='b'*32,kind='live_generated')
 first,second=lesson['chapters'];handoff=second['start']+5
 first.update(visualStart=0,visualEnd=handoff);second.update(visualStart=handoff,visualEnd=second['end'])
 folder=store.folder/lesson['id'];folder.mkdir();(folder/'lesson.json').write_text(json.dumps(lesson))
 store.answer({'question':'Explain the code I am still looking at.'},{'lessonId':lesson['id'],'time':second['start']+1,'selection':['code']},[])
 assert model.calls[-1]['beat']['id']=='protection'
 assert model.calls[-1]['narratingBeat']['id']=='audit'

def test_new_lesson_is_not_published_until_real_frame_review_is_approved(tmp_path,library):
 lib,d=library;model=Model();store=BrowserLessonStore(model,STUDIO,tmp_path/'lessons',lib)
 job=store.start({'question':'Teach me Module 12'});j=await_state(store,job['id'],{'awaiting_review','failed'});assert j['status']=='awaiting_review'
 with pytest.raises(PlanError,match='reviewed live lesson'):store.lesson(j['lessonId'])
 result=store.review(j['id'],{'revision':0,'frames':frames(j['candidate'])});j=await_state(store,j['id'],{'ready','failed'});assert j['status']=='ready'
 lesson=store.lesson(j['lessonId']);assert lesson['documentId']==d['id'] and lesson['review']['approved']
 assert {c.get('teaching') for c in lesson['chapters']}=={'comparison','procedure'}
 assert len(model.image_calls)==1 and len(model.image_calls[0])==4
 assert store.start({'question':'Teach me Module 12'})['id']==job['id']
 assert model.calls[0]['source']['pages']==d['pages']

def test_unreviewed_or_failed_revision_never_replaces_a_published_lesson(tmp_path,library):
 lib,d=library;store=BrowserLessonStore(Model(approve=False),STUDIO,tmp_path/'lessons',lib)
 j=store.start({'question':'Teach me Module 12'});j=await_state(store,j['id'],{'awaiting_review'})
 store.review(j['id'],{'revision':0,'frames':frames(j['candidate'])});j=await_state(store,j['id'],{'awaiting_review','failed'})
 assert j['revision']==1
 for revision in (1,2):
  store.review(j['id'],{'revision':revision,'frames':frames(j['candidate'])});j=await_state(store,j['id'],{'awaiting_review','failed'})
  assert j['revision']==revision+1 and j['status']=='awaiting_review'
 store.review(j['id'],{'revision':3,'frames':frames(j['candidate'])});j=await_state(store,j['id'],{'failed'})
 with pytest.raises(PlanError):store.lesson(j['lessonId'])

def test_source_accuracy_must_pass_before_browser_review_or_publication(tmp_path,library):
 lib,d=library
 class Unsupported(Model):
  def compose(self,text,system=''):
   r=json.loads(text)
   if r.get('sourceReview'):return json.dumps({'approved':False,'checks':[{'beat':c['id'],'supported':False} for c in r['chapters']],
     'findings':[{'beat':r['chapters'][0]['id'],'problem':'A possible outcome became a guarantee.','revision':'Retain the source condition.'}]})
   return super().compose(text,system)
 model=Unsupported();store=BrowserLessonStore(model,STUDIO,tmp_path/'lessons',lib)
 j=store.start({'question':'Teach me Module 12'});j=await_state(store,j['id'],{'failed','awaiting_review'})
 assert j['status']=='failed' and 'unsupported source claims' in j['error']
 assert not model.image_calls
 with pytest.raises(PlanError):store.lesson(j['lessonId'])

def test_source_correction_can_replace_text_without_changing_assets_or_evidence(tmp_path,library):
 lib,d=library;model=Mock(spec=['compose']);store=BrowserLessonStore(model,STUDIO,tmp_path/'lessons',lib)
 _,draft=sample();candidate=validate_lesson(draft,d,store.icons);j={'lessonId':'d'*32,'document':d};(store.folder/j['lessonId']).mkdir()
 model.compose.return_value=json.dumps({'patches':[{'op':'replace','path':'/chapters/0/narration','value':'The source qualification applies to this illustrative case.'}]})
 with pytest.raises(PlanError,match='absent from the narration'):
  store._repair_source(j,candidate,[{'beat':'protection','problem':'Missing qualification','revision':'Retain it'}])
 corrected=draft['chapters'][0]['continuity']['bridge']+' The source qualification applies to this illustrative case.'
 model.compose.return_value=json.dumps({'patches':[{'op':'replace','path':'/chapters/0/narration','value':corrected}]})
 fixed=store._repair_source(j,candidate,[{'beat':'protection','problem':'Missing qualification','revision':'Retain it'}])
 assert fixed['chapters'][0]['narration']==corrected
 assert fixed['chapters'][0]['visual']==candidate['chapters'][0]['visual']
 assert fixed['chapters'][0]['sourcePages']==[1]
 model.compose.return_value=json.dumps({'patches':[{'op':'replace','path':'/chapters/0/sourcePages/0','value':'99'}]})
 with pytest.raises(PlanError):store._repair_source(j,candidate,[{'beat':'protection','problem':'Different finding','revision':'Do not change evidence'}])

def test_retry_reuses_the_saved_storyboard_after_provider_failure(tmp_path,library):
 lib,d=library;folder=tmp_path/'lessons';store=BrowserLessonStore(Model(fail_direction=True),STUDIO,folder,lib)
 j=store.start({'question':'Teach me Module 12'});j=await_state(store,j['id'],{'failed'});assert (folder/j['lessonId']/'storyboard.json').is_file()
 model=Model();retry=BrowserLessonStore(model,STUDIO,folder,lib);j=retry.start({'question':'Teach me Module 12'});j=await_state(retry,j['id'],{'awaiting_review'})
 assert all('storyboard' in call or call.get('sourceReview') or call.get('narrativeReview') for call in model.calls)

@pytest.mark.parametrize('revision',[1,2,3])
def test_restart_preserves_the_working_revision_without_redrawing_sections(tmp_path,library,revision):
 lib,d=library;folder=tmp_path/'lessons';store=BrowserLessonStore(Model(),STUDIO,folder,lib)
 j=store.start({'question':'Teach me Module 12'});j=await_state(store,j['id'],{'awaiting_review'})
 saved=store.jobs[j['id']];saved['revision']=revision;store._save_working(saved,j['candidate'])
 for path in (folder/j['lessonId']).glob('direction-*.json'):path.unlink()
 model=Model(fail_direction=True);retry=BrowserLessonStore(model,STUDIO,folder,lib)
 resumed=retry.start({'question':'Teach me Module 12'});resumed=await_state(retry,resumed['id'],{'awaiting_review','failed'})
 assert resumed['status']=='awaiting_review' and resumed['revision']==revision
 assert resumed['candidate']['chapters']==j['candidate']['chapters']
 assert not any('storyboard' in call for call in model.calls)

def test_provider_retry_is_bounded_and_keeps_the_current_stage(tmp_path,library):
 from assistant.llm import ModelProviderError
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,tmp_path/'lessons',lib);j={'stage':'Checking the source'}
 call=Mock(side_effect=[ModelProviderError('transport interrupted'),'recovered'])
 assert store._request(j,call)=='recovered' and call.call_count==2 and j['stage']=='Checking the source'
 call=Mock(side_effect=ModelProviderError('still unavailable'))
 with pytest.raises(ModelProviderError):store._request(j,call)
 assert call.call_count==2

def test_paused_branch_uses_document_evidence_and_captures_experiments(tmp_path,library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,tmp_path/'lessons',lib);_,raw=sample();lesson=validate_lesson(raw,d,store.icons);lesson.update(id='c'*32,kind='live_generated');folder=store.folder/lesson['id'];folder.mkdir();(folder/'lesson.json').write_text(json.dumps(lesson))
 context={'sceneId':'live_generated','lessonId':lesson['id'],'time':31,'selection':['notice'],'camera':{'zoom':1.7},'experiments':{'audit':1}}
 result=store.answer({'question':'What does the audit require?','mode':'branch'},context,[])
 assert 'page 2' in result['answer'] and result['sources'][0]['url'].startswith('/api/visual/documents/')
 saved=store.jobs[result['liveBranch']['jobId']]['context']['paused'];context['experiments']['audit']=0
 assert saved['experiments']['audit']==1 and saved['selection']==['notice']

def test_natural_module_request_routes_to_live_generation_without_a_module_specific_scene():
 from assistant.skills.visual import VisualExplainerSkill
 from assistant.visual.runner import VisualRunner
 skill=VisualExplainerSkill();assert skill.match('Teach me Module 12')['topic']=='Teach me Module 12'
 assert skill.match('make a Hyperframes animation about Module 12')['action']=='launch'
 with patch('assistant.visual.runner.ensure_studio_server'),patch('shutil.which',return_value='/usr/bin/omarchy-launch-webapp'),patch('assistant.visual.runner.subprocess.Popen') as launch:
  VisualRunner().launch_studio('Teach me Module 12');url=launch.call_args.args[0][1]
  assert 'live=1' in url and 'topic=Teach+me+Module+12' in url

def test_provider_stdout_deadline_does_not_depend_on_receiving_another_line():
 import subprocess,sys
 from assistant.llm import _process_lines
 proc=subprocess.Popen([sys.executable,'-u','-c','import time; print("ready",flush=True); time.sleep(5)'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 try:
  stream=_process_lines(proc,.15)
  assert next(stream).strip()=='ready'
  start=time.monotonic()
  with pytest.raises(TimeoutError):next(stream)
  assert time.monotonic()-start<1
 finally:proc.terminate();proc.wait(timeout=2)

def test_structured_fallback_retains_model_path_and_token_budget():
 from assistant.llm import FallbackLLM
 primary=Mock(spec=['_chat']);primary._chat.side_effect=RuntimeError('401 unauthorized')
 fallback=Mock(spec=['_chat']);fallback._chat.return_value='{"ok":true}'
 llm=FallbackLLM(primary,fallback);messages=[{'role':'user','content':'Return a teaching plan'}]
 assert llm._chat(messages,max_tokens=4200)=='{"ok":true}'
 assert llm._chat(messages,max_tokens=1800)=='{"ok":true}'
 assert primary._chat.call_count==1
 assert fallback._chat.call_args_list[0].kwargs=={'max_tokens':4200}
 assert fallback._chat.call_args_list[1].kwargs=={'max_tokens':1800}


def test_validate_lesson_icon_diagnostics_and_fallback(library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,documents=lib);_,draft=sample()
 bad=copy.deepcopy(draft);bad['chapters'][0]['nodes'][0]['icon']='purple'
 with pytest.raises(PlanError,match='color palette name'):
  validate_lesson(bad,d,store.icons)

 # Alias mapping: 'tnt' -> 'bomb'
 alias=copy.deepcopy(draft);alias['chapters'][0]['nodes'][0]['icon']='tnt'
 resolved=validate_lesson(alias,d,store.icons)
 assert resolved['chapters'][0]['visual']['nodes'][0]['icon']=='bomb'

 # Graceful fallback when fallback_icons=True
 recovered=validate_lesson(bad,d,store.icons,fallback_icons=True)
 assert recovered['chapters'][0]['visual']['nodes'][0]['icon'] in store.icons


def test_general_topic_requires_factual_review_without_claiming_source_retrieval(tmp_path,library):
 lib,_=library;model=Model();store=BrowserLessonStore(model,STUDIO,tmp_path/'lessons',lib);_,raw=sample()
 for c in raw['chapters']:c['sourcePages']=[]
 candidate=validate_lesson(raw,None,store.icons);(store.folder/'general').mkdir()
 review=store._source_check({'lessonId':'general','document':None,'stage':'Factual review'},candidate)
 assert review['approved'] and review['method']=='model-factual-review-without-retrieved-sources'
 assert model.calls[-1]['sourceReview'] and model.calls[-1]['source']==[]
 assert len(review['checks'])==len(candidate['chapters'])


def test_diagram_semantics_survive_director_roundtrip_and_reject_unknown_motion_cue(library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,documents=lib);_,raw=sample();c=raw['chapters'][0];c['layout']='diagram';c['teaching']='construction'
 for i,n in enumerate(c['nodes']):
  n.update(position={'x':100+i*600,'y':120,'width':350,'height':350},artwork=[{'type':'circle','cx':50,'cy':50,'r':20}],motion=[{'cue':'secret','dx':80}])
 candidate=validate_lesson(raw,d,store.icons)
 restored=validate_lesson(store._raw(candidate),d,store.icons)
 assert restored['chapters'][0]['visual']==candidate['chapters'][0]['visual']
 c['nodes'][0]['motion'][0]['cue']='invented'
 with pytest.raises(PlanError,match='motion cues'):validate_lesson(raw,d,store.icons)


def test_general_topic_material_error_blocks_publication_even_without_pdf(tmp_path,library):
 lib,_=library;model=Model();store=BrowserLessonStore(model,STUDIO,tmp_path/'lessons',lib);_,raw=sample()
 for c in raw['chapters']:c['sourcePages']=[]
 candidate=validate_lesson(raw,None,store.icons);(store.folder/'general').mkdir()
 j={'lessonId':'general','document':None,'revision':0,'stage':'Checking','storyboard':{'beats':[{'id':c['id']} for c in raw['chapters']]}}
 rejected={'approved':False,'checks':[{'beat':c['id'],'supported':False} for c in raw['chapters']],
  'findings':[{'beat':'protection','problem':'A material definition is wrong.','revision':'Correct the definition.'}]}
 with patch.object(store,'_source_check',return_value=rejected),patch.object(store,'_repair_source',return_value=candidate),patch.object(store,'_narrative_check') as narrative:
  with pytest.raises(PlanError,match='unsupported source claims'):store._prepare(j,initial=candidate)
 assert not narrative.called and not (store.folder/'general'/'lesson.json').exists()


def test_measured_overflow_cannot_be_overruled_by_vision_approval(tmp_path,library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,tmp_path/'lessons',lib)
 job=store.start({'question':'Teach me Module 12'});j=await_state(store,job['id'],{'awaiting_review','failed'})
 store.review(j['id'],{'revision':0,'frames':frames(j['candidate']),
  'layoutIssues':[{'beat':'protection','problem':'Text needs more space: Essential definition'}]})
 deadline=time.monotonic()+4
 while time.monotonic()<deadline:
  j=store.status(j['id'])
  if j['revision']==1 and j['status']=='awaiting_review':break
  time.sleep(.015)
 assert j['revision']==1 and j['status']=='awaiting_review'
 assert not (store.folder/j['lessonId']/'lesson.json').exists()


def test_resume_after_service_restart_retains_draft_and_completed_reviews(tmp_path,library):
 lib,d=library;folder=tmp_path/'lessons';store=BrowserLessonStore(Model(),STUDIO,folder,lib)
 job=store.start({'question':'Teach me Module 12'});first=await_state(store,job['id'],{'awaiting_review','failed'})
 assert first['status']=='awaiting_review'
 model=Model(fail_direction=True);restarted=BrowserLessonStore(model,STUDIO,folder,lib)
 second=restarted.start({'question':'Teach me Module 12','resumeLessonId':first['lessonId']})
 resumed=await_state(restarted,second['id'],{'awaiting_review','failed'})
 assert resumed['status']=='awaiting_review' and resumed['candidate']==first['candidate']
 assert not model.calls
 with pytest.raises(PlanError,match='same question'):
  restarted.start({'question':'A different question','documentId':d['id'],'resumeLessonId':first['lessonId']})


def test_factual_corrections_do_not_consume_narrative_correction_allowance(tmp_path,library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,tmp_path/'lessons',lib);_,raw=sample();candidate=validate_lesson(raw,d,store.icons)
 (store.folder/'budgets').mkdir();j={'lessonId':'budgets','document':d,'revision':0,'stage':'Review','storyboard':{'beats':raw['chapters']}}
 bad={'approved':False,'findings':[{'beat':'protection','problem':'A material error.','revision':'Correct it.'}]}
 good={'approved':True,'checks':[]};narrative_good={'approved':True,'links':[]}
 with patch.object(store,'_source_check',side_effect=[bad,bad,good,good]) as facts,patch.object(store,'_narrative_check',side_effect=[bad,narrative_good]) as narrative,patch.object(store,'_repair_source',return_value=candidate) as repair:
  assert store._prepare(j,initial=candidate)['narrativeReview']['approved']
 assert facts.call_count==4 and narrative.call_count==2 and repair.call_count==3


def test_unchanged_fact_sections_are_reused_after_a_local_revision(tmp_path,library):
 lib,d=library;model=Model();store=BrowserLessonStore(model,STUDIO,tmp_path/'lessons',lib);_,raw=sample()
 extra=copy.deepcopy(raw['chapters'][0]);extra['id']='third';extra['insight']='A distinct final inference.';extra.pop('continuity');raw['chapters'].append(extra)
 candidate=validate_lesson(raw,d,store.icons);(store.folder/'sections').mkdir();j={'lessonId':'sections','document':d,'stage':'Review'}
 assert store._source_check(j,candidate)['approved'];assert len(model.calls)==2
 candidate['chapters'][2]['narration']+=' A clarification preserving its conditions.'
 assert store._source_check(j,candidate)['approved'];assert len(model.calls)==3
 assert [c['id'] for c in model.calls[-1]['chapters']]==['third']


def test_visual_revision_preserves_corrected_unflagged_beats_and_skips_their_model_calls(tmp_path,library):
 lib,d=library;model=Model();store=BrowserLessonStore(model,STUDIO,tmp_path/'lessons',lib);_,raw=sample()
 for i in range(2):
  extra=copy.deepcopy(raw['chapters'][i]);extra['id']=['third','fourth'][i];extra['insight']+=f' Additional inference {i}.'
  extra['continuity']['from']=['audit','third'][i];raw['chapters'].append(extra)
 raw['chapters'][0]['nodes'][0]['body']='An already corrected scientific qualification that must survive layout repairs.'
 candidate=validate_lesson(raw,d,store.icons);canonical=store._raw(candidate)
 story={**{k:canonical[k] for k in ('title','question','representation','example')},'beats':[{**c,'visibleOperation':'A visible relationship.'} for c in canonical['chapters']]}
 (store.folder/'targeted').mkdir();j={'lessonId':'targeted','document':d,'revision':1,'request':{'question':'Teach this'},'storyboard':story,'candidate':candidate,'stage':'Revise'}
 fixed=store._direct(j,[{'beat':'fourth','problem':'Text overflow','revision':'Fit the copy'}])
 assert len(model.calls)==1 and [c['id'] for c in model.calls[0]['previousDirectedSection']['chapters']]==['third','fourth']
 assert fixed['chapters'][:3]==candidate['chapters'][:3]


def test_text_correction_sends_only_flagged_copy_and_preserves_original_artwork_indices(tmp_path,library):
 lib,d=library;model=Mock(spec=['compose']);store=BrowserLessonStore(model,STUDIO,tmp_path/'lessons',lib);_,raw=sample();raw['chapters'][1]['layout']='diagram';raw['chapters'][1]['teaching']='mechanism'
 for i,n in enumerate(raw['chapters'][1]['nodes']):
  n.update(position={'x':100+i*600,'y':120,'width':350,'height':350},artwork=[{'type':'line','x1':10,'y1':50,'x2':90,'y2':50},{'type':'text','text':'E = pc'}])
 candidate=validate_lesson(raw,d,store.icons);j={'lessonId':'compact','document':d};(store.folder/'compact').mkdir()
 model.compose.return_value=json.dumps({'patches':[{'op':'replace','path':'/chapters/1/nodes/0/artwork/1/text','value':'p = E/c'}]})
 fixed=store._repair_source(j,candidate,[{'beat':'audit','problem':'Clarify an equation','revision':'Keep its meaning explicit'}])
 sent=json.loads(model.compose.call_args.args[0]);assert list(sent['candidate']['chapters'])==['1']
 node=sent['candidate']['chapters']['1']['nodes'][0]
 assert list(node['artwork'])==['1'] and 'position' not in node and 'motion' not in node
 assert sent['neighbourContext'][0]['index']==0
 assert fixed['chapters'][0]==candidate['chapters'][0]
 assert fixed['chapters'][1]['visual']['nodes'][0]['artwork'][0]==candidate['chapters'][1]['visual']['nodes'][0]['artwork'][0]


def test_changing_models_cannot_reuse_the_previous_models_lesson_cache(tmp_path,library):
 lib,_=library;model=Model();model.provider='test';model.model='first-model';store=BrowserLessonStore(model,STUDIO,tmp_path/'lessons',lib)
 with patch.object(store,'_generate'):
  first=store.start({'question':'Teach me Module 12'})
  model.model='second-model';second=store.start({'question':'Teach me Module 12'})
 assert first['lessonId']!=second['lessonId']


def diagram_draft():
 _,raw=sample()
 c=raw['chapters'][0];c['layout']='diagram';c['teaching']='construction'
 c['presentation']={'method':'Geometric construction','why':'Track the changing relationship directly.','visualEvidence':'Two arrows approach and their resultant changes.','textMode':'labels'}
 for i,n in enumerate(c['nodes']):
  n.update(position={'x':100+i*600,'y':110,'width':400,'height':390},artwork=[{'type':'path','d':'M10 50 L90 50 L80 40 M90 50 L80 60'}],motion=[])
 return raw


def test_per_beat_choices_survive_roundtrip_without_forcing_variety(library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,documents=lib);raw=diagram_draft()
 out=validate_lesson(raw,d,store.icons,require_presentation=True)
 assert out['chapters'][0]['visual']['presentation']['textMode']=='labels'
 assert out['chapters'][1]['visual']['presentation']['textMode']=='descriptive'
 assert store._raw(out)['chapters'][0]['presentation']==raw['chapters'][0]['presentation']
 # Continuing the same method can be the right choice, with no diversity quota.
 raw['chapters'][1]['presentation']=copy.deepcopy(raw['chapters'][0]['presentation'])
 raw['chapters'][1]['presentation']['textMode']='descriptive'
 assert validate_lesson(raw,d,store.icons,require_presentation=True)['chapters'][1]['visual']['presentation']['method']=='Geometric construction'


def test_new_plans_require_beat_choices_but_saved_legacy_lessons_still_load(library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,documents=lib);_,raw=sample()
 raw['chapters'][0].pop('presentation')
 assert 'presentation' not in validate_lesson(raw,d,store.icons)['chapters'][0]['visual']
 with pytest.raises(PlanError,match='teaching method for every beat'):validate_lesson(raw,d,store.icons,require_presentation=True)
 raw=diagram_draft();raw['chapters'][0]['layout']='comparison';raw['chapters'][0]['teaching']='comparison'
 with pytest.raises(PlanError,match='diagram layout'):validate_lesson(raw,d,store.icons)


def test_inspection_only_prose_does_not_inflate_construction_reading_time(library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,documents=lib);raw=diagram_draft()
 c=raw['chapters'][0];c['duration']=15;c['narration']='Compare the two inputs.'
 for n in c['nodes']:n['body']='Inspect the supporting explanation. '
 short=validate_lesson(raw,d,store.icons)['chapters'][0]
 for n in c['nodes']:n['body']='Inspect the supporting explanation and the stated conditions carefully. '*3
 long=validate_lesson(raw,d,store.icons)['chapters'][0]
 assert short['end']==long['end']
 assert c['nodes'][0]['body'].strip() in long['roles']['code']


def test_visual_approval_requires_observed_evidence_for_each_teaching_choice(library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,documents=lib);_,raw=sample();chapters=validate_lesson(raw,d,store.icons)['chapters']
 review={'approved':True,'findings':[],'observations':['A comparison and trace.']}
 with pytest.raises(PlanError,match='presentation-method check'):validate_presentation_review(review,chapters)
 review['presentationChecks']=[{'beat':c['id'],'methodFits':True,'evidenceVisible':True,'textSupports':True,'observation':'Named assets align for comparison; links show which condition to inspect.'} for c in chapters]
 assert validate_presentation_review(review,chapters)['approved']
 review['presentationChecks'][0]['evidenceVisible']=False
 review['presentationChecks'][0]['observation']='Text mentions a construction that is absent from the frames.'
 failed=validate_presentation_review(review,chapters)
 assert not failed['approved'] and failed['findings'][0]['beat']=='protection'
 assert not review['findings'] # Review input and previously accepted facts are untouched.


def test_director_receives_choices_and_cannot_silently_drop_them(tmp_path,library):
 lib,d=library
 class DroppedChoice(Model):
  def compose(self,text,system=''):
   request=json.JSONDecoder().raw_decode(text)[0]
   reply=super().compose(json.dumps(request),system)
   if 'storyboard' in request:
    raw=json.loads(reply)
    for c in raw['chapters']:c.pop('presentation',None)
    return json.dumps(raw)
   return reply
 model=DroppedChoice();store=BrowserLessonStore(model,STUDIO,tmp_path/'lessons',lib)
 job=store.start({'question':'Teach me Module 12'});j=await_state(store,job['id'],{'failed','awaiting_review'})
 assert j['status']=='failed' and 'teaching method' in j['error']
 direction=next(r for r in model.calls if 'storyboard' in r)
 assert all(b['presentation']['why'] for b in direction['storyboard']['beats'])
 assert not model.image_calls


def test_rich_diagrams_get_independent_response_budgets_without_losing_context(tmp_path,library):
 from assistant.visual.browser_lessons import direction_groups
 assert [[b['id'] for b in g] for g in direction_groups([{'id':str(i),'layout':layout} for i,layout in enumerate(['comparison','process','diagram','diagram','matrix','concept','timeline'])])]==[['0','1'],['2'],['3'],['4','5'],['6']]
 lib,d=library
 class Mixed(Model):
  def _chat(self,messages,max_tokens=None):
   request=json.loads(messages[-1]['content'])
   if 'storyboard' in request:
    if not hasattr(self,'budgets'):self.budgets={}
    self.budgets[tuple(b['id'] for b in request['storyboard']['beats'])]=max_tokens
   return self.compose(messages[-1]['content'],messages[0]['content'])
  def compose(self,text,system=''):
   request=json.loads(text)
   if 'storyboard' in request:
    self.calls.append(request);raw=diagram_draft();ids={b['id'] for b in request['storyboard']['beats']}
    raw['chapters']=[c for c in raw['chapters'] if c['id'] in ids]
    return json.dumps(raw)
   if not any(key in request for key in ('narrativeReview','sourceReview','sourceRepair')):
    self.calls.append(request);_,raw=sample();story={k:v for k,v in raw.items() if k!='chapters'}
    story['beats']=[{**c,'visibleOperation':'Construct and then compare the named relationship.'} for c in diagram_draft()['chapters']]
    return json.dumps(story)
   return super().compose(text,system)
 model=Mixed();store=BrowserLessonStore(model,STUDIO,tmp_path/'lessons',lib)
 job=store.start({'question':'Teach me Module 12'});j=await_state(store,job['id'],{'failed','awaiting_review'})
 assert j['status']=='awaiting_review',j.get('error')
 directed=[r for r in model.calls if 'storyboard' in r]
 assert len(directed)==2 and all(len(r['storyboard']['beats'])==1 for r in directed)
 assert model.budgets=={('protection',):9000,('audit',):4200}
 assert all(len(r['lessonProgression'])==2 for r in directed)
 assert directed[0]['nodeContract']['diagramRequired']==['position','artwork','motion']
 assert [c['id'] for c in j['candidate']['chapters']]==['protection','audit']


def test_direction_feedback_reports_all_bad_objects_without_inventing_geometry():
 from assistant.visual.browser_lessons import direction_node_issues
 raw=diagram_draft();nodes=raw['chapters'][0]['nodes'];nodes[0].pop('position');nodes[0]['color']='cyan';nodes[1]['color']='red';nodes[1]['body']='A'*269
 before=copy.deepcopy(raw)
 issues='\n'.join(direction_node_issues(raw))
 assert 'protection/code.color' in issues and 'protection/secret.color' in issues
 assert 'position' in issues and 'protection/secret.body' in issues
 assert raw==before


def test_branch_planner_receives_the_actual_visible_scene_not_only_selection_ids(tmp_path,library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,tmp_path/'lessons',lib);_,raw=sample()
 lesson=validate_lesson(raw,d,store.icons);lesson.update(id='d'*32,kind='live_generated')
 first,second=lesson['chapters'];handoff=second['start']+5
 first.update(visualStart=0,visualEnd=handoff);second.update(visualStart=handoff,visualEnd=second['end'])
 folder=store.folder/lesson['id'];folder.mkdir();(folder/'lesson.json').write_text(json.dumps(lesson))
 paused={'lessonId':lesson['id'],'time':second['start']+1,'selection':['code'],'camera':{'x':12,'y':3,'zoom':1.2},'experiments':{'protection':0}}
 with patch.object(store,'start',return_value={'id':'e'*32,'lessonId':'f'*32}) as start:
  result=store.answer({'mode':'branch','question':'Explain this selected material visually.'},paused,[])
 context=start.call_args.kwargs['context']
 assert context['paused']==paused
 assert context['parentScene']['beat']['id']=='protection', 'the previous diagram is still visible during the spoken bridge'
 assert context['parentScene']['beat']['visual']['nodes'][0]['color']=='blue'
 assert context['parentScene']['beat']['visual']['presentation']['method']=='Aligned comparison'
 assert context['parentScene']['example']==lesson['example']
 assert result['liveBranch']['lessonId']=='f'*32


def test_factual_diagram_correction_can_redraw_wrong_paths_instead_of_only_relabelling(tmp_path,library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,tmp_path/'lessons',lib);raw=diagram_draft()
 candidate=validate_lesson(raw,d,store.icons);fixed=copy.deepcopy(candidate)
 fixed['chapters'][0]['visual']['nodes'][0]['artwork'][0]['d']='M90 50 L10 50'
 (store.folder/'geometry-facts').mkdir();j={'lessonId':'geometry-facts','document':d,'revision':2,'storyboard':{'beats':raw['chapters']},'stage':'Review'}
 finding={'beat':'protection','problem':'The vector points in the wrong direction.','revision':'Reverse the actual vector path, preserving the other beat.'}
 with patch.object(store,'_source_check',side_effect=[{'approved':False,'findings':[finding]},{'approved':True,'findings':[]}]),patch.object(store,'_narrative_check',return_value={'approved':True}),patch.object(store,'_direct',return_value=fixed) as redraw,patch.object(store,'_repair_source') as text_only:
  result=store._prepare(j,initial=candidate)
 assert redraw.call_args.args[1]==[finding]
 assert j['candidate']==candidate
 assert result['chapters'][0]['visual']['nodes'][0]['artwork'][0]['d']=='M90 50 L10 50'
 assert result['chapters'][1]==candidate['chapters'][1]
 assert not text_only.called


def test_revision_attempt_cache_is_scoped_to_feedback_and_starting_scene(tmp_path,library):
 lib,d=library
 class RevisionModel(Model):
  def compose(self,text,system=''):
   request=json.loads(text);self.calls.append(request)
   raw=copy.deepcopy(request['previousDirectedSection'])
   raw['title']='An unrequested rewritten shared title'
   raw['representation']='An unrequested replacement for the reviewed context'
   path='M90 50 L10 50' if request['revisionFeedback'][0]['problem']=='Reverse it' else 'M10 10 L90 90'
   raw['chapters'][0]['nodes'][0]['artwork'][0]['d']=path
   return json.dumps(raw)
 model=RevisionModel();store=BrowserLessonStore(model,STUDIO,tmp_path/'lessons',lib);raw=diagram_draft();candidate=validate_lesson(raw,d,store.icons)
 story={k:v for k,v in raw.items() if k!='chapters'};story['beats']=raw['chapters']
 (store.folder/'scoped').mkdir();j={'lessonId':'scoped','document':d,'revision':2,'storyboard':story,'request':{'question':'Explain this'},'candidate':candidate}
 first=[{'beat':'protection','problem':'Reverse it','revision':'Reverse the vector.'}]
 second=[{'beat':'protection','problem':'Change its slope','revision':'Make the vector diagonal.'}]
 a=store._direct(j,first);b=store._direct(j,second)
 assert a['chapters'][0]['visual']['nodes'][0]['artwork'][0]['d']=='M90 50 L10 50'
 assert b['chapters'][0]['visual']['nodes'][0]['artwork'][0]['d']=='M10 10 L90 90'
 assert len(model.calls)==2, 'changed feedback must reach the model instead of reusing a previous valid-but-rejected attempt'
 assert b['title']==candidate['title'] and b['representation']==candidate['representation']
 assert store._direct(j,second)==b and len(model.calls)==2, 'the identical request still reuses its checkpoint'
 j['candidate']=copy.deepcopy(candidate);j['candidate']['chapters'][0]['visual']['nodes'][0]['body']='A fact corrected after the earlier revision.'
 store._direct(j,second)
 assert len(model.calls)==3, 'the same finding on a corrected starting scene needs a new revision input'

def test_targeted_beat_patching_only_re_reviews_flagged_beats(tmp_path,library):
 lib,d=library
 class TargetedModel(Model):
  def __init__(self):
   super().__init__()
   self.revision_turn=0
  def review_images(self,instruction,frames):
   self.image_calls.append(frames)
   if self.revision_turn==0:
    self.revision_turn+=1
    return json.dumps({
     'approved':False,
     'findings':[{'beat':'audit','problem':'Text overlap in audit node.','revision':'Adjust audit coordinates.'}],
     'observations':['The assets are compared with descriptions.','The audit has a labeled relationship.'],
     'presentationChecks':[{'beat':id,'methodFits':True,'evidenceVisible':True,'textSupports':True,'observation':'Presentation check.'} for id in ['protection','audit']]
    })
   return json.dumps({
    'approved':True,
    'findings':[],
    'observations':['The audit has been corrected.'],
    'presentationChecks':[{'beat':'audit','methodFits':True,'evidenceVisible':True,'textSupports':True,'observation':'Presentation check audit.'}]
   })
 model=TargetedModel()
 store=BrowserLessonStore(model,STUDIO,tmp_path/'lessons',lib)
 j=store.start({'question':'Teach me Module 12'})
 j=await_state(store,j['id'],{'awaiting_review'})
 store.review(j['id'],{'revision':0,'frames':frames(j['candidate'])})
 j=await_state(store,j['id'],{'awaiting_review'})
 assert j['revision']==1
 assert j.get('revisedBeats')==['audit']
 assert json.dumps(j)  # the job API must serialize this field
 assert len(model.image_calls)==1 and len(model.image_calls[0])==4
 store.review(j['id'],{'revision':1,'frames':frames(j['candidate'])})
 j=await_state(store,j['id'],{'ready'})
 assert j['status']=='ready'
 assert len(model.image_calls)==2
 assert len(model.image_calls[1])==2
 lesson=store.lesson(j['lessonId'])
 assert lesson['review']['approved']
 assert len(lesson['review']['presentationChecks'])==2

def test_diagram_layout_clearance_auto_resolves_overlapping_node_positions(library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,documents=lib);raw=diagram_draft()
 nodes=raw['chapters'][0]['nodes']
 # Deliberately overlap the two nodes: node 0 right edge 500 overlaps node 1 left edge 450
 nodes[0]['position']={'x':100,'y':150,'width':400,'height':300}
 nodes[1]['position']={'x':450,'y':150,'width':400,'height':300}
 out=validate_lesson(raw,d,store.icons,require_presentation=True)
 p0=out['chapters'][0]['visual']['nodes'][0]['position']
 p1=out['chapters'][0]['visual']['nodes'][1]['position']
 assert p0['x']+p0['width']<=p1['x'] or p1['x']+p1['width']<=p0['x']
 assert 45<=p0['x'] and p0['x']+p0['width']<=1395
 assert 45<=p1['x'] and p1['x']+p1['width']<=1395



def test_live_plans_choose_teaching_before_layout(library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,documents=lib);_,raw=sample()
 raw['chapters'][0]['teaching']='comparison'
 assert validate_lesson(raw,d,store.icons)['chapters'][0]['teaching']=='comparison'
 assert store._raw(validate_lesson(raw,d,store.icons))['chapters'][0]['teaching']=='comparison'
 raw['chapters'][0]['layout']='diagram'
 with pytest.raises(PlanError,match="teaching 'comparison' needs layout"):
  validate_lesson(raw,d,store.icons)


def test_live_process_is_a_chain_and_fanin_needs_a_hub(library):
 lib,d=library;store=BrowserLessonStore(Model(),STUDIO,documents=lib);_,raw=sample()
 raw['chapters'][1]['nodes'].append({'id':'third','title':'Third component','body':'A second input that also feeds the same condition.','icon':'package','color':'green','at':3,'tag':''})
 raw['chapters'][1]['connections']=[
  {'from':'inventory','to':'notice','label':'inspect terms'},
  {'from':'third','to':'notice','label':'also feed'}]
 with pytest.raises(PlanError,match='process layout is a chain'):
  validate_lesson(raw,d,store.icons)
 raw['chapters'][1]['layout']='fanin';raw['chapters'][1]['teaching']='mechanism'
 for i,n in enumerate(raw['chapters'][1]['nodes']):
  n['position']={'x':60+i*420,'y':150,'width':320,'height':260}
 assert validate_lesson(raw,d,store.icons)['chapters'][1]['visual']['layout']=='fanin'
 raw['chapters'][1]['connections']=[{'from':'inventory','to':'notice','label':'inspect terms'}]
 with pytest.raises(PlanError,match='fanin layout needs a hub'):
  validate_lesson(raw,d,store.icons)
