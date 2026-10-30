import copy
import pytest
from assistant.visual.synchronization import RATE,VERSION,assemble_lesson,lesson_script
from assistant.visual.alignment import measured_cues,validate_anchors,phrase_range,align_recordings,ENGINE
from assistant.visual.plan import PlanError


def lesson():
 return {'id':'a'*32,'chapters':[{'id':'fruit','start':0,'end':40,'finishedAt':38,'narration':'Consider fruit. Apple is crisp. Orange is juicy. Banana is soft. Compare their texture.','visual':{'nodes':[{'id':'apple'},{'id':'orange'},{'id':'banana'}]}}]}


def plan():
 return {'chapters':[{'id':'fruit','anchors':[{'target':target,'phrase':phrase} for target,phrase in [('context','Consider fruit'),('apple','Apple is crisp'),('orange','Orange is juicy'),('banana','Banana is soft'),('takeaway','Compare their texture')]]}]}


def alignment():
 words=lesson()['chapters'][0]['narration'].split();starts=[0,.2,1,1.3,1.5,4,4.3,4.5,6,6.3,6.5,8,8.2,8.4]
 return {'words':[{'text':w,'start':t,'end':t+.15} for w,t in zip(words,starts)]}


def full_alignment():
 return {'words':alignment()['words']+[{**w,'start':w['start']+9,'end':w['end']+9} for w in alignment()['words']]}


def test_whole_lesson_preserves_one_performance_and_uses_measured_beat_boundaries():
 base=lesson();base['chapters'].append(copy.deepcopy(base['chapters'][0]));base['chapters'][1]['id']='second'
 plans=plan()['chapters']*2;piece=bytes(RATE*2*18)
 audio,result=assemble_lesson(base,plans,piece,full_alignment())
 first,second=result['chapters']
 assert first['end']==second['start']==pytest.approx(.3+(8.55+9)/2)
 assert result['duration']==pytest.approx(19.3),'only one lead-in and closing hold, no per-beat pauses'
 assert audio[int(.3*RATE)*2:-int(RATE)*2]==piece,'the recording must remain whole and uncut'
 assert first['narrationCues'][1]['start']==pytest.approx(1.3)
 assert second['start']+second['narrationCues'][1]['start']==pytest.approx(10.3)
 assert result['narrationScript']==lesson_script(base)
 assert first['start']<=first['finishedAt']<first['end']
 assert second['start']<=second['finishedAt']<second['end']
 assert result['chapters'][0]['narration']==base['chapters'][0]['narration']
 assert first['cues'][1]=={'at':pytest.approx(1.3),'text':'Apple is crisp.'}
 assert first['cues'][-1]['text']=='Compare their texture.'


def test_whole_lesson_rejects_a_recording_missing_the_last_beat():
 base=lesson();base['chapters'].append(copy.deepcopy(base['chapters'][0]));base['chapters'][1]['id']='second'
 with pytest.raises(PlanError,match='closely enough|complete narration'):
  assemble_lesson(base,plan()['chapters']*2,bytes(RATE*2*18),alignment())


def test_visual_handoff_waits_for_the_measured_end_of_the_incoming_reasoning_bridge():
 base=lesson();base['chapters'].append(copy.deepcopy(base['chapters'][0]));base['chapters'][1]['id']='second'
 base['chapters'][1]['continuity']={'from':'fruit','bridge':'Consider fruit. Apple is crisp.'}
 _,result=assemble_lesson(base,plan()['chapters']*2,bytes(RATE*2*18),full_alignment())
 first,second=result['chapters']
 assert second['visualStart']==pytest.approx(.3+10.65)
 assert first['visualEnd']==second['visualStart']
 assert first['end']<second['visualStart'],'keep the previous completed diagram during the incoming spoken bridge'
 assert first['finishedAt']<first['end']
 assert second['continuity']['spokenEnd']==second['visualStart']


def test_missing_bridge_final_word_does_not_produce_an_early_guessed_visual_handoff():
 base=lesson();base['chapters'].append(copy.deepcopy(base['chapters'][0]));base['chapters'][1]['id']='second'
 base['chapters'][1]['continuity']={'from':'fruit','bridge':'Consider fruit. Apple is crisp.'}
 words=full_alignment();words['words'][18]['text']='unrecognized'
 with pytest.raises(PlanError,match='final word'):
  assemble_lesson(base,plan()['chapters']*2,bytes(RATE*2*18),words)


def test_exact_phrase_cues_allow_returns_and_grouped_context_without_rewriting_speech():
 raw=plan();assert validate_anchors(raw,lesson()['chapters'])==raw['chapters']
 raw['chapters'][0]['anchors'].append({'target':'apple','phrase':'Compare their texture','attention':False})
 assert len(validate_anchors(raw,lesson()['chapters'])[0]['anchors'])==6
 bad=plan();bad['chapters'][0]['anchors'][1]['phrase']='invented spoken words'
 with pytest.raises(PlanError,match='absent'):validate_anchors(bad,lesson()['chapters'])
 assert phrase_range('Apple first. Apple again.','Apple',2)==(2,3)


def test_alignment_failure_does_not_fall_back_to_guessed_times():
 with pytest.raises(PlanError,match='closely enough'):
  measured_cues(lesson()['chapters'][0]['narration'],plan()['chapters'][0]['anchors'],{'words':[{'text':'unrelated speech','start':0,'end':1}]},9)
 bad=alignment();bad['words'][0]['start']=float('nan')
 with pytest.raises(PlanError,match='invalid word times'):
  measured_cues(lesson()['chapters'][0]['narration'],plan()['chapters'][0]['anchors'],bad,9)


def test_different_recording_cannot_reuse_old_word_timestamps(tmp_path):
 import hashlib,json
 from unittest.mock import Mock,patch
 audio=tmp_path/'clip.mp3';audio.write_bytes(b'original recording')
 key=hashlib.sha256(audio.read_bytes()+ENGINE.encode()).hexdigest()
 (tmp_path/(key+'.words.json')).write_text(json.dumps(alignment()))
 narration=Mock(folder=tmp_path)
 with patch('assistant.visual.alignment.runtime',side_effect=PlanError('alignment runtime requested')):
  assert align_recordings(narration,[{'key':'clip'}],lambda _:None)==[alignment()]
  audio.write_bytes(b'a regenerated recording with different timing')
  with pytest.raises(PlanError,match='runtime requested'):align_recordings(narration,[{'key':'clip'}],lambda _:None)


def test_interrupted_mapping_resumes_only_missing_beats_without_publishing_partial_audio(tmp_path):
 import json,time
 from unittest.mock import Mock,patch
 from assistant.visual.synchronization import compile_speech,fingerprint
 base=lesson();base['chapters'][0]['visual']['nodes']=[{'id':n['id'],'title':n['id'],'body':n['id']} for n in base['chapters'][0]['visual']['nodes']]
 base['chapters'].append(copy.deepcopy(base['chapters'][0]));base['chapters'][1]['id']='second'
 folder=tmp_path/base['id'];folder.mkdir();original=json.dumps(base);(folder/'lesson.json').write_text(original)
 narration=Mock(folder=tmp_path);narration.signature.return_value={'voice':'test'};narration.prepare_lesson.return_value={'key':'clip'}
 (tmp_path/'clip.pcm').write_bytes(bytes(RATE*2*18))
 store=Mock(folder=tmp_path,narration=narration);store._request.side_effect=lambda job,call:call()
 def mapping(_llm,_system,payload,validator,**_kwargs):
  chapter=payload['chapters'][0]
  if chapter['id']=='second':raise PlanError('provider interrupted')
  p=plan();p['chapters'][0]['id']=chapter['id'];return validator(p)
 with patch('assistant.visual.synchronization._model_json',side_effect=mapping):
  with pytest.raises(PlanError,match='interrupted'):compile_speech(store,{'lessonId':base['id']},base)
 deadline=time.monotonic()+2
 while not list(folder.glob('speech-anchor-*.json')) and time.monotonic()<deadline:time.sleep(.01)
 assert len(list(folder.glob('speech-anchor-*.json')))==1
 assert not (folder/f'speech-{fingerprint(base,narration)}.json').exists(),'a partial audio timeline must not replace the approved lesson'
 def resume(_llm,_system,payload,validator,**_kwargs):
  p=plan();p['chapters'][0]['id']=payload['chapters'][0]['id'];return validator(p)
 with patch('assistant.visual.synchronization._model_json',side_effect=resume) as model,patch('assistant.visual.synchronization.align_recordings',return_value=[full_alignment()]):
  result=compile_speech(store,{'lessonId':base['id']},base)
 assert model.call_count==1 and result['speechSynchronization']['version']==VERSION
 narration.prepare_lesson.assert_called_once_with(lesson_script(base))
 narration.prepare.assert_not_called()
 assert (folder/'lesson.json').read_text()==original


def test_failed_mapping_reports_before_another_running_request_finishes(tmp_path):
 from concurrent.futures import ThreadPoolExecutor
 from threading import Event
 from unittest.mock import Mock,patch
 from assistant.visual.synchronization import compile_speech
 base=lesson();base['chapters'][0]['visual']['nodes']=[{'id':n['id'],'title':n['id'],'body':n['id']} for n in base['chapters'][0]['visual']['nodes']]
 base['chapters'].append(copy.deepcopy(base['chapters'][0]));base['chapters'][1]['id']='slow'
 (tmp_path/base['id']).mkdir();narration=Mock(folder=tmp_path);narration.signature.return_value={'voice':'test'}
 store=Mock(folder=tmp_path,narration=narration);store._request.side_effect=lambda job,call:call()
 started,release=Event(),Event()
 def mapping(_llm,_system,payload,validator,**_kwargs):
  if payload['chapters'][0]['id']=='slow':
   started.set();release.wait(5)
   p=plan();p['chapters'][0]['id']='slow';return validator(p)
  assert started.wait(2)
  raise PlanError('provider interrupted')
 try:
  with patch('assistant.visual.synchronization._model_json',side_effect=mapping),ThreadPoolExecutor(max_workers=1) as caller:
   future=caller.submit(compile_speech,store,{'lessonId':base['id']},base)
   try:
    with pytest.raises(PlanError,match='interrupted'):future.result(timeout=2)
   finally:release.set()
 finally:release.set()


def test_existing_reviewed_track_stays_available_until_upgrade_is_ready(tmp_path):
 import hashlib,json,threading
 from unittest.mock import Mock,patch
 from assistant.visual.browser_lessons import BrowserLessonStore
 from assistant.visual.synchronization import fingerprint
 base=lesson();folder=tmp_path/base['id'];folder.mkdir();(folder/'lesson.json').write_text(json.dumps(base))
 narration=Mock();narration.signature.return_value={'voice':'test'}
 old=hashlib.sha256(json.dumps({'version':1,'lesson':base,'voice':narration.signature()},sort_keys=True).encode()).hexdigest()
 previous={**base,'audioTrack':{'url':'old.wav'},'speechSynchronization':{'version':1}}
 (folder/f'speech-{old}.json').write_text(json.dumps(previous))
 store=BrowserLessonStore.__new__(BrowserLessonStore);store.folder=tmp_path;store.narration=narration;store.jobs={};store.lock=threading.RLock();store.documents=Mock()
 assert store.lesson(base['id'])==previous
 with patch('assistant.visual.browser_lessons.threading.Thread') as thread:
  job=store.start_synchronization({'lessonId':base['id']})
  assert job['status']=='preparing'
  thread.return_value.start.assert_called_once()
 previous_two={**base,'audioTrack':{'url':'beat-recordings.wav'},'speechSynchronization':{'version':2}}
 (folder/f'speech-{fingerprint(base,narration,2)}.json').write_text(json.dumps(previous_two))
 assert store.lesson(base['id'])==previous_two
 current={**base,'audioTrack':{'url':'new.wav'},'speechSynchronization':{'version':VERSION}}
 (folder/f'speech-{fingerprint(base,narration)}.json').write_text(json.dumps(current))
 assert store.lesson(base['id'])==current


def test_speech_provider_daily_limit_is_not_blindly_retried(tmp_path):
 from unittest.mock import Mock,patch
 from assistant.config import Config
 from assistant.visual.narration import NarrationStore
 from assistant.http import HTTPError
 store=NarrationStore(Config(),tmp_path);engine=Mock(model='free-model')
 error=HTTPError(429,'{"error":{"message":"daily quota reached"}}')
 with patch('assistant.visual.narration.post_raw',side_effect=error) as request:
  with pytest.raises(PlanError,match='Speech provider.*429'):store._request(engine,{})
  assert request.call_count==1


def test_speech_provider_per_minute_limit_obeys_cooldown_then_resumes(tmp_path):
 from unittest.mock import Mock,patch
 from assistant.config import Config
 from assistant.visual.narration import NarrationStore
 from assistant.http import HTTPError
 store=NarrationStore(Config(),tmp_path);engine=Mock(model='free-model')
 error=HTTPError(429,'{"error":{"message":"free-models-per-min","metadata":{"headers":{"X-RateLimit-Reset":"102000"}}}}')
 clock=[100.0]
 def sleep(delay):clock[0]+=delay
 with patch('assistant.visual.narration.post_raw',side_effect=[error,b'actual audio']) as request,patch('assistant.visual.narration.time.monotonic',side_effect=lambda:clock[0]),patch('assistant.visual.narration.time.time',side_effect=lambda:clock[0]),patch('assistant.visual.narration.time.sleep',side_effect=sleep):
  assert store._request(engine,{})==b'actual audio'
  assert request.call_count==2 and clock[0]>=103
