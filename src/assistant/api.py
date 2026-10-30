from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .config import load_config
from .orchestrator import Orchestrator

_SPEAK_LOCK = threading.Lock()


def _speak(orch, answer: str) -> None:
    """Speak, while marking a flag file so the desktop listener ignores its own voice."""
    from . import audio
    from .log import state_dir

    flag = state_dir() / "speaking"
    # Preempt whatever is playing BEFORE waiting for the lock. The speaker holds
    # _SPEAK_LOCK for its whole utterance, so stopping inside the lock would make
    # a new reply (or a barge-in) queue behind the one still talking instead of
    # cutting it off.
    try:
        audio.stop_playback()
    except Exception:  # noqa: BLE001
        pass
    with _SPEAK_LOCK:
        try:
            flag.parent.mkdir(parents=True, exist_ok=True)
            flag.write_text("1", encoding="utf-8")
            orch.say(answer)
        finally:
            try:
                flag.unlink()
            except OSError:
                pass


def _last_user(messages) -> str:
    for message in reversed(messages or []):
        if message.get("role") == "user":
            content = message.get("content")
            if isinstance(content, list):  # multimodal content parts
                return " ".join(
                    str(part.get("text", "")) for part in content if isinstance(part, dict)
                ).strip()
            return str(content or "")
    return ""


_SPEECH_LIMIT = 800


def _for_speech(text: str, limit: int = _SPEECH_LIMIT) -> str:
    """Trim a reply to something a voice pipeline can actually synthesize.

    A delegated agent can return thousands of characters (or code); Home
    Assistant's TTS then fails and the user hears nothing. Strip the obvious
    non-speech and cap at a couple of sentences.
    """
    import re

    out = text or ""
    out = re.sub(r"```.*?```", " ", out, flags=re.DOTALL)
    out = out.replace("`", "")
    out = re.sub(r"(?m)^\s*(?:[-*#]+|\d+\.)\s*", "", out)
    out = re.sub(r"\s+", " ", out).strip()
    if len(out) <= limit:
        return out
    cut = out[:limit]
    ends = list(re.finditer(r"[.!?](\s|$)", cut))
    if ends and ends[-1].end() > limit // 2:
        cut = cut[: ends[-1].end()]
    return cut.rstrip() + " \u2026"


class _Handler(BaseHTTPRequestHandler):
    orch: Orchestrator | None = None
    model: str = "qweeps"

    def log_message(self, *args) -> None:  # keep the journal quiet
        pass

    def _send_json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _completion(self, text: str) -> dict:
        return {
            "id": "chatcmpl-qweeps",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": self.model,
            "choices": [
                {"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}
            ],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        }

    def do_GET(self) -> None:
        if self.path.rstrip("/").endswith("/v1/models"):
            self._send_json(200, {
                "object": "list",
                "data": [{"id": self.model, "object": "model", "owned_by": "qweeps"}],
            })
        else:
            self._send_json(404, {"error": {"message": "not found"}})

    def do_POST(self) -> None:
        if not self.path.rstrip("/").endswith("/v1/chat/completions"):
            self._send_json(404, {"error": {"message": "not found"}})
            return
        length = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._send_json(400, {"error": {"message": "bad json"}})
            return
        text = _last_user(payload.get("messages"))
        speak = bool(payload.get("speak"))
        try:
            if self.orch is None:
                answer = ""
            else:
                answer = self.orch.router.route(text).text
                if speak and answer:
                    # Speak in the background so the HTTP reply isn't blocked by
                    # the length of the spoken audio. A flag file tells the
                    # desktop listener to ignore its own speech (echo guard).
                    import threading

                    threading.Thread(target=_speak, args=(self.orch, answer), daemon=True).start()
        except Exception as exc:  # noqa: BLE001 - never 500 the caller
            answer = f"Something went wrong: {exc}"

        answer = _for_speech(answer)
        if payload.get("stream"):
            self._stream(answer)
        else:
            self._send_json(200, self._completion(answer))

    def _stream(self, answer: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        chunk = {
            "id": "chatcmpl-qweeps",
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": self.model,
            "choices": [{"index": 0, "delta": {"role": "assistant", "content": answer}, "finish_reason": None}],
        }
        done = {
            "id": "chatcmpl-qweeps",
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": self.model,
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
        }
        self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode("utf-8"))
        self.wfile.write(f"data: {json.dumps(done)}\n\n".encode("utf-8"))
        self.wfile.write(b"data: [DONE]\n\n")


def serve(host: str = "127.0.0.1", port: int = 8765, model: str = "qweeps") -> None:
    cfg = load_config()
    _Handler.orch = Orchestrator(cfg, session="homeassistant")
    _Handler.model = model
    server = ThreadingHTTPServer((host, port), _Handler)
    print(f"{cfg.persona.name} API on http://{host}:{port}/v1  (model: {model})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
