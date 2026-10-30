from __future__ import annotations

import queue
import threading
from pathlib import Path

from . import audio
from .config import Config
from .router import Router, build_router
from .stt import build_stt
from .tts import build_tts


class SpeechQueue:
    """Speaks text on a background thread so generation and playback overlap."""

    def __init__(self, tts, persona) -> None:
        self.tts = tts
        self.persona = persona
        self.spoke = False
        self._queue: queue.Queue = queue.Queue()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self) -> None:
        while True:
            text = self._queue.get()
            if text is None:
                self._queue.task_done()
                break
            spoken = self.persona.spoken(text) if self.persona else text
            if spoken and spoken.strip():
                try:
                    if self.tts.speak(spoken):
                        self.spoke = True
                except Exception:  # noqa: BLE001 - never let playback kill the run
                    pass
            self._queue.task_done()

    def say(self, text: str, interrupt: bool = False) -> None:
        if text and text.strip():
            if interrupt:
                self.interrupt()
            self._queue.put(text)

    def interrupt(self) -> None:
        """Barge-in / cut-through: stop active audio playback and clear pending speech."""
        audio.stop_playback()
        while not self._queue.empty():
            try:
                self._queue.get_nowait()
                self._queue.task_done()
            except queue.Empty:
                break

    def close(self) -> None:
        self._queue.put(None)
        self._thread.join()


class Orchestrator:
    def __init__(self, cfg: Config, router: Router | None = None, session: str | None = None) -> None:
        self.cfg = cfg
        self.router = router or build_router(cfg, session=session)
        self.tts = build_tts(cfg)
        self.stt = build_stt(cfg)
        self.persona = None
        if cfg.persona.enabled:
            from .persona import Persona

            self.persona = Persona(cfg)

    def handle_text(self, text: str, speak: bool = True, dry_run: bool = False):
        speech = SpeechQueue(self.tts, self.persona) if speak else None
        first: dict = {}

        def on_sentence(sentence: str) -> None:
            if "text" not in first:
                first["text"] = sentence
                speech.say(sentence)

        def on_progress(message: str) -> None:
            speech.say(message)

        split = bool(getattr(self.cfg.tts, "split_sentences", False))

        response = self.router.route(
            text,
            dry_run=dry_run,
            on_sentence=(on_sentence if (speech is not None and split) else None),
            on_progress=(on_progress if speech is not None else None),
        )
        if speech is not None:
            if response.data.get("spoken_progress"):
                pass
            elif split and response.data.get("streamed"):
                remainder = response.text
                spoken = first.get("text", "")
                if spoken and remainder.startswith(spoken):
                    remainder = remainder[len(spoken):].strip()
                speech.say(remainder)
            else:
                is_report = bool(response.source == "agent" and response.data.get("raw"))
                speech.say(response.text, interrupt=is_report)
            speech.close()
            response.spoke = speech.spoke
        return response

    def handle_audio(self, wav_path: str | Path, speak: bool = True, dry_run: bool = False):
        text = self.stt.transcribe(wav_path)
        response = self.handle_text(text, speak=speak, dry_run=dry_run)
        response.data["transcript"] = text
        return response

    def proactive(self, event: str, **kwargs) -> str:
        from .proactive import event_prompt

        instruction = event_prompt(event, **kwargs)
        return self.router.llm.answer(instruction, self.router._context_blob())

    def say(self, text: str, notify_desktop: bool = True) -> None:
        from . import notify as _notify
        from .proactive import mood_for

        audio.stop_playback()
        spoken = self.persona.spoken(text) if self.persona else text
        if spoken and spoken.strip():
            self.tts.speak(spoken)
        face = mood_for(text)
        if notify_desktop:
            _notify.send(f"{self.cfg.persona.name} {face}", text)
        self._osd(face, text)

    def _osd(self, face: str, text: str) -> None:
        import shutil
        import subprocess

        if not shutil.which("omarchy"):
            return
        try:
            subprocess.run(
                ["omarchy", "osd", "-m", f"{face} {text}"[:140], "-d", "6000"],
                check=False,
                timeout=10,
            )
        except (OSError, subprocess.SubprocessError):
            pass

    def listen(self, seconds: float | None = None, speak: bool = True, dry_run: bool = False):
        audio.stop_playback()
        seconds = seconds or self.cfg.stt.max_seconds
        wav = audio.record_wav(seconds, sample_rate=self.cfg.stt.sample_rate)
        if wav is None:
            response = self.router.route("")
            response.data["error"] = "recording failed"
            return response
        try:
            return self.handle_audio(wav, speak=speak, dry_run=dry_run)
        finally:
            wav.unlink(missing_ok=True)
