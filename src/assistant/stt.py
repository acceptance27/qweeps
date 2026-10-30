from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path
from typing import Protocol

from .config import Config
from .http import HTTPError, post_multipart

_ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


class STT(Protocol):
    def transcribe(self, wav_path: str | Path) -> str: ...


class NullSTT:
    def transcribe(self, wav_path: str | Path) -> str:
        return ""


class FileSTT:
    def transcribe(self, wav_path: str | Path) -> str:
        path = Path(wav_path)
        if path.suffix == ".txt":
            return path.read_text().strip()
        sidecar = path.with_suffix(".txt")
        if sidecar.exists():
            return sidecar.read_text().strip()
        return path.read_text().strip() if path.exists() else ""


class VoxtypeSTT:
    def __init__(self, cfg: Config) -> None:
        self.engine = cfg.stt.engine
        self.model = cfg.stt.model
        self.language = cfg.stt.language

    def transcribe(self, wav_path: str | Path) -> str:
        from .log import get as _log

        binary = shutil.which("voxtype")
        if binary is None:
            _log().warning("stt: voxtype binary not found on PATH")
            return ""
        # NOTE: `voxtype transcribe` only accepts --engine. Passing --language
        # (or any unsupported flag) makes it print usage and exit with no text.
        command = [binary, "transcribe", str(wav_path)]
        if self.engine:
            command += ["--engine", self.engine]
        try:
            proc = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=180,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            _log().warning("stt: voxtype transcribe failed to run: %s", exc)
            return ""
        text = _ANSI.sub("", proc.stdout or "")
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        lines = [line for line in lines if not line.startswith("[")]
        result = lines[-1] if lines else ""
        if not result:
            _log().warning(
                "stt: empty transcript (engine=%s rc=%s): %s",
                self.engine or "default",
                proc.returncode,
                (proc.stderr or "").strip()[:300] or "(no stderr)",
            )
        return result


class OpenRouterSTT:
    def __init__(self, cfg: Config, api_key: str) -> None:
        self.base_url = cfg.stt.base_url.rstrip("/")
        self.model = cfg.stt.stt_model
        self.api_key = api_key
        self.language = cfg.stt.language

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://omarchy.org",
            "X-Title": "Omarchy Assistant",
        }

    def transcribe(self, wav_path: str | Path) -> str:
        path = Path(wav_path)
        if not path.exists():
            return ""
        content = path.read_bytes()
        fields = {"model": self.model}
        if self.language:
            fields["language"] = self.language
        try:
            data = post_multipart(
                f"{self.base_url}/audio/transcriptions",
                fields,
                {"file": (path.name, content, "audio/wav")},
                headers=self._headers(),
                timeout=180,
            )
        except (HTTPError, OSError):
            return ""
        return str(data.get("text", "")).strip()


def build_stt(cfg: Config) -> STT:
    provider = cfg.stt.provider.lower()
    if provider == "voxtype":
        return VoxtypeSTT(cfg)
    if provider == "openrouter":
        key = cfg.secret(cfg.stt.api_key_env)
        if key:
            return OpenRouterSTT(cfg, key)
        return NullSTT()
    if provider == "file":
        return FileSTT()
    return NullSTT()
