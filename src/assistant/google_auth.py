"""Shared Google OAuth + REST helper for Calendar and Drive (stdlib only).

One OAuth client + refresh token covers both scopes. Tokens are kept in
secrets.toml (client id/secret/refresh) with a small on-disk access-token cache.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar"
DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"
SCOPES = [CALENDAR_SCOPE, DRIVE_SCOPE]


class GoogleUnavailable(RuntimeError):
    pass


def local_tz() -> Any:
    return datetime.now().astimezone().tzinfo


def _post(url: str, form: dict[str, str]) -> dict[str, Any]:
    data = urllib.parse.urlencode(form).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        raise GoogleUnavailable(exc.read().decode("utf-8", "replace")[:300]) from exc
    except OSError as exc:
        raise GoogleUnavailable(str(exc)) from exc


def oauth_flow(client_id: str, client_secret: str, scopes: list[str] | None = None,
               open_browser: bool = True) -> dict[str, Any]:
    """Installed-app OAuth flow; returns the token payload (incl. refresh_token)."""
    import http.server
    import secrets as _secrets
    import threading
    import webbrowser

    holder: dict[str, str] = {}
    state = _secrets.token_urlsafe(16)

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            holder.update({k: v[0] for k, v in params.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h2>QWEEPS: you can close this tab.</h2>")

        def log_message(self, *args) -> None:
            pass

    server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    redirect = f"http://127.0.0.1:{server.server_address[1]}/"
    url = AUTH_URL + "?" + urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect,
            "response_type": "code",
            "scope": " ".join(scopes or SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
    )
    print(f"Opening browser for Google authorization:\n{url}")
    if open_browser:
        threading.Thread(target=webbrowser.open, args=(url,), daemon=True).start()
    server.handle_request()
    server.server_close()
    if holder.get("state") != state:
        raise GoogleUnavailable("OAuth state mismatch")
    code = holder.get("code")
    if not code:
        raise GoogleUnavailable(holder.get("error", "no authorization code returned"))
    return _post(
        TOKEN_URL,
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect,
            "grant_type": "authorization_code",
        },
    )


class GoogleAuth:
    def __init__(self, client_id: str, client_secret: str, refresh_token: str,
                 cache_path: str | None = None) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.refresh_token = refresh_token
        self.cache_path = cache_path
        self._access = ""
        self._expires = 0.0

    def _load_cache(self) -> None:
        if not self.cache_path:
            return
        try:
            data = json.loads(open(self.cache_path).read())
            self._access = data.get("access_token", "")
            self._expires = float(data.get("expires_at", 0))
        except (OSError, ValueError):
            pass

    def _save_cache(self) -> None:
        if not self.cache_path:
            return
        try:
            with open(self.cache_path, "w") as fh:
                json.dump({"access_token": self._access, "expires_at": self._expires}, fh)
            os.chmod(self.cache_path, 0o600)
        except OSError:
            pass

    def token(self) -> str:
        if not self._access:
            self._load_cache()
        if self._access and time.time() < self._expires - 60:
            return self._access
        payload = _post(
            TOKEN_URL,
            {
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": self.refresh_token,
                "grant_type": "refresh_token",
            },
        )
        self._access = payload.get("access_token", "")
        self._expires = time.time() + float(payload.get("expires_in", 3600))
        if not self._access:
            raise GoogleUnavailable("could not refresh the Google token")
        self._save_cache()
        return self._access

    def request(self, method: str, url: str, params: dict[str, str] | None = None,
                body: dict[str, Any] | None = None) -> dict[str, Any]:
        if params:
            url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.token()}")
        if data:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            raise GoogleUnavailable(exc.read().decode("utf-8", "replace")[:300]) from exc
        except OSError as exc:
            raise GoogleUnavailable(str(exc)) from exc
