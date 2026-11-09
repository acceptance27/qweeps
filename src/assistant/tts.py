from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Protocol

from . import audio
from .config import Config
from .http import HTTPError, open_stream, post_raw

_STREAM_PLAYERS: list[list[str]] = [
    ["mpv", "--no-video", "--really-quiet", "-"],
    ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet", "-"],
]


def _stream_player() -> list[str] | None:
    for candidate in _STREAM_PLAYERS:
        if shutil.which(candidate[0]):
            return list(candidate)
    return None


class TTSEngine(Protocol):
    def speak(self, text: str) -> bool: ...


class NullTTS:
    def speak(self, text: str) -> bool:
        return False


class EspeakTTS:
    def __init__(self, voice: str = "") -> None:
        self.voice = voice

    def speak(self, text: str) -> bool:
        binary = shutil.which("espeak-ng") or shutil.which("espeak")
        if not binary or not text.strip():
            return False
        command = [binary]
        if self.voice:
            command += ["-v", self.voice]
        command.append(text)
        try:
            subprocess.run(command, check=False, timeout=120)
            return True
        except (OSError, subprocess.TimeoutExpired):
            return False


class PiperTTS:
    def __init__(self, model: str) -> None:
        self.model = model

    def speak(self, text: str) -> bool:
        if not self.model or not shutil.which("piper") or not text.strip():
            return False
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as fh:
            out = Path(fh.name)
        try:
            proc = subprocess.run(
                ["piper", "--model", self.model, "--output_file", str(out)],
                input=text.encode("utf-8"),
                check=False,
                timeout=120,
            )
            if proc.returncode != 0:
                return False
            return audio.play(out)
        except (OSError, subprocess.TimeoutExpired):
            return False
        finally:
            out.unlink(missing_ok=True)


class OpenRouterTTS:
    def __init__(self, cfg: Config, api_key: str) -> None:
        self.base_url = cfg.tts.base_url.rstrip("/")
        self.url = f"{self.base_url}/audio/speech"
        self.model = cfg.tts.model
        self.voice = os.environ.get("QWEEPS_TTS_VOICE") or cfg.tts.voice
        self.fmt = cfg.tts.response_format or "mp3"
        self.api_key = api_key
        self.temperature = cfg.tts.temperature
        self.top_p = cfg.tts.top_p
        self.stream = cfg.tts.stream
        self.rate_limit = 3.3 if "free" in self.model else 0.0

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://omarchy.org",
            "X-Title": "Omarchy Assistant",
        }

    def _payload(self, text: str) -> dict[str, object]:
        payload: dict[str, object] = {
            "model": self.model,
            "input": text,
            "response_format": self.fmt,
            "temperature": self.temperature,
            "top_p": self.top_p,
        }
        if self.voice:
            payload["voice"] = self.voice
        return payload

    def speak(self, text: str) -> bool:
        if not text.strip():
            return False
        payload = self._payload(text)
        if self.stream:
            player = _stream_player()
            if player is not None:
                try:
                    if self._speak_stream(payload, player):
                        return True
                except (HTTPError, OSError, subprocess.SubprocessError):
                    pass
        return self._speak_buffered(payload)

    def _speak_stream(self, payload: dict[str, object], player: list[str]) -> bool:
        audio.stop_playback()
        with audio._PLAYBACK_LOCK:
            response = open_stream(self.url, payload, headers=self._headers(), timeout=120)
            proc = subprocess.Popen(player, stdin=subprocess.PIPE)
            audio.announce_pid(proc.pid)
            try:
                while True:
                    chunk = response.read(8192)
                    if not chunk:
                        break
                    if proc.stdin is not None:
                        proc.stdin.write(chunk)
            except BrokenPipeError:
                pass
            finally:
                if proc.stdin is not None:
                    try:
                        proc.stdin.close()
                    except OSError:
                        pass
                response.close()
            try:
                proc.wait(timeout=120)
            except subprocess.TimeoutExpired:
                proc.kill()
                return False
            finally:
                audio.clear_pid(proc.pid)
            if proc.returncode is not None and proc.returncode < 0:
                # Killed by a signal (barge-in / stop_playback): treat as handled and
                # do NOT fall back to buffered playback, or the line would replay.
                return True
            return proc.returncode == 0

    def _speak_buffered(self, payload: dict[str, object]) -> bool:
        try:
            data = post_raw(self.url, payload, headers=self._headers(), timeout=120)
        except (HTTPError, OSError):
            return False
        with tempfile.NamedTemporaryFile(suffix=f".{self.fmt}", delete=False) as fh:
            out = Path(fh.name)
            fh.write(data)
        try:
            return audio.play(out)
        finally:
            out.unlink(missing_ok=True)


class FishTTS:
    """Direct Fish Audio synthesis, with the timestamp stream for alignment.

    Direct Fish avoids the OpenRouter gate: no per-minute throttle and the
    /v1/tts/stream/with-timestamp endpoint returns measured word times, so the
    lesson does not need a separate local whisper pass.
    """

    def __init__(self, cfg: Config, api_key: str) -> None:
        self.base_url = cfg.tts.base_url.rstrip("/")
        self.url = f"{self.base_url}/v1/tts"
        self.stream_url = f"{self.base_url}/v1/tts/stream/with-timestamp"
        self.model = cfg.tts.model or "s2.1-pro-free"
        self.voice = os.environ.get("QWEEPS_TTS_VOICE") or cfg.tts.voice
        self.fmt = cfg.tts.response_format or "mp3"
        self.api_key = api_key
        self.temperature = cfg.tts.temperature
        self.top_p = cfg.tts.top_p
        self.stream = cfg.tts.stream
        self.latency = cfg.tts.latency or "low"
        self.rate_limit = 0.0

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "model": self.model,
        }

    def _payload(self, text: str) -> dict[str, object]:
        payload: dict[str, object] = {
            "text": text,
            "format": self.fmt,
            "mp3_bitrate": 128,
            "latency": self.latency,
            "chunk_length": 300,
            "normalize": True,
        }
        if self.voice:
            payload["reference_id"] = self.voice
        return payload

    def speak(self, text: str) -> bool:
        if not text.strip():
            return False
        try:
            data = post_raw(self.url, self._payload(text), headers=self._headers(), timeout=120)
        except (HTTPError, OSError):
            return False
        with tempfile.NamedTemporaryFile(suffix=f".{self.fmt}", delete=False) as fh:
            out = Path(fh.name)
            fh.write(data)
        try:
            return audio.play(out)
        finally:
            out.unlink(missing_ok=True)


def build_tts(cfg: Config) -> TTSEngine:
    provider = cfg.tts.provider.lower()
    if provider == "fish":
        key = cfg.secret(cfg.tts.api_key_env)
        if key:
            return FishTTS(cfg, key)
        return NullTTS()
    if provider == "openrouter":
        key = cfg.secret(cfg.tts.api_key_env)
        if key:
            return OpenRouterTTS(cfg, key)
        return EspeakTTS(cfg.tts.voice)
    if provider == "piper":
        return PiperTTS(cfg.tts.piper_model)
    if provider == "espeak":
        return EspeakTTS(cfg.tts.voice)
    return NullTTS()
