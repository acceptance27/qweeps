from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
import uuid
from typing import Any

RETRY_STATUSES = {429, 500, 502, 503, 504}
MAX_RETRIES = 2
BACKOFF = 0.8


class HTTPError(RuntimeError):
    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"HTTP {status}: {body[:500]}")
        self.status = status
        self.body = body


def _log():
    import logging

    return logging.getLogger("omarchy-assistant")


def _request(req: urllib.request.Request, timeout: int, retries: int = MAX_RETRIES) -> bytes:
    attempt = 0
    while True:
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "replace")
            if exc.code in RETRY_STATUSES and attempt < retries:
                _log().warning("HTTP %s from %s; retrying (%d/%d)", exc.code, req.full_url, attempt + 1, retries)
                time.sleep(BACKOFF * (2**attempt))
                attempt += 1
                continue
            raise HTTPError(exc.code, body) from exc
        except urllib.error.URLError as exc:
            if attempt < retries:
                _log().warning("network error to %s: %s; retrying (%d/%d)", req.full_url, exc.reason, attempt + 1, retries)
                time.sleep(BACKOFF * (2**attempt))
                attempt += 1
                continue
            raise HTTPError(0, str(exc.reason)) from exc


def post_json(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str] | None = None,
    timeout: int = 60,
    retries: int = MAX_RETRIES,
) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    all_headers = {"Content-Type": "application/json"}
    all_headers.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=all_headers, method="POST")
    body = _request(req, timeout, retries)
    return json.loads(body.decode("utf-8"))


def post_raw(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str] | None = None,
    timeout: int = 120,
    retries: int = MAX_RETRIES,
) -> bytes:
    data = json.dumps(payload).encode("utf-8")
    all_headers = {"Content-Type": "application/json"}
    all_headers.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=all_headers, method="POST")
    return _request(req, timeout, retries)


def open_stream(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str] | None = None,
    timeout: int = 120,
    retries: int = MAX_RETRIES,
):
    """Open a POST response for incremental reading. Caller must close it."""
    data = json.dumps(payload).encode("utf-8")
    all_headers = {"Content-Type": "application/json"}
    all_headers.update(headers or {})
    attempt = 0
    while True:
        req = urllib.request.Request(url, data=data, headers=all_headers, method="POST")
        try:
            return urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "replace")
            if exc.code in RETRY_STATUSES and attempt < retries:
                _log().warning("HTTP %s from %s; retrying (%d/%d)", exc.code, url, attempt + 1, retries)
                time.sleep(BACKOFF * (2**attempt))
                attempt += 1
                continue
            raise HTTPError(exc.code, body) from exc
        except urllib.error.URLError as exc:
            if attempt < retries:
                _log().warning("network error to %s: %s; retrying (%d/%d)", url, exc.reason, attempt + 1, retries)
                time.sleep(BACKOFF * (2**attempt))
                attempt += 1
                continue
            raise HTTPError(0, str(exc.reason)) from exc


def post_multipart(
    url: str,
    fields: dict[str, str],
    files: dict[str, tuple[str, bytes, str]],
    headers: dict[str, str] | None = None,
    timeout: int = 120,
) -> dict[str, Any]:
    boundary = f"----omarchy-assistant-{uuid.uuid4().hex}"
    lines: list[bytes] = []
    for name, value in fields.items():
        lines.append(f"--{boundary}".encode())
        lines.append(f'Content-Disposition: form-data; name="{name}"'.encode())
        lines.append(b"")
        lines.append(str(value).encode())
    for name, (filename, content, content_type) in files.items():
        lines.append(f"--{boundary}".encode())
        lines.append(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"'.encode()
        )
        lines.append(f"Content-Type: {content_type}".encode())
        lines.append(b"")
        lines.append(content)
    lines.append(f"--{boundary}--".encode())
    lines.append(b"")
    body = b"\r\n".join(lines)
    all_headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    all_headers.update(headers or {})
    req = urllib.request.Request(url, data=body, headers=all_headers, method="POST")
    return json.loads(_request(req, timeout).decode("utf-8"))
