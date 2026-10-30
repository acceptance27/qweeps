import io
import json
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from assistant.config import Config, config_from_toml
from assistant.llm import ModelProviderError, build_visual_llm
from assistant.opencode_llm import OpenCodeFreeLLM, OpenCodeLimitError


def model():
    cfg=Config()
    cfg.llm.visual_model='opencode/mimo-v2.6-flash-free'
    cfg.llm.visual_vision_model='opencode/nemotron-3.5-super-vl-free'
    with patch('assistant.opencode_llm.shutil.which', return_value='/bin/opencode'):
        return OpenCodeFreeLLM(cfg)


def process(events):
    p = Mock()
    p.stdout = io.StringIO('\n'.join(json.dumps(e) for e in events))
    p.stderr = io.StringIO('')
    p.poll.return_value = None
    return p


def success(text='{"ok":true}'):
    return [{'type':'text','part':{'type':'text','text':text}},
            {'type':'step_finish','part':{'reason':'stop'}}]


def test_explicit_visual_route_preserves_general_provider():
    cfg = config_from_toml({'llm':{'auth_provider':'antigravity','visual_provider':'opencode-free',
        'visual_model':'opencode/mimo-v2.6-flash-free','visual_vision_model':'opencode/nemotron-3.5-super-vl-free'}})
    with patch('assistant.opencode_llm.shutil.which', return_value='/bin/opencode'):
        llm = build_visual_llm(cfg)
    assert isinstance(llm, OpenCodeFreeLLM) and cfg.llm.auth_provider == 'antigravity'
    cfg.llm.visual_model = 'opencode-go/mimo-v2.6-flash'
    with pytest.raises(ModelProviderError,match='free model IDs'):
        build_visual_llm(cfg)
    cfg.llm.visual_provider = 'typo'
    with pytest.raises(ModelProviderError,match='Unknown visual'):
        build_visual_llm(cfg)


def test_native_cli_uses_free_models_for_maintenance_and_supplies_source_as_data():
    llm=model();p=process(success())
    def launch(cmd, **kwargs):
        assert cmd[:7] == ['/bin/opencode','run','--standalone','--format','json','--agent','plan']
        assert cmd[cmd.index('--model')+1] == llm.model
        assert cmd[-2:] == ['--','source with `literal` shell text']
        config=json.loads((Path(kwargs['cwd'])/'opencode.json').read_text())
        assert config['permissions'] == [{'action':'*','resource':'*','effect':'deny'}]
        assert all(a['model']==llm.model for a in config['agents'].values())
        assert 'source system' in config['agents']['plan']['system']
        return p
    with patch('assistant.opencode_llm.subprocess.Popen',side_effect=launch):
        assert llm.compose('source with `literal` shell text','source system') == '{"ok":true}'
    p.terminate.assert_called_once();p.wait.assert_called()


def test_quota_limit_is_sanitized_cached_and_not_retried_or_fallen_back():
    llm=model();p=process([{'type':'error','error':{'type':'provider.free-limit','status':429,
        'retryAfterMs':60000,'response':{'body':'private credential'},'message':'private credential'}}])
    with patch('assistant.opencode_llm.subprocess.Popen',return_value=p) as start:
        for _ in range(2):
            with pytest.raises(OpenCodeLimitError,match='free usage limit reached') as exc:
                llm.compose('request')
            assert 'private' not in str(exc.value) and not exc.value.retryable
        assert start.call_count==1
    p.terminate.assert_called_once()


@pytest.mark.parametrize('events',[
    [{'type':'text','part':{'text':'partial'}}],
    [{'type':'text','part':{'text':'partial'}},{'type':'step_finish','part':{'reason':'length'}}],
    [{'type':'tool_use','part':{'tool':'shell'}}],
    [{'type':'error','error':{'status':401,'message':'secret'}}],
])
def test_partial_tool_or_failed_response_cannot_publish(events):
    with patch('assistant.opencode_llm.subprocess.Popen',return_value=process(events)):
        with pytest.raises(ModelProviderError):model().compose('request')


def test_deadline_reaps_owned_process():
    p=process([])
    with patch('assistant.opencode_llm.subprocess.Popen',return_value=p),patch('assistant.opencode_llm._process_lines',side_effect=TimeoutError):
        with pytest.raises(ModelProviderError,match='did not finish'):model().compose('request')
    p.terminate.assert_called_once();p.wait.assert_called()


def test_review_attaches_actual_png_and_jpeg_to_explicit_free_vision_model():
    llm=model();frames=[b'\x89PNG\r\n\x1a\nreal-test-content',b'\xff\xd8\xffjpeg-content']
    def launch(cmd,**kwargs):
        assert cmd[cmd.index('--model')+1]==llm.vision_model
        attachments=[Path(cmd[i+1]) for i,x in enumerate(cmd) if x=='--file']
        assert [p.read_bytes() for p in attachments]==frames
        assert [p.suffix for p in attachments]==['.png','.jpg']
        config=json.loads((Path(kwargs['cwd'])/'opencode.json').read_text())
        assert all(a['model']==llm.vision_model for a in config['agents'].values())
        return process(success('{"approved":false}'))
    with patch('assistant.opencode_llm.subprocess.Popen',side_effect=launch):
        assert llm.review_images('inspect the supplied frames',frames)=='{"approved":false}'


def test_lesson_store_does_not_retry_exhausted_quota(tmp_path):
    from assistant.visual.browser_lessons import BrowserLessonStore
    store=BrowserLessonStore(model(),Path(__file__).resolve().parents[1]/'visual-studio',tmp_path)
    request=Mock(side_effect=OpenCodeLimitError('quota'))
    with pytest.raises(OpenCodeLimitError):store._request({'stage':'Planning'},request)
    assert request.call_count==1


def test_opencode_go_provider_with_deepseek_v4_1_flash():
    from assistant.opencode_llm import OpenCodeLLM
    cfg = Config()
    cfg.llm.visual_provider = "opencode-go"
    cfg.llm.visual_model = "opencode-go/deepseek-v4.1-flash"
    cfg.llm.visual_vision_model = "opencode-go/deepseek-v4.1-flash"
    with patch("assistant.opencode_llm.shutil.which", return_value="/bin/opencode"):
        llm = build_visual_llm(cfg)
    assert isinstance(llm, OpenCodeLLM)
    assert llm.model == "opencode-go/deepseek-v4.1-flash"
    assert llm.vision_model == "opencode-go/deepseek-v4.1-flash"
    assert llm.provider == "opencode-go"

    p = process(success('{"topic": "deepseek"}'))
    def launch(cmd, **kwargs):
        assert "--model" in cmd
        assert cmd[cmd.index("--model") + 1] == "opencode-go/deepseek-v4.1-flash"
        return p

    with patch("assistant.opencode_llm.subprocess.Popen", side_effect=launch):
        res = llm.compose("Explain something", "System prompt")
        assert res == '{"topic": "deepseek"}'

