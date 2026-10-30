from unittest.mock import patch
import pytest
from assistant.config import Config
from assistant.http import HTTPError
from assistant.llm import build_visual_llm,ModelProviderError
from assistant.openrouter_visual import OpenRouterFreeVisualLLM,OpenRouterFreeError

MODEL='nvidia/nemotron-3.5-super-vl:free'

def config():
    cfg=Config();cfg.llm.visual_provider='openrouter-free';cfg.llm.visual_model=MODEL;cfg.llm.visual_vision_model=MODEL
    return cfg

def response(content='{"approved":true}',finish='stop'):
    return {'model':MODEL,'choices':[{'message':{'content':content},'finish_reason':finish}],
            'usage':{'prompt_tokens':100,'completion_tokens':20,'cost':0}}

def test_free_visual_provider_is_independent_of_general_chat_and_forbids_paid_fallbacks():
    cfg=config();original=(cfg.llm.base_url,cfg.llm.model,list(cfg.llm.fallback_models))
    with patch.object(Config,'secret',return_value='test-key'):
        llm=build_visual_llm(cfg)
    with patch('assistant.openrouter_visual.post_json',return_value=response()) as call:
        assert llm._chat([{'role':'user','content':'Review'}],max_tokens=4200)=='{"approved":true}'
        url,payload=call.call_args.args
        assert url=='https://openrouter.ai/api/v1/chat/completions'
        assert payload['model']==MODEL and 'models' not in payload and payload['max_tokens']==5224
        assert payload['reasoning']['max_tokens']==1024 and payload['reasoning']['exclude']
        assert payload['provider']['max_price']=={'prompt':0,'completion':0}
        assert not payload['provider']['allow_fallbacks'] and call.call_args.kwargs['retries']==0
    assert original==(cfg.llm.base_url,cfg.llm.model,cfg.llm.fallback_models)
    assert llm.metrics()['cost']==0 and llm.metrics()['requests']==1

def test_free_visual_provider_sends_actual_images_with_correct_mime_type():
    llm=OpenRouterFreeVisualLLM(config(),'test-key')
    with patch('assistant.openrouter_visual.post_json',return_value=response()) as call:
        llm.review_images('Inspect',[b'\x89PNG\r\n\x1a\nactual-frame'])
    content=call.call_args.args[1]['messages'][0]['content']
    assert content[1]['image_url']['url'].startswith('data:image/png;base64,')

@pytest.mark.parametrize('status',[401,402,403,404,429])
def test_route_or_rate_failure_never_uses_a_paid_model_or_exposes_provider_body(status):
    llm=OpenRouterFreeVisualLLM(config(),'test-key')
    with patch('assistant.openrouter_visual.post_json',side_effect=HTTPError(status,'private response test-key')) as call:
        with pytest.raises(OpenRouterFreeError) as exc:llm.compose('Return JSON')
    assert call.call_count==1 and 'private response' not in str(exc.value) and not exc.value.retryable

def test_paid_model_and_truncated_answer_are_rejected():
    cfg=config();cfg.llm.visual_model='nvidia/paid'
    with pytest.raises(ModelProviderError):OpenRouterFreeVisualLLM(cfg,'test-key')
    llm=OpenRouterFreeVisualLLM(config(),'test-key')
    with patch('assistant.openrouter_visual.post_json',return_value=response(finish='length')):
        with pytest.raises(OpenRouterFreeError,match='truncated'):llm.compose('Return JSON')
