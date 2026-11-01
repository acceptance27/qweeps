"""Pluggable video render backends for QWEEPS lessons.

Two implementations:

* LocalCEBackend - the existing local Manim Community subprocess.
* GenerativeManimBackend - POST the CE source to a running Generative Manim
  API (``/v1/video/rendering``) and download the result. With
  ``renderer="gl"`` the API compiles the CE source for ManimGL, so the lesson
  video comes from the same OpenGL renderer as QWEEPS' live scenes.

Selection is by environment:

    QWEEPS_RENDER_BACKEND=local | gm | gm-ce | gm-gl   (default: local)
    QWEEPS_GM_URL=http://127.0.0.1:8080
    QWEEPS_GM_API_KEY=<optional X-API-Key>
    QWEEPS_GM_RENDERER=gl | ce                          (default: gl)

The render contract is intentionally small: the caller supplies source that it
has already validated (plan-derived), a scene class name and a job folder.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol


@dataclass
class RenderResult:
    video: Path
    backend: str
    detail: dict = field(default_factory=dict)


class RenderBackend(Protocol):
    name: str

    def render(self, source: str, scene: str, folder: Path,
               quality: str = "low") -> RenderResult: ...


class LocalCEBackend:
    """Render with a local Manim Community installation (the previous path)."""

    name = "local-ce"

    def __init__(self, python: str, timeout: int = 180):
        self.python = python
        self.timeout = timeout

    def render(self, source: str, scene: str, folder: Path,
               quality: str = "low") -> RenderResult:
        folder.mkdir(parents=True, exist_ok=True)
        source_path = folder / "lesson.py"
        source_path.write_text(source)
        media = folder / "media"
        flag = "-ql" if quality == "low" else "-qm"
        command = [self.python, "-m", "manim", flag, "--disable_caching",
                   "--media_dir", str(media), str(source_path), scene]
        proc = subprocess.run(command, capture_output=True, text=True,
                              timeout=self.timeout, cwd=folder)
        (folder / "render.log").write_text(proc.stdout + proc.stderr)
        videos = list((media / "videos").glob(f"**/{scene}.mp4"))
        if proc.returncode or not videos:
            raise RuntimeError("Manim rendering failed. "
                               + (proc.stderr or proc.stdout)[-1500:])
        return RenderResult(videos[0], self.name,
                            {"quality": quality, "python": self.python})


class GenerativeManimBackend:
    """Render through the Generative Manim HTTP API (CE or compiled GL)."""

    def __init__(self, url: str = "http://127.0.0.1:8080", renderer: str = "gl",
                 api_key: str | None = None, timeout: int = 900,
                 aspect_ratio: str = "16:9"):
        self.url = url.rstrip("/")
        self.renderer = renderer
        self.api_key = api_key
        self.timeout = timeout
        self.aspect_ratio = aspect_ratio
        self.name = f"generative-manim-{renderer}"

    def _post(self, payload: dict) -> dict:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        request = urllib.request.Request(
            self.url + "/v1/video/rendering",
            data=json.dumps(payload).encode(),
            headers=headers,
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read().decode())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode(errors="replace")
            try:
                message = json.loads(body).get("error", body)
            except ValueError:
                message = body
            raise RuntimeError(f"Generative Manim rejected the render ({exc.code}): {message[-1200:]}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Generative Manim is not reachable at {self.url}: {exc.reason}") from exc

    def render(self, source: str, scene: str, folder: Path,
               quality: str = "low") -> RenderResult:
        payload = {
            "code": source,
            "file_class": scene,
            "aspect_ratio": self.aspect_ratio,
            "renderer": self.renderer,
        }
        result = self._post(payload)
        url = result.get("video_url")
        if not url:
            raise RuntimeError(f"Generative Manim returned no video: {result}")
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / "lesson.mp4"
        with urllib.request.urlopen(url, timeout=300) as response:
            target.write_bytes(response.read())
        return RenderResult(target, self.name,
                            {"video_url": url, "renderer": self.renderer})


def backend_from_env(local_python: str | None) -> RenderBackend:
    """Choose a backend from QWEEPS_RENDER_BACKEND (default: local)."""
    kind = (os.environ.get("QWEEPS_RENDER_BACKEND") or "local").strip().lower()
    if kind in {"gm", "gm-gl", "gm-ce", "generative-manim"}:
        renderer = os.environ.get("QWEEPS_GM_RENDERER")
        if not renderer:
            renderer = "ce" if kind == "gm-ce" else "gl"
        return GenerativeManimBackend(
            url=os.environ.get("QWEEPS_GM_URL", "http://127.0.0.1:8080"),
            renderer=renderer,
            api_key=os.environ.get("QWEEPS_GM_API_KEY"),
            timeout=int(os.environ.get("QWEEPS_GM_TIMEOUT", "900")),
        )
    return LocalCEBackend(local_python or "", timeout=180)
