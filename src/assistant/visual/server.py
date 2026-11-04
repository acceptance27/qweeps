"""Loopback-only studio host, model bridge, playback bus, and Manim worker."""
from __future__ import annotations

import argparse
import functools
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace
from urllib.parse import urlsplit, parse_qs
import uuid

from ..config import load_config, set_config_value, write_secret, write_default_config
from ..llm import build_visual_llm, OfflineLLM, AntigravityLLM, ModelProviderError
from ..http import HTTPError
from .plan import PlanError, _text, generate_reply, manim_source, validate_plan
from .render_backends import LocalCEBackend, backend_from_env
from .browser_gate import check_svg
from .beat_factory import BeatFactory
from .visual_beat_factory import VisualBeatFactory

PORT = 4174
_BUNDLED_STUDIO = Path(__file__).resolve().parents[3] / "visual-studio"
STUDIO_DIR = Path(os.environ.get("QWEEPS_STUDIO_DIR", str(
    _BUNDLED_STUDIO if _BUNDLED_STUDIO.is_dir() else Path.home() / "Work/manim-movingcamerascene-studio")))


def manim_python() -> str | None:
    configured = os.environ.get("QWEEPS_MANIM_PYTHON")
    qweeps_manim = Path.home() / ".local/share/qweeps/manim-ce/bin/python"
    legacy_manim = Path.home() / ".local/share/omarchy-assistant/manim-ce/bin/python"
    manim_default = str(qweeps_manim if qweeps_manim.is_file() else legacy_manim)
    candidates = [configured] if configured else [sys.executable, manim_default]
    for candidate in candidates:
        if not candidate or not Path(candidate).is_file():
            continue
        probe = subprocess.run([candidate, "-c", "import manim"], stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, timeout=15)
        if probe.returncode == 0:
            return candidate
    return None


class VisualService:
    def __init__(self, cfg=None, llm=None, render_dir: Path | None = None):
        self.cfg = cfg or load_config()
        model = llm if llm is not None else build_visual_llm(self.cfg)
        self.llm = model
        self.sessions: dict[str, dict] = {}
        self.active_id: str | None = None
        self.lock = threading.RLock()
        self.render_lock = threading.Lock()
        default_renders = (
            Path.home() / ".cache/qweeps/visual-renders"
            if (Path.home() / ".cache/qweeps/visual-renders").is_dir() or not (Path.home() / ".cache/omarchy-assistant/visual-renders").is_dir()
            else Path.home() / ".cache/omarchy-assistant/visual-renders"
        )
        self.render_dir = render_dir or default_renders
        self.renderer = manim_python()
        from .narration import NarrationStore
        from .native_host import NativeHost
        self.narration = NarrationStore(self.cfg)
        self.native = NativeHost(STUDIO_DIR)
        from .browser_lessons import BrowserLessonStore
        self.live = BrowserLessonStore(self.llm,STUDIO_DIR,folder=(render_dir.parent/'browser-lessons') if render_dir else None,
                                      narration=self.narration if self.cfg.tts.provider=='openrouter' else None)
        self.beats = BeatFactory(self.llm, STUDIO_DIR)
        self.visual_beats = VisualBeatFactory(self.llm, STUDIO_DIR)

    def health(self) -> dict:
        return {"service": "qweeps-visual", "version": 1,
                "model": (self.llm.visual_model or os.environ.get('QWEEPS_ANTIGRAVITY_VISUAL_MODEL','gemini-3.8-flash-high')
                          if isinstance(self.llm, AntigravityLLM) else getattr(self.llm,'model',self.cfg.llm.model)),
                "modelReady": not isinstance(self.llm, OfflineLLM),
                "provider": getattr(self.llm,'provider',self.cfg.llm.auth_provider),
                "visionModel": getattr(self.llm,'vision_model',None),
                "freeOnly": getattr(self.llm,'free_only',False),
                "modelUsage": self.llm.metrics() if hasattr(self.llm,'metrics') else None,
                "fallbackProvider": None if isinstance(self.llm, AntigravityLLM) or getattr(self.llm,'free_only',False) else self.cfg.llm.fallback_provider,
                "manimReady": self.renderer is not None, "tts": self.cfg.tts.provider,
                "renderBackend": os.environ.get("QWEEPS_RENDER_BACKEND", "local"),
                "rendererUrl": os.environ.get("QWEEPS_GM_URL", "http://127.0.0.1:8080"),
                "teachingMethod": "qweeps-visual-teaching",
                "lessonPipeline": ["storyboard", "animation", "teaching_review", "rendered_frame_review"],
                "teachingReferences": ["pdf_explainer", "math_01", "astar_heuristics", "hyperframes_rizal"],
                "liveGeneration": True,"livePipeline": ["source", "storyboard", "animation_direction", "browser_frame_review"]}

    def get_settings(self) -> dict:
        from .quiz_verifier import get_openrouter_key, get_opencode_go_key

        cfg = self.cfg
        or_key = get_openrouter_key(cfg)
        oc_key = get_opencode_go_key(cfg)
        agy_path = shutil.which('agy')

        masked_or = (or_key[:8] + '••••••••' + or_key[-4:]) if (or_key and len(or_key) > 12) else ('••••••••' if or_key else '')
        masked_oc = (oc_key[:6] + '••••••••' + oc_key[-4:]) if (oc_key and len(oc_key) > 10) else ('••••••••' if oc_key else '')

        return {
            "processes": {
                "lesson_planning": {
                    "id": "lesson_planning",
                    "title": "Live Visual Lesson Generation",
                    "subtitle": "Planning, Storyboard & Scene Synthesis",
                    "description": "Synthesizes pedagogical outline, scene architecture, and visual animation instructions from PDF/topics.",
                    "provider": getattr(cfg.llm, "visual_provider", "") or getattr(cfg.llm, "auth_provider", "opencode-go"),
                    "model": getattr(cfg.llm, "visual_model", "") or getattr(cfg.llm, "model", "opencode-go/muse-spark-1.3-contributor"),
                    "reasoning_effort": getattr(cfg.llm, "reasoning_effort", "low"),
                    "recommended": {
                        "provider": "opencode-go",
                        "model": "opencode-go/muse-spark-1.3-contributor",
                        "reasoning_effort": "low",
                        "badge": "⭐ Recommended (Free Tier & High Structure)"
                    },
                    "options": {
                        "providers": ["opencode-go", "openrouter-free", "antigravity", "openrouter", "offline"],
                        "models": [
                            {"value": "opencode-go/muse-spark-1.3-contributor", "label": "opencode-go/muse-spark-1.3-contributor", "badge": "⭐ Recommended Free Tier"},
                            {"value": "nvidia/nemotron-3.5-super-vl:free", "label": "nvidia/nemotron-3.5-super-vl:free", "badge": "⭐ OpenRouter Free"},
                            {"value": "google/gemini-2.0-flash-exp:free", "label": "google/gemini-2.0-flash-exp:free", "badge": "⚡ Fast Free"},
                            {"value": "gemini-3.8-flash-high", "label": "gemini-3.8-flash-high", "badge": "💎 Antigravity High Quality"}
                        ],
                        "reasoning": [
                            {"value": "none", "label": "None (Fastest ~1s)", "badge": "⚡ Fastest"},
                            {"value": "low", "label": "Low (Balanced ~2-4s)", "badge": "⭐ Recommended"},
                            {"value": "medium", "label": "Medium (Deeper thinking ~6s)"},
                            {"value": "high", "label": "High (Deep CoT ~10s+)"}
                        ]
                    }
                },
                "frame_review": {
                    "id": "frame_review",
                    "title": "Visual Review & Gate Verification",
                    "subtitle": "Rendered Frame & SVG Quality Gate",
                    "description": "Multimodal vision gate that inspects rendered SVG frames and canvas snapshots for legibility, overlap, and alignment.",
                    "provider": getattr(cfg.llm, "visual_provider", "") or "openrouter-free",
                    "model": getattr(cfg.llm, "visual_vision_model", "") or "nvidia/nemotron-3.5-super-vl:free",
                    "reasoning_effort": getattr(cfg.llm, "reasoning_effort", "low"),
                    "recommended": {
                        "provider": "openrouter-free",
                        "model": "nvidia/nemotron-3.5-super-vl:free",
                        "reasoning_effort": "low",
                        "badge": "⭐ Recommended (Multi-Modal Vision Free)"
                    },
                    "options": {
                        "providers": ["openrouter-free", "opencode-go", "antigravity"],
                        "models": [
                            {"value": "nvidia/nemotron-3.5-super-vl:free", "label": "nvidia/nemotron-3.5-super-vl:free", "badge": "⭐ Recommended Free Vision"},
                            {"value": "opencode-go/muse-spark-1.3-contributor", "label": "opencode-go/muse-spark-1.3-contributor", "badge": "⚡ Fast Vision"},
                            {"value": "gemini-3.8-flash-high", "label": "gemini-3.8-flash-high", "badge": "💎 Antigravity Vision"}
                        ],
                        "reasoning": [
                            {"value": "none", "label": "None (Instant check)"},
                            {"value": "low", "label": "Low (Pedagogic gate)", "badge": "⭐ Recommended"},
                            {"value": "medium", "label": "Medium"},
                            {"value": "high", "label": "High"}
                        ]
                    }
                },
                "quiz_generation": {
                    "id": "quiz_generation",
                    "title": "Reinforcement Quiz Generation",
                    "subtitle": "Mastery Question & Distractor Synthesis",
                    "description": "Extracts key concepts, creates fill-in-the-blank prompt stems, and synthesizes 3-5 word lead distractors grounded in reviewer notes.",
                    "provider": getattr(cfg.llm, "visual_provider", "") or "opencode-go",
                    "model": getattr(cfg.llm, "visual_model", "") or "opencode-go/muse-spark-1.3-contributor",
                    "reasoning_effort": getattr(cfg.llm, "reasoning_effort", "low"),
                    "recommended": {
                        "provider": "opencode-go",
                        "model": "opencode-go/muse-spark-1.3-contributor",
                        "reasoning_effort": "low",
                        "badge": "⭐ Recommended (Pedagogical Grounding)"
                    },
                    "options": {
                        "providers": ["opencode-go", "openrouter-free", "antigravity"],
                        "models": [
                            {"value": "opencode-go/muse-spark-1.3-contributor", "label": "opencode-go/muse-spark-1.3-contributor", "badge": "⭐ Recommended Free"},
                            {"value": "nvidia/nemotron-3.5-super-vl:free", "label": "nvidia/nemotron-3.5-super-vl:free", "badge": "⚡ Free OpenRouter"},
                            {"value": "gemini-3.8-flash-high", "label": "gemini-3.8-flash-high"}
                        ],
                        "reasoning": [
                            {"value": "none", "label": "None (Instant)"},
                            {"value": "low", "label": "Low (Strict Distractors)", "badge": "⭐ Recommended"},
                            {"value": "medium", "label": "Medium"},
                            {"value": "high", "label": "High"}
                        ]
                    }
                },
                "quiz_verification": {
                    "id": "quiz_verification",
                    "title": "Semantic Quiz Answer Verification",
                    "subtitle": "Sub-Second Typed Recall Evaluation",
                    "description": "Evaluates short typed user answers with zero-latency heuristics and sub-second semantic LLM judgment.",
                    "provider": getattr(cfg.llm, "quiz_verification_provider", "openrouter-free"),
                    "model": getattr(cfg.llm, "quiz_verification_model", "nvidia/nemotron-3.5-super-vl:free"),
                    "reasoning_effort": getattr(cfg.llm, "quiz_verification_reasoning", "none"),
                    "recommended": {
                        "provider": "openrouter-free",
                        "model": "nvidia/nemotron-3.5-super-vl:free",
                        "reasoning_effort": "none",
                        "badge": "⚡⭐ Recommended (Sub-Second 400-800ms Latency)"
                    },
                    "options": {
                        "providers": ["openrouter-free", "opencode-go", "heuristic"],
                        "models": [
                            {"value": "nvidia/nemotron-3.5-super-vl:free", "label": "nvidia/nemotron-3.5-super-vl:free", "badge": "⚡⭐ Recommended Sub-Second Free"},
                            {"value": "opencode-go/muse-spark-1.3-contributor", "label": "opencode-go/muse-spark-1.3-contributor", "badge": "⚡ Fast Go Fallback"}
                        ],
                        "reasoning": [
                            {"value": "none", "label": "None (⚡ Sub-Second Speed)", "badge": "⭐ Recommended for Sub-Second"},
                            {"value": "low", "label": "Low (Adds 2-4s thinking)"}
                        ]
                    }
                },
                "tts": {
                    "id": "tts",
                    "title": "Speech Synthesis & Narration (TTS)",
                    "subtitle": "Neural Spoken Teaching Audio",
                    "description": "Synthesizes expressive spoken audio for scene explanations, key concepts, and interactive learner feedback.",
                    "provider": getattr(cfg.tts, "provider", "openrouter"),
                    "model": getattr(cfg.tts, "model", "fish-audio/s2.1-pro-free:free"),
                    "voice": getattr(cfg.tts, "voice", "33a2191b8fda440cae962137e9793985"),
                    "recommended": {
                        "provider": "openrouter",
                        "model": "fish-audio/s2.1-pro-free:free",
                        "voice": "33a2191b8fda440cae962137e9793985",
                        "badge": "⭐ Recommended (Fish Audio Natural Free Voice)"
                    },
                    "options": {
                        "providers": ["openrouter", "piper", "espeak", "none"],
                        "models": [
                            {"value": "fish-audio/s2.1-pro-free:free", "label": "Fish Audio S2.1 Pro Free", "badge": "⭐ Recommended Natural Free Voice"},
                            {"value": "piper:en_US-lessac-medium", "label": "Piper Local Neural Voice", "badge": "🔒 100% Offline Private"}
                        ]
                    }
                },
                "stt": {
                    "id": "stt",
                    "title": "Voice Recognition & Transcription (STT)",
                    "subtitle": "Real-Time Microphone Question Input",
                    "description": "Transcribes live student spoken questions when pausing a visual lesson.",
                    "provider": getattr(cfg.stt, "provider", "voxtype"),
                    "engine": getattr(cfg.stt, "engine", "whisper"),
                    "model": getattr(cfg.stt, "stt_model", "fish-audio/transcribe-1"),
                    "recommended": {
                        "provider": "voxtype",
                        "engine": "whisper",
                        "badge": "⭐ Recommended (Local Fast Whisper STT)"
                    },
                    "options": {
                        "providers": ["voxtype", "openrouter", "none"],
                        "engines": [
                            {"value": "whisper", "label": "Whisper (Local Neural)", "badge": "⭐ Recommended Local"},
                            {"value": "cohere", "label": "Cohere Engine"},
                            {"value": "parakeet", "label": "NVIDIA Parakeet"}
                        ]
                    }
                }
            },
            "api_keys": {
                "openrouter": {
                    "configured": bool(or_key),
                    "masked": masked_or,
                    "source": "secrets.toml" if cfg.secret("OPENROUTER_API_KEY") else ("auth.json" if or_key else "none")
                },
                "opencode_go": {
                    "configured": bool(oc_key),
                    "masked": masked_oc,
                    "source": "auth.json" if oc_key else "none"
                },
                "antigravity": {
                    "available": bool(agy_path),
                    "path": agy_path or ""
                }
            }
        }

    def save_settings(self, payload: dict) -> dict:
        if not isinstance(payload, dict):
            raise PlanError("Settings payload must be an object")

        config_dir = getattr(self.cfg, "config_dir", None) or (Path.home() / ".config/qweeps")
        config_path = config_dir / "config.toml"
        if not config_path.is_file():
            config_path = write_default_config(config_dir)

        # 1. Update API Keys in secrets.toml if provided
        api_keys = payload.get("api_keys") or {}
        or_key = (api_keys.get("openrouter_key") or "").strip()
        if or_key and "••••" not in or_key:
            write_secret(config_dir, "OPENROUTER_API_KEY", or_key, "openrouter")
        oc_key = (api_keys.get("opencode_key") or "").strip()
        if oc_key and "••••" not in oc_key:
            write_secret(config_dir, "OPENCODE_API_KEY", oc_key, "opencode")

        # 2. Update config.toml
        text = config_path.read_text()
        processes = payload.get("processes") or {}

        # Lesson Planning
        lp = processes.get("lesson_planning") or {}
        if lp.get("provider"):
            text = set_config_value(text, "llm", "visual_provider", f'"{lp["provider"]}"')
        if lp.get("model"):
            text = set_config_value(text, "llm", "visual_model", f'"{lp["model"]}"')
        if lp.get("reasoning_effort"):
            text = set_config_value(text, "llm", "reasoning_effort", f'"{lp["reasoning_effort"]}"')

        # Frame Review
        fr = processes.get("frame_review") or {}
        if fr.get("model"):
            text = set_config_value(text, "llm", "visual_vision_model", f'"{fr["model"]}"')

        # Quiz Generation
        qg = processes.get("quiz_generation") or {}
        if qg.get("model"):
            # Quiz generation can reuse visual_model or custom
            pass

        # Quiz Verification
        qv = processes.get("quiz_verification") or {}
        if qv.get("provider"):
            text = set_config_value(text, "llm", "quiz_verification_provider", f'"{qv["provider"]}"')
        if qv.get("model"):
            text = set_config_value(text, "llm", "quiz_verification_model", f'"{qv["model"]}"')
        if qv.get("reasoning_effort"):
            text = set_config_value(text, "llm", "quiz_verification_reasoning", f'"{qv["reasoning_effort"]}"')

        # TTS
        tts = processes.get("tts") or {}
        if tts.get("provider"):
            text = set_config_value(text, "tts", "provider", f'"{tts["provider"]}"')
        if tts.get("model"):
            text = set_config_value(text, "tts", "model", f'"{tts["model"]}"')
        if tts.get("voice"):
            text = set_config_value(text, "tts", "voice", f'"{tts["voice"]}"')

        # STT
        stt = processes.get("stt") or {}
        if stt.get("provider"):
            text = set_config_value(text, "stt", "provider", f'"{stt["provider"]}"')
        if stt.get("engine"):
            text = set_config_value(text, "stt", "engine", f'"{stt["engine"]}"')
        if stt.get("model"):
            text = set_config_value(text, "stt", "stt_model", f'"{stt["model"]}"')

        config_path.write_text(text)

        # 3. Hot-reload configuration in-memory
        with self.lock:
            self.cfg = load_config(config_dir=config_dir)
            try:
                self.llm = build_visual_llm(self.cfg)
                if hasattr(self, 'live') and self.live:
                    self.live.llm = self.llm
                if hasattr(self, 'beats') and self.beats:
                    self.beats.llm = self.llm
                if hasattr(self, 'visual_beats') and self.visual_beats:
                    self.visual_beats.llm = self.llm
                from .narration import NarrationStore
                self.narration = NarrationStore(self.cfg)
                if hasattr(self, 'live') and self.live:
                    self.live.narration = self.narration if self.cfg.tts.provider == 'openrouter' else None
            except Exception:
                pass

        return {"ok": True, "settings": self.get_settings()}

    def session(self, sid: str | None = None) -> tuple[str, dict]:
        with self.lock:
            if sid is not None and sid not in self.sessions:
                raise KeyError("Visual session expired. Reload the studio.")
            if sid is None:
                sid = uuid.uuid4().hex
                if len(self.sessions) >= 32:
                    del self.sessions[next(iter(self.sessions))]
                self.sessions[sid] = {"context": {}, "history": [], "commands": [], "closed": False, "last_seen": time.monotonic()}
            return sid, self.sessions[sid]

    def state(self, sid: str | None = None) -> dict:
        with self.lock:
            sid = sid or self.active_id
            if not sid or sid not in self.sessions:
                return {"sessionId": None, "context": {}, "history": []}
            s = self.sessions[sid]
            return {"sessionId": sid, "context": s["context"], "history": s["history"], "closed": s["closed"]}

    def update(self, sid: str, context: dict) -> dict:
        if not isinstance(context, dict):
            raise PlanError("context must be an object")
        if len(json.dumps(context)) > 150_000:
            raise PlanError("scene context is too large")
        with self.lock:
            _, s = self.session(sid)
            s["context"] = context
            s["closed"] = False
            s["last_seen"] = time.monotonic()
            if context.get("focused", True) or self.active_id is None:
                self.active_id = sid
        return {"ok": True}

    def ask(self, payload: dict) -> dict:
        sid, session = self.session(payload.get("sessionId"))
        if isinstance(self.llm, OfflineLLM):
            raise PlanError("No AI model is configured. Configure the QWEEPS LLM before asking visual questions.")
        context = payload.get("context", session["context"])
        if not isinstance(context, dict) or len(json.dumps(context)) > 150_000:
            raise PlanError("invalid scene context")
        # The paused snapshot is captured before generation; later viewport changes
        # cannot silently alter the question the model is answering.
        context = json.loads(json.dumps(context))
        scene_id = context.get('sceneId') or ('live_generated' if context.get('lessonId') else 'rizal_live')
        if scene_id=='live_generated' and payload.get('mode','question') in {'question','branch'}:
            reply=self.live.answer(payload,context,list(session['history']))
        elif scene_id in {'jose_rizal','rizal_live'} and payload.get('mode','question') in {'question','branch'}:
            if context.get('sceneId')=='rizal_live':
                from .browser_rizal import reply as rizal_reply
            else:
                from .rizal import reply as rizal_reply
            manifest_name='rizal_live.json' if context.get('sceneId')=='rizal_live' else 'jose_rizal.json'
            manifest=json.loads((STUDIO_DIR/'public/lessons'/manifest_name).read_text())
            from .research import gather
            question=_text(payload.get('question'),'question',4000)
            passages=gather(question,manifest['sources'])
            reply=rizal_reply(self.llm,question,context,list(session['history']),manifest,payload.get('mode','question'),passages)
        elif payload.get("mode") == "branch" and context.get("sceneId") == "manim_production" and not context.get("teaching"):
            from .production import parameter_branch
            report = json.loads((STUDIO_DIR / "public/production/report.json").read_text())
            reply = parameter_branch(self.llm, payload.get("question"), context, list(session["history"]), report)
        else:
            from .frame_review import review_rendered
            reply = generate_reply(self.llm, payload.get("question"), context,
                                   list(session["history"]), payload.get("mode", "question"),
                                   rendered_review=lambda scene, storyboard: review_rendered(self.native,self.llm,scene,storyboard))
        with self.lock:
            session["history"] = (session["history"] + [
                {"role": "user", "content": payload["question"]},
                {"role": "assistant", "content": reply["answer"]}])[-20:]
            self.active_id = sid
        return {"sessionId": sid, **reply}

    def verify_quiz_answer(self, payload: dict) -> dict:
        from .quiz_verifier import verify_answer
        question = str(payload.get('question') or '').strip()
        expected = str(payload.get('expected') or '').strip()
        user_answer = str(payload.get('userAnswer') or '').strip()
        accepted = payload.get('acceptedAnswers') or []
        return verify_answer(question, expected, user_answer, accepted=accepted, cfg=self.cfg)

    def command(self, command: str, sid: str | None = None, **extra) -> dict:
        if command not in {"pause", "resume", "next", "previous", "branch", "close", "reply"}:
            raise PlanError("unknown playback command")
        with self.lock:
            sid = sid or self.active_id
            if not sid:
                raise PlanError("No visual window is connected.")
            _, session = self.session(sid)
            if session["closed"] or time.monotonic() - session["last_seen"] > 15:
                raise PlanError("The visual window is closed.")
            session["commands"] = (session["commands"] + [{"command": command, **extra}])[-32:]
        return {"ok": True}

    def drain(self, sid: str) -> dict:
        with self.lock:
            _, session = self.session(sid)
            commands, session["commands"] = session["commands"], []
        return {"commands": commands}

    def render(self, raw: dict) -> dict:
        return self._render_trusted_source(manim_source(validate_plan(raw)))

    def _render_trusted_source(self, source_text: str) -> dict:
        backend = backend_from_env(self.renderer)
        if isinstance(backend, LocalCEBackend) and not self.renderer:
            raise PlanError("Manim Community Edition is unavailable. Set QWEEPS_MANIM_PYTHON to a Python environment containing manim.")
        if not self.render_lock.acquire(blocking=False):
            raise PlanError("A Manim render is already running. Try again when it finishes.")
        try:
            job = uuid.uuid4().hex
            folder = self.render_dir / job
            folder.mkdir(parents=True)
            (folder / "lesson.py").write_text(source_text)
            try:
                result = backend.render(source_text, "QweepsLesson", folder)
            except subprocess.TimeoutExpired as exc:
                raise PlanError("Manim rendering exceeded the three-minute limit.") from exc
            except RuntimeError as exc:
                raise PlanError(str(exc)[-1800:]) from exc
            target = folder / "lesson.mp4"
            if Path(result.video).resolve() != target.resolve():
                shutil.copyfile(result.video, target)
            return {"url": f"/renders/{job}.mp4", "source": source_text,
                    "backend": result.backend}
        finally:
            self.render_lock.release()


class Handler(SimpleHTTPRequestHandler):
    service: VisualService

    def log_message(self, *args):
        pass

    def allowed(self) -> bool:
        host = self.headers.get("Host", "").split(":")[0]
        if host not in {"127.0.0.1", "localhost"}:
            return False
        origin = self.headers.get("Origin")
        if not origin:
            return True
        # The studio may be served on any local port (--port) or through the Vite
        # dev proxy. A local origin is no weaker than the existing no-Origin path,
        # which already serves requests from local clients.
        parsed = urlsplit(origin)
        return parsed.scheme in {"http", "https"} and parsed.hostname in {"127.0.0.1", "localhost"}

    def send_json(self, code, payload):
        try:
            body = json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def send_video(self, path: Path, mime_type="video/mp4"):
        """Serve byte ranges so chapter jumps and rewinding work in browsers."""
        if not path.is_file():
            self.send_error(404, "Video not found")
            return
        with path.open("rb") as source:
            size = os.fstat(source.fileno()).st_size
            start, end = 0, size - 1
            requested = self.headers.get("Range")
            if requested:
                match = re.fullmatch(r"bytes=(\d*)-(\d*)", requested.strip())
                try:
                    if not match or not any(match.groups()):
                        raise ValueError
                    first, last = match.groups()
                    if first:
                        start = int(first)
                        end = min(int(last), size - 1) if last else size - 1
                    else:
                        suffix = int(last)
                        if suffix <= 0:
                            raise ValueError
                        start = max(0, size - suffix)
                    if not 0 <= start <= end < size:
                        raise ValueError
                except ValueError:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
            self.send_response(206 if requested else 200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(end - start + 1))
            if requested:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            source.seek(start)
            remaining = end - start + 1
            try:
                while remaining:
                    chunk = source.read(min(64 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass  # Seeking cancels the browser's previous stream.

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        if not self.allowed():
            self.send_json(403, {"error": "Only local studio requests are accepted."})
            return
        parsed = urlsplit(self.path)
        try:
            if parsed.path == "/api/visual/health":
                self.send_json(200, self.service.health())
            elif parsed.path == "/api/visual/settings":
                self.send_json(200, self.service.get_settings())
            elif parsed.path == '/api/visual/documents':
                self.send_json(200,{'documents':self.service.live.documents.catalog()})
            elif re.fullmatch(r'/api/visual/documents/[0-9a-f]{32}/file',parsed.path):
                doc_id=parsed.path.split('/')[-2];self.service.live.documents.get(doc_id)
                self.send_video(self.service.live.documents.folder/doc_id/'source.pdf','application/pdf')
            elif re.fullmatch(r'/api/visual/live/stream-lesson/[0-9a-f]{32}',parsed.path):
                self.send_json(200,self.service.live.stream_lesson(parsed.path.rsplit('/',1)[-1]))
            elif re.fullmatch(r'/api/visual/live/stream/[0-9a-f]{32}',parsed.path):
                job_id=parsed.path.rsplit('/',1)[-1]
                self.send_response(200)
                self.send_header('Content-Type','text/event-stream')
                self.send_header('Cache-Control','no-cache')
                self.send_header('Connection','keep-alive')
                self.end_headers()
                try:
                    for event in self.service.live.stream_events(job_id):
                        self.wfile.write(('data: '+json.dumps(event)+'\n\n').encode())
                        self.wfile.flush()
                except (BrokenPipeError,ConnectionResetError):
                    pass
            elif re.fullmatch(r'/api/visual/visual-beats/stream/[0-9a-f]{32}',parsed.path):
                job_id=parsed.path.rsplit('/',1)[-1]
                self.send_response(200)
                self.send_header('Content-Type','text/event-stream')
                self.send_header('Cache-Control','no-cache')
                self.send_header('Connection','keep-alive')
                self.end_headers()
                try:
                    for event in self.service.visual_beats.events(job_id):
                        self.wfile.write(('data: '+json.dumps(event)+'\n\n').encode())
                        self.wfile.flush()
                except (BrokenPipeError,ConnectionResetError):
                    pass
            elif re.fullmatch(r'/api/visual/beats/stream/[0-9a-f]{32}',parsed.path):
                job_id=parsed.path.rsplit('/',1)[-1]
                self.send_response(200)
                self.send_header('Content-Type','text/event-stream')
                self.send_header('Cache-Control','no-cache')
                self.send_header('Connection','keep-alive')
                self.end_headers()
                try:
                    for event in self.service.beats.events(job_id):
                        self.wfile.write(('data: '+json.dumps(event)+'\n\n').encode())
                        self.wfile.flush()
                except (BrokenPipeError,ConnectionResetError):
                    pass
            elif re.fullmatch(r'/api/visual/live/jobs/[0-9a-f]{32}',parsed.path):
                self.send_json(200,self.service.live.status(parsed.path.rsplit('/',1)[-1]))
            elif parsed.path == '/api/visual/live/lessons':
                qs = parse_qs(parsed.query)
                sort_by = qs.get('sort', ['newest'])[0]
                self.send_json(200,{'lessons':self.service.live.catalog(sort_by=sort_by)})
            elif re.fullmatch(r'/api/visual/live/lessons/[A-Za-z0-9_-]+',parsed.path):
                self.send_json(200,self.service.live.lesson(parsed.path.rsplit('/',1)[-1]))
            elif parsed.path == "/api/visual/native/frame":
                sid = parse_qs(parsed.query).get("sessionId", [None])[0]
                if not sid: raise PlanError('A visual session is required')
                self.service.session(sid)
                job = self.service.native.ensure(sid)
                path = job['folder'] / 'frame.jpg'
                if not path.exists(): raise PlanError('The native frame is not ready')
                data = path.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'image/jpeg')
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(data)
            elif parsed.path == "/api/visual/native/stream":
                sid = parse_qs(parsed.query).get("sessionId", [None])[0]
                if not sid: raise PlanError('A visual session is required')
                self.service.session(sid)
                job = self.service.native.ensure(sid)
                deadline = time.monotonic() + 30
                frame = job['folder'] / 'frame.jpg'
                while not frame.exists() and time.monotonic() < deadline:
                    if job['process'].poll() is not None: raise PlanError(self.service.native.error(job))
                    time.sleep(.05)
                if not frame.exists(): raise PlanError('Native renderer is still preparing its first frame. Reload to retry.')
                self.send_response(200)
                self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=qweeps-frame')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(b'--qweeps-frame\r\n')
                last = None
                try:
                    while job['process'].poll() is None:
                        changed = frame.stat().st_mtime_ns
                        if changed != last:
                            data = frame.read_bytes()
                            self.wfile.write(b'Content-Type: image/jpeg\r\nContent-Length: '+str(len(data)).encode()+b'\r\n\r\n'+data+b'\r\n--qweeps-frame\r\n')
                            self.wfile.flush(); last = changed
                        time.sleep(1/30)
                except (BrokenPipeError, ConnectionResetError, FileNotFoundError): pass
            elif re.fullmatch(r"/narration/[0-9a-f]{64}\.mp3", parsed.path):
                filename = parsed.path.rsplit('/', 1)[-1]
                mp3_path = self.service.narration.folder / filename
                if not mp3_path.is_file():
                    bundled_mp3 = Path(__file__).resolve().parents[3] / 'bundled-lessons/visual-narration' / filename
                    if bundled_mp3.is_file():
                        mp3_path = bundled_mp3
                self.send_video(mp3_path, 'audio/mpeg')
            elif re.fullmatch(r"/narration/[0-9a-f]{64}\.wav", parsed.path):
                filename = parsed.path.rsplit('/', 1)[-1]
                wav_path = self.service.narration.folder / filename
                if not wav_path.is_file():
                    bundled_wav = Path(__file__).resolve().parents[3] / 'bundled-lessons/visual-narration' / filename
                    if bundled_wav.is_file():
                        wav_path = bundled_wav
                self.send_video(wav_path, 'audio/wav')
            elif parsed.path == "/api/visual/state":
                self.send_json(200, self.service.state(parse_qs(parsed.query).get("sessionId", [None])[0]))
            elif parsed.path == "/api/visual/events":
                self.send_json(200, self.service.drain(parse_qs(parsed.query).get("sessionId", [""])[0]))
            elif re.fullmatch(r"/renders/[0-9a-f]{32}\.mp4", parsed.path):
                job = parsed.path.split("/")[-1][:-4]
                path = self.service.render_dir / job / "lesson.mp4"
                self.send_video(path)
            elif re.fullmatch(r"/api/visual/clips/[a-z0-9_]+-(?:gl|ce)-[0-9a-f]{16}\.mp4", parsed.path):
                from .manim_clips import CLIPS, clip_path, source_sha
                stem = parsed.path.rsplit("/", 1)[-1][:-4]
                name, renderer, sha = stem.rsplit("-", 2)
                if name not in CLIPS or sha != source_sha(CLIPS[name]):
                    raise PlanError("Unknown visual clip")
                path = clip_path(name, renderer)
                if not path.is_file():
                    raise PlanError("Clip is not rendered yet; run assistant.visual.manim_clips render")
                self.send_video(path)
            elif parsed.path.startswith("/api/"):
                self.send_json(404, {"error": "Unknown API endpoint"})
            elif parsed.path.lower().endswith(".mp3"):
                self.send_video(Path(self.translate_path(self.path)), "audio/mpeg")
            elif parsed.path.lower().endswith(".mp4"):
                self.send_video(Path(self.translate_path(self.path)))
            else:
                super().do_GET()
        except (KeyError, PlanError) as exc:
            self.send_json(400, {"error": str(exc)})

    def do_POST(self):
        if not self.allowed() or self.headers.get_content_type() != "application/json":
            self.send_json(403, {"error": "Local JSON requests only"})
            return
        try:
            route = urlsplit(self.path).path
            length = int(self.headers.get("Content-Length", "0"))
            limit=36_000_000 if route=='/api/visual/documents' else 24_000_000 if route=='/api/visual/live/review' else 2_000_000 if route=='/api/visual/live/check' else 250_000
            if not 0 < length <= limit:
                raise PlanError(f"Request must be 1–{limit} bytes")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise PlanError("Request must be an object")
            route = urlsplit(self.path).path
            if route == "/api/visual/session":
                sid, _ = self.service.session()
                result = {"sessionId": sid}
            elif route == '/api/visual/documents':
                result=self.service.live.documents.ingest(payload)
            elif route == '/api/visual/visual-beats/start':
                result=self.service.visual_beats.start(payload)
            elif route == '/api/visual/beats/start':
                result=self.service.beats.start(payload)
            elif route == '/api/visual/live/jobs':
                result=self.service.live.start(payload)
            elif route == '/api/visual/live/quiz':
                target=payload.get('lessonId') or payload.get('lesson') or payload
                questions=self.service.live.generate_quiz(target)
                lesson_id=getattr(self.service.live, '_last_quiz_lesson_id', None)
                if not lesson_id:
                    if isinstance(target, dict):
                        lesson_id = target.get('lessonId') or target.get('id')
                    elif isinstance(target, str) and len(target) == 32:
                        lesson_id = target
                result={'quiz':questions,'count':len(questions)}
                if lesson_id:
                    result['lessonId'] = lesson_id
                    try:
                        result['lesson'] = self.service.live.lesson(lesson_id)
                    except Exception:
                        pass
            elif route == '/api/visual/live/verify-answer':
                result = self.service.verify_quiz_answer(payload)
            elif route == '/api/visual/settings':
                result = self.service.save_settings(payload)
            elif route == '/api/visual/live/stream':
                result=self.service.live.start_stream(payload)
            elif route == '/api/visual/live/check':
                try:timeout=min(120,max(20,int(payload.get('timeout',90))))
                except (TypeError,ValueError):raise PlanError('The browser gate timeout must be a number')
                result=check_svg(payload.get('svg'),timeout=timeout)
            elif route == '/api/visual/live/synchronize':
                result=self.service.live.start_synchronization(payload)
            elif route == '/api/visual/live/review':
                result=self.service.live.review(payload.get('jobId'),payload)
            elif route == "/api/visual/state":
                result = self.service.update(payload["sessionId"], payload["context"])
            elif route == "/api/visual/narration":
                result = self.service.narration.prepare(payload.get('text'))
            elif route == "/api/visual/native/close":
                self.service.native.close(payload["sessionId"])
                result = {"ok": True}
            elif route == "/api/visual/native/state":
                if not payload.get("sessionId"): raise PlanError("A visual session is required")
                self.service.session(payload['sessionId'])
                result = self.service.native.update(payload['sessionId'], payload.get('state', {}))
            elif route == "/api/visual/ask":
                result = self.service.ask(payload)
            elif route == "/api/visual/control":
                result = self.service.command(payload["command"], payload.get("sessionId"))
            elif route == "/api/visual/reply":
                result = self.service.command("reply", payload["sessionId"], question=payload["question"], reply=payload["reply"], speak=payload.get("speak", True))
            elif route == "/api/visual/window":
                from .window import desktop_window
                self.service.session(payload["sessionId"])
                result = {"applied": desktop_window(payload["sessionId"])}
            elif route == "/api/visual/closed":
                _, session = self.service.session(payload["sessionId"])
                session["closed"] = True
                self.service.native.close(payload["sessionId"])
                if payload.get("desktop"):
                    from .window import desktop_window
                    desktop_window(payload["sessionId"], close=True)
                result = {"ok": True}
            elif route in {"/api/visual/production/source", "/api/visual/production/render"}:
                from .production import native_source
                report = json.loads((STUDIO_DIR / "public/production/report.json").read_text())
                svg = (STUDIO_DIR / "public/production/stopwatch.svg").read_text()
                source = native_source(report, payload.get("experiment"), svg)
                result = self.service._render_trusted_source(source) if route.endswith("/render") else {"source": source}
            elif route == "/api/visual/source":
                result = {"source": manim_source(payload["scene"])}
            elif route == "/api/visual/render":
                result = self.service.render(payload["scene"])
            elif route == "/api/visual/speak":
                text = payload.get("text")
                if not isinstance(text, str) or len(text) > 6000:
                    raise PlanError("Invalid narration text")
                from ..audio import stop_playback
                from ..tts import build_tts
                stop_playback()
                engine = build_tts(self.service.cfg)
                spoken = engine.speak(text)
                result = {"spoken": bool(spoken)}
            elif route == "/api/visual/stop":
                from ..audio import stop_playback
                stop_playback()
                result = {"ok": True}
            else:
                self.send_json(404, {"error": "Unknown API endpoint"})
                return
            self.send_json(200, result)
        except (BrokenPipeError, ConnectionResetError):
            return
        except (ValueError, TypeError, KeyError) as exc:
            self.send_json(400, {"error": str(exc)})
        except ModelProviderError as exc:
            self.send_json(502, {"error": str(exc)})
        except HTTPError as exc:
            message = ("The configured AI provider requires an active OpenCode Go subscription. Restore access or choose another model provider in QWEEPS."
                       if "subscription" in exc.body.lower() else f"The configured AI provider rejected the request (HTTP {exc.status}). Check model access and credentials.")
            self.send_json(502, {"error": message})
        except Exception:
            import logging
            logging.getLogger(__name__).exception("Visual request failed")
            # Do not send provider response bodies (or credentials) into the browser.
            self.send_json(502, {"error": "QWEEPS could not complete the request. Check model connectivity and the visual server log."})


def serve(port=PORT, studio_dir=STUDIO_DIR, cfg=None):
    service = VisualService(cfg=cfg)
    handler = type("StudioHandler", (Handler,), {"service": service})
    httpd = ThreadingHTTPServer(("127.0.0.1", port), functools.partial(handler, directory=str(Path(studio_dir) / "dist")))
    print(f"QWEEPS visual studio http://127.0.0.1:{port}", flush=True)
    try:
        httpd.serve_forever()
    finally:
        httpd.server_close()
        for sid in list(service.native.jobs):service.native.close(sid)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--studio-dir", type=Path, default=STUDIO_DIR)
    parser.add_argument("--visual-provider",choices=('antigravity','opencode-go','opencode','opencode-free','openrouter-free'))
    parser.add_argument("--visual-model")
    parser.add_argument("--visual-vision-model")
    args = parser.parse_args()
    import signal
    def terminate(signum, frame):
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, terminate)
    cfg=load_config()
    env_oc_key = os.environ.get("OPENCODE_API_KEY") or (
        os.environ.get("OPENROUTER_API_KEY")
        if (os.environ.get("OPENROUTER_API_KEY") or "").startswith("oc_sk_")
        else None
    )
    if env_oc_key:
        auth_file = Path.home() / ".local" / "share" / "opencode" / "auth.json"
        if not auth_file.exists():
            try:
                auth_file.parent.mkdir(parents=True, exist_ok=True)
                auth_file.write_text(json.dumps({
                    "opencode": {"type": "api", "key": env_oc_key},
                    "opencode-go": {"type": "api", "key": env_oc_key},
                }))
                auth_file.chmod(0o600)
            except OSError:
                pass
    if args.visual_provider:cfg.llm.visual_provider=args.visual_provider
    if args.visual_model:
        cfg.llm.visual_model=args.visual_model
        cfg.llm.visual_vision_model=args.visual_vision_model or args.visual_model
    elif args.visual_vision_model:cfg.llm.visual_vision_model=args.visual_vision_model
    if not args.visual_provider:
        try:
            build_visual_llm(cfg)
        except ModelProviderError:
            cfg.llm.enabled = False
            if cfg.tts.provider == "openrouter" and not cfg.secret(cfg.tts.api_key_env):
                cfg.tts.provider = "none"
    serve(args.port, args.studio_dir,cfg=cfg)
