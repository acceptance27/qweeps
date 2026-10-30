"""Explicit free OpenRouter visual models, independent of general chat routing."""
from __future__ import annotations
import base64
import copy
import threading
import time
from .http import HTTPError,post_json
from .llm import OpenRouterLLM,ModelProviderError,ModelTimeoutError


class OpenRouterFreeError(ModelProviderError):
    retryable=False


class OpenRouterFreeVisualLLM(OpenRouterLLM):
    provider='openrouter-free'
    free_only=True

    def __init__(self,cfg,key):
        for model in (cfg.llm.visual_model,cfg.llm.visual_vision_model):
            if not isinstance(model,str) or not model.endswith(':free') or '/' not in model:
                raise OpenRouterFreeError('Choose explicit OpenRouter :free model IDs for generation and vision review.')
        local=copy.deepcopy(cfg)
        local.llm.base_url='https://openrouter.ai/api/v1'
        local.llm.model=cfg.llm.visual_model
        local.llm.fallback_models=[]
        local.llm.timeout=90
        super().__init__(local,key)
        self.vision_model=cfg.llm.visual_vision_model
        self.records=[]
        self._records_lock=threading.Lock()

    def _send(self,model,messages,max_tokens):
        thinking_budget=min(1024,max(256,max_tokens//3))
        payload={'model':model,'messages':messages,'max_tokens':max_tokens+thinking_budget,'temperature':.2,
                 'response_format':{'type':'json_object'},'reasoning':{'max_tokens':thinking_budget,'exclude':True},
                 'provider':{'allow_fallbacks':False,'require_parameters':True,'max_price':{'prompt':0,'completion':0}}}
        started=time.monotonic()
        try:
            data=post_json(self.base_url+'/chat/completions',payload,headers=self._headers(),timeout=self.timeout,retries=0)
        except HTTPError as exc:
            if exc.status in (401,402,403,404,429):
                reason={401:'authentication failed',402:'the free route was refused',403:'access was refused',404:'the free model is unavailable',429:'the free request limit was reached'}[exc.status]
                raise OpenRouterFreeError(f'OpenRouter: {reason} for {model}. No paid fallback was used.') from exc
            raise ModelProviderError(f'OpenRouter free visual request failed (HTTP {exc.status}).') from exc
        except TimeoutError as exc:
            raise ModelTimeoutError(f'OpenRouter free visual request exceeded {self.timeout} seconds.') from exc
        usage=data.get('usage') or {}
        with self._records_lock:
            self.records.append({'model':data.get('model',model),'seconds':round(time.monotonic()-started,3),
                                 'promptTokens':usage.get('prompt_tokens',0),'completionTokens':usage.get('completion_tokens',0),
                                 'reasoningTokens':(usage.get('completion_tokens_details') or {}).get('reasoning_tokens',0),
                                 'cost':usage.get('cost',0)})
        if usage.get('cost',0):raise OpenRouterFreeError('OpenRouter reported a charge on a free-only request; preparation stopped.')
        choices=data.get('choices') or []
        if not choices:raise ModelProviderError('OpenRouter returned no completed visual response.')
        choice=choices[0]
        if choice.get('finish_reason')=='length':raise OpenRouterFreeError('The free visual model exhausted its response token budget; no truncated lesson was accepted.')
        content=(choice.get('message',{}).get('content') or '').strip()
        if not content:raise ModelProviderError('OpenRouter returned an empty visual response.')
        return content

    def _chat(self,messages,max_tokens=None,models=None):
        if models and models!=[self.model]:raise OpenRouterFreeError('This visual provider cannot switch to an alternate model implicitly.')
        return self._send(self.model,messages,max_tokens or 4200)

    def compose(self,instruction,system=''):
        return self._chat([{'role':'system','content':system or 'Return only the requested JSON.'},
                           {'role':'user','content':instruction}])

    def review_images(self,instruction,frames):
        if not frames or len(frames)>24:raise ModelProviderError('Visual review needs 1–24 actual frames.')
        content=[{'type':'text','text':instruction}]
        for frame in frames:
            mime='image/png' if frame.startswith(b'\x89PNG') else 'image/jpeg'
            content.append({'type':'image_url','image_url':{'url':f'data:{mime};base64,'+base64.b64encode(frame).decode('ascii')}})
        return self._send(self.vision_model,[{'role':'user','content':content}],3200)

    def metrics(self):
        with self._records_lock:
            return {'requests':len(self.records),'promptTokens':sum(r['promptTokens'] for r in self.records),
                    'completionTokens':sum(r['completionTokens'] for r in self.records),
                    'cost':sum(r['cost'] for r in self.records),'calls':list(self.records)}
