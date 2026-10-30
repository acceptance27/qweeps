import io
import json
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from assistant.config import Config
from assistant.llm import AntigravityLLM, ModelProviderError, ModelTimeoutError, ModelUnexpectedToolError, ModelQuotaError, _antigravity_failure, build_visual_llm


def test_explicit_antigravity_provider_pins_gemini_for_generation_and_review(monkeypatch):
    cfg=Config();cfg.llm.auth_provider='opencode-go';cfg.llm.visual_provider='antigravity';cfg.llm.visual_model='gemini-3.8-flash-high';cfg.llm.visual_vision_model='gemini-3.8-flash-high'
    monkeypatch.setenv('QWEEPS_ANTIGRAVITY_VISUAL_MODEL','claude-sonnet-5-5-medium')
    monkeypatch.setenv('QWEEPS_ANTIGRAVITY_VISION_MODEL','claude-sonnet-5-5-medium')
    with patch('shutil.which',return_value='/bin/agy'):
        llm=build_visual_llm(cfg)
    assert isinstance(llm,AntigravityLLM) and cfg.llm.auth_provider=='opencode-go'
    with patch.object(llm,'_compose',return_value='{"ok":true}') as call:
        llm.compose('plan')
        assert call.call_args.kwargs['model']=='gemini-3.8-flash-high'
        llm._chat([{'role':'user','content':'direct'}])
        assert call.call_args.kwargs['model']=='gemini-3.8-flash-high'
        llm.review_images('inspect',[b'jpeg'])
        assert call.call_args.kwargs['model']=='gemini-3.8-flash-high'


def test_missing_antigravity_does_not_switch_visuals_to_opencode():
    with patch('shutil.which',return_value=None):
        with pytest.raises(ModelProviderError,match='Antigravity CLI'):
            cfg=Config();cfg.llm.visual_provider='antigravity'
            build_visual_llm(cfg)


def test_quota_message_uses_actual_model_and_only_known_agent_log_errors(tmp_path):
    log=tmp_path/'cli.log'
    log.write_text('unrelated startup failure: RESOURCE_EXHAUSTED secret\n')
    assert not isinstance(_antigravity_failure('ERROR','gemini-3.8-flash-high',log),ModelQuotaError)
    log.write_text('agent executor error: RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in 83h47m23s. secret\n')
    error=_antigravity_failure('ERROR','claude-sonnet-5-5-medium',log)
    assert isinstance(error,ModelQuotaError) and not error.retryable
    assert 'claude-sonnet-5-5-medium' in str(error) and '83h47m23s' in str(error)
    assert 'secret' not in str(error)


def run_process(events, log_text=''):
    p=Mock();p.stdout=io.StringIO('\n'.join(json.dumps(e) for e in events));p.stderr=io.StringIO('')
    def launch(cmd,**kwargs):
        log=Path(cmd[cmd.index('--log-file')+1]);log.write_text(log_text)
        p.log=log
        return p
    return p,launch


def test_quota_result_is_explained_from_private_request_log_and_cleaned():
    p,launch=run_process([{'event':'result','result':{'status':'ERROR'}}],
        'agent executor error: Individual quota reached. Resets in 2h3m. private\n')
    with patch('subprocess.Popen',side_effect=launch):
        with pytest.raises(ModelQuotaError,match='quota reached for gemini-3.8-flash-high'):
            AntigravityLLM(Config())._chat([{'role':'user','content':'request'}])
    assert not p.log.exists()
    p.terminate.assert_called_once();p.wait.assert_called()


def test_partial_text_without_completed_result_is_rejected():
    p,launch=run_process([{'event':'step_update','step_update':{'text_delta':'{"approved":true}'}}])
    with patch('subprocess.Popen',side_effect=launch):
        with pytest.raises(ModelProviderError,match='INCOMPLETE'):
            AntigravityLLM(Config()).compose('request')
    assert not p.log.exists()


def test_success_is_returned_before_waiting_for_cli_shutdown():
    p,launch=run_process([{'event':'result','result':{'status':'SUCCESS','response':'{"ok":true}'}}])
    with patch('subprocess.Popen',side_effect=launch):
        assert AntigravityLLM(Config())._chat([{'role':'user','content':'request'}])=='{"ok":true}'
    p.terminate.assert_called_once()
    assert not p.log.exists()


def test_full_timeout_is_not_blindly_retried_and_kills_the_owned_cli():
    p,launch=run_process([])
    with patch('subprocess.Popen',side_effect=launch),patch('assistant.llm._process_lines',side_effect=TimeoutError):
        with pytest.raises(ModelTimeoutError,match='did not finish') as error:
            AntigravityLLM(Config())._chat([{'role':'user','content':'request'}])
    assert not error.value.retryable
    p.terminate.assert_called_once()
    assert not p.log.exists()


def test_structured_text_request_stops_when_agent_enters_a_tool_loop():
    events=[{'event':'step_update','step_update':{'step_type':'tool','state':'ACTIVE','tool_name':'run_command'}},
            {'event':'result','result':{'status':'SUCCESS','response':'{"ok":true}'}}]
    p,launch=run_process(events)
    def launch_text(cmd,**kwargs):
        assert '--dangerously-skip-permissions' not in cmd
        assert '--settings' in cmd
        assert '{"toolPermission":"request-review"}' in cmd
        return launch(cmd,**kwargs)
    with patch('subprocess.Popen',side_effect=launch_text):
        with pytest.raises(ModelUnexpectedToolError,match='text-only') as error:
            AntigravityLLM(Config())._chat([{'role':'user','content':'return supplied data'}])
    assert not error.value.retryable
    p.terminate.assert_called_once()


def test_structured_text_request_stops_when_tool_denied():
    events=[{'event':'result','result':{'status':'SUCCESS','response':'','denied_actions':[{'action':'command'}]}}]
    p,launch=run_process(events)
    with patch('subprocess.Popen',side_effect=launch):
        with pytest.raises(ModelUnexpectedToolError,match='text-only') as error:
            AntigravityLLM(Config())._chat([{'role':'user','content':'return supplied data'}])
    assert not error.value.retryable


def test_image_review_transport_can_still_use_tools():
    events=[{'event':'step_update','step_update':{'step_type':'tool','state':'ACTIVE','tool_name':'view_file'}},
            {'event':'result','result':{'status':'SUCCESS','response':'{"approved":true}'}}]
    p,launch=run_process(events)
    with patch('subprocess.Popen',side_effect=launch):
        assert AntigravityLLM(Config())._compose('review image',model='gemini-3.8-flash-high',workdir='/tmp')=='{"approved":true}'
