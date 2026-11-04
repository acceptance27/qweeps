"""Sub-second semantic quiz answer verifier supporting OpenRouter Free and OpenCode Go."""
from __future__ import annotations
import json
import os
import re
import uuid
import tomllib
from pathlib import Path
from typing import Any
from ..http import post_json, HTTPError

STOPWORDS = {
    'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'was',
    'by', 'that', 'this', 'it', 'be', 'are', 'as', 'with', 'from', 'were', 'into'
}


def clean_tokens(text: str) -> list[str]:
    cleaned = re.sub(r'[^a-zA-Z0-9\s]', ' ', (text or '').lower())
    return [w for w in cleaned.split() if w not in STOPWORDS and len(w) >= 2]


def fast_heuristic_verify(user: str, expected: str, accepted: list[str] | None = None) -> bool:
    """Instant 0ms heuristic check for exact matches, substrings, and high token overlap."""
    u_tokens = clean_tokens(user)
    e_tokens = clean_tokens(expected)
    if not u_tokens or not e_tokens:
        return False
    u_norm = ' '.join(u_tokens)
    e_norm = ' '.join(e_tokens)
    if u_norm == e_norm or u_norm in e_norm or e_norm in u_norm:
        return True
    for a in (accepted or []):
        a_tokens = clean_tokens(a)
        if not a_tokens:
            continue
        a_norm = ' '.join(a_tokens)
        if u_norm == a_norm or u_norm in a_norm or a_norm in u_norm:
            return True
    u_set = set(u_tokens)
    e_set = set(e_tokens)
    intersection = u_set & e_set
    if not intersection:
        return False
    coverage = len(intersection) / len(e_set)
    jaccard = len(intersection) / len(u_set | e_set)
    if coverage >= 0.6 or jaccard >= 0.5:
        return True
    return False


def get_openrouter_key(cfg=None) -> str | None:
    if cfg and hasattr(cfg, 'secret'):
        key = cfg.secret('OPENROUTER_API_KEY')
        if key:
            return key
    key = os.environ.get('OPENROUTER_API_KEY')
    if key:
        return key
    for path in [
        Path.home() / '.config/qweeps/secrets.toml',
        Path.home() / '.config/omarchy-assistant/secrets.toml'
    ]:
        if path.is_file():
            try:
                data = tomllib.loads(path.read_text())
                k = (data.get('openrouter') or {}).get('OPENROUTER_API_KEY') or (data.get('openrouter') or {}).get('key')
                if k:
                    return k
            except Exception:
                pass
    auth_file = Path.home() / '.local/share/opencode/auth.json'
    if auth_file.is_file():
        try:
            data = json.loads(auth_file.read_text())
            k = (data.get('openrouter') or {}).get('key')
            if k:
                return k
        except Exception:
            pass
    return None


def get_opencode_go_key(cfg=None) -> str | None:
    for env_var in ('OPENCODE_API_KEY', 'OPENROUTER_API_KEY'):
        cand = (os.environ.get(env_var) or '').strip()
        if cand.startswith('oc_sk_'):
            return cand
    auth_file = Path.home() / '.local/share/opencode/auth.json'
    if auth_file.is_file():
        try:
            data = json.loads(auth_file.read_text())
            k = (data.get('opencode-go') or {}).get('key') or (data.get('opencode') or {}).get('key')
            if k:
                return k
        except Exception:
            pass
    return None


def verify_with_openrouter(
    question: str,
    expected: str,
    user_answer: str,
    accepted: list[str] | None,
    api_key: str,
    model: str = 'nvidia/nemotron-3.5-super-vl:free',
    timeout: int = 8
) -> dict[str, Any] | None:
    prompt = f"""You are a strict but fair pedagogical examiner evaluating a learner's short typed answer.
Question: {question}
Expected authoritative answer: {expected}
Student's typed response: {user_answer}
Accepted variations: {json.dumps(accepted or [])}

Does the student's response demonstrate essentially correct understanding of the expected concept?
Allow minor typos, paraphrasing, synonyms, concise summaries, or alternative valid wording.
Reject answers that contradict the core fact, state the opposite, or give unrelated information.

Return JSON only:
{{"correct": true/false, "confidence": 0.0-1.0, "feedback": "one short sentence explaining why"}}"""

    try:
        data = post_json(
            'https://openrouter.ai/api/v1/chat/completions',
            payload={
                'model': model,
                'messages': [{'role': 'user', 'content': prompt}],
                'max_tokens': 350,
                'temperature': 0.1
            },
            headers={'Authorization': f'Bearer {api_key}'},
            timeout=timeout,
            retries=0
        )
        content = data.get('choices', [{}])[0].get('message', {}).get('content') or ''
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            parsed = json.loads(match.group(0))
            return {
                'correct': bool(parsed.get('correct')),
                'confidence': float(parsed.get('confidence', 0.9)),
                'feedback': str(parsed.get('feedback', '')).strip(),
                'source': f'openrouter:{model}'
            }
    except Exception:
        pass
    return None


def verify_with_opencode_go(
    question: str,
    expected: str,
    user_answer: str,
    accepted: list[str] | None,
    api_key: str,
    model: str = 'muse-spark-1.3-contributor',
    timeout: int = 8
) -> dict[str, Any] | None:
    prompt = f"""You are a strict but fair pedagogical examiner evaluating a learner's short typed answer.
Question: {question}
Expected authoritative answer: {expected}
Student's typed response: {user_answer}
Accepted variations: {json.dumps(accepted or [])}

Does the student's response demonstrate essentially correct understanding of the expected concept?
Allow minor typos, paraphrasing, synonyms, concise summaries, or alternative valid wording.
Reject answers that contradict the core fact, state the opposite, or give unrelated information.

Return JSON only:
{{"correct": true/false, "confidence": 0.0-1.0, "feedback": "one short sentence explaining why"}}"""

    try:
        api_model = model.split('/', 1)[1] if '/' in model else model
        headers = {
            'Authorization': f'Bearer {api_key}',
            'User-Agent': 'opencode/1.19.5',
            'x-opencode-session': uuid.uuid4().hex
        }
        data = post_json(
            'https://opencode.ai/inference/go/openai/v1/chat/completions',
            payload={
                'model': api_model,
                'messages': [{'role': 'user', 'content': prompt}],
                'max_tokens': 350,
                'temperature': 0.1,
                'reasoning_effort': 'low'
            },
            headers=headers,
            timeout=timeout,
            retries=0
        )
        content = data.get('choices', [{}])[0].get('message', {}).get('content') or ''
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            parsed = json.loads(match.group(0))
            return {
                'correct': bool(parsed.get('correct')),
                'confidence': float(parsed.get('confidence', 0.9)),
                'feedback': str(parsed.get('feedback', '')).strip(),
                'source': f'opencode-go:{model}'
            }
    except Exception:
        pass
    return None


def verify_answer(
    question: str,
    expected: str,
    user_answer: str,
    accepted: list[str] | None = None,
    cfg: Any = None
) -> dict[str, Any]:
    raw_user = (user_answer or '').strip()
    raw_expected = (expected or '').strip()
    if not raw_user:
        return {'correct': False, 'confidence': 1.0, 'feedback': 'No answer provided', 'source': 'empty'}

    # 1. Tier 0: Fast heuristic check (0ms)
    if fast_heuristic_verify(raw_user, raw_expected, accepted):
        return {'correct': True, 'confidence': 1.0, 'feedback': 'Exact or direct match', 'source': 'heuristic'}

    # 2. Tier 1: Try OpenRouter Free model first (preferred by user)
    or_key = get_openrouter_key(cfg)
    if or_key:
        free_model = getattr(cfg.llm, 'model', None) if cfg and getattr(getattr(cfg, 'llm', None), 'model', '').endswith(':free') else 'nvidia/nemotron-3.5-super-vl:free'
        res = verify_with_openrouter(question, raw_expected, raw_user, accepted, or_key, model=free_model)
        if res:
            return res

    # 3. Tier 2: Try OpenCode Go cheap model (fallback)
    oc_key = get_opencode_go_key(cfg)
    if oc_key:
        go_model = getattr(getattr(cfg, 'llm', None), 'visual_model', None) if cfg else 'opencode-go/muse-spark-1.3-contributor'
        res = verify_with_opencode_go(question, raw_expected, raw_user, accepted, oc_key, model=go_model)
        if res:
            return res

    # 4. Final heuristic fallback if offline / rate limited
    return {
        'correct': False,
        'confidence': 0.5,
        'feedback': f'Does not match expected answer: "{raw_expected}"',
        'source': 'fallback'
    }
