"""The pixel-review gate must inspect native frames and release its worker."""
import json
from pathlib import Path
from unittest.mock import Mock
import pytest
from assistant.visual.frame_review import review_rendered
from assistant.visual.plan import PlanError


def test_review_receives_each_native_sample_and_closes_worker(tmp_path):
    (tmp_path/'frame.jpg').write_bytes(b'actual jpeg bytes')
    native=Mock();native.jobs={}
    def update(sid,state):
        native.jobs[sid]={'folder':tmp_path}
        return {'ready':True,'revision':'same','expectedRevision':'same'}
    native.update.side_effect=update
    model=Mock(spec=['review_images']);model.review_images.return_value=json.dumps({'approved':True,'findings':[],
        'observations':[{'beat':'example','visible':'A curve draws','inference':'The curve is visible'}]})
    scene={'beats':[{'duration':10}]}
    result=review_rendered(native,model,scene,{'beats':[{'id':'example'}]})
    assert result['approved']
    assert native.update.call_count==3
    assert model.review_images.call_args.args[1]==[b'actual jpeg bytes']*3
    native.close.assert_called_once()


def test_failed_vision_review_is_not_accepted(tmp_path):
    (tmp_path/'frame.jpg').write_bytes(b'frame')
    native=Mock(); native.jobs={}
    def update(sid,state):
        native.jobs[sid]={'folder':tmp_path};return {'ready':True,'revision':'x','expectedRevision':'x'}
    native.update.side_effect=update
    model=Mock(spec=['review_images']);model.review_images.return_value='{"approved":true,"findings":[{"problem":"overlap"}]}'
    with pytest.raises(PlanError,match='valid frame review'):
        review_rendered(native,model,{'beats':[{'duration':6}]},{})
    native.close.assert_called_once()


def test_antigravity_review_requires_completed_json_and_reads_temporary_images(monkeypatch):
    import subprocess
    from types import SimpleNamespace
    from assistant.config import Config
    from assistant.llm import AntigravityLLM, ModelProviderError
    seen=[]
    def run(cmd,**kwargs):
        seen.append((cmd,kwargs))
        assert (Path(kwargs['cwd'])/'frame-01.jpg').read_bytes()==b'jpeg'
        assert '--sandbox' in cmd and '--output-format' in cmd
        return SimpleNamespace(returncode=0,stdout=json.dumps({'status':'SUCCESS','response':'{"approved":true,"findings":[]}'}))
    monkeypatch.setattr(subprocess,'run',run)
    model=AntigravityLLM(Config())
    assert json.loads(model.review_images('Inspect this frame',[b'jpeg']))['approved']
    assert not Path(seen[0][1]['cwd']).exists()
    monkeypatch.setattr(subprocess,'run',lambda *a,**kw: SimpleNamespace(returncode=0,stdout=json.dumps({'status':'TIMEOUT','response':''})))
    with pytest.raises(ModelProviderError,match='did not complete'):
        model.review_images('Inspect this frame',[b'jpeg'])
