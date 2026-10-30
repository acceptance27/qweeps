"""Google Drive (read/write) for QWEEPS, on the shared Google auth."""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
from typing import Any

from .config import Config
from .google_auth import GoogleAuth, GoogleUnavailable

API = "https://www.googleapis.com/drive/v3"
UPLOAD = "https://www.googleapis.com/upload/drive/v3"
FOLDER_MIME = "application/vnd.google-apps.folder"
_FIELDS = "files(id,name,mimeType,modifiedTime,webViewLink)"
_FILE_FIELDS = "id,name,mimeType,modifiedTime,webViewLink"

DriveUnavailable = GoogleUnavailable


class GoogleDrive(GoogleAuth):
    def list_files(self, query: str = "", page_size: int = 10) -> list[dict[str, Any]]:
        q = query or "trashed=false"
        data = self.request(
            "GET",
            f"{API}/files",
            params={
                "q": q,
                "pageSize": str(page_size),
                "orderBy": "modifiedTime desc",
                "fields": _FIELDS,
            },
        )
        return data.get("files", [])

    def search(self, name: str, page_size: int = 10) -> list[dict[str, Any]]:
        escaped = name.replace("'", "\\'")
        return self.list_files(f"name contains '{escaped}' and trashed=false", page_size)

    def create_folder(self, name: str, parent: str | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"name": name, "mimeType": FOLDER_MIME}
        if parent:
            body["parents"] = [parent]
        return self.request("POST", f"{API}/files", params={"fields": _FILE_FIELDS}, body=body)

    def delete(self, file_id: str) -> dict[str, Any]:
        # Move to trash (recoverable) rather than a permanent files.delete.
        return self.request(
            "PATCH", f"{API}/files/{urllib.parse.quote(file_id)}", body={"trashed": True}
        )

    def list_docs(self, page_size: int = 200) -> list[dict[str, Any]]:
        data = self.request(
            "GET",
            f"{API}/files",
            params={
                "q": "mimeType='application/vnd.google-apps.document' and trashed=false",
                "pageSize": str(page_size),
                "orderBy": "modifiedTime desc",
                "fields": "files(id,name,modifiedTime,webViewLink)",
            },
        )
        return data.get("files", [])

    def export_doc(self, file_id: str, mime: str = "text/plain") -> str:
        import urllib.request

        url = (
            f"{API}/files/{urllib.parse.quote(file_id)}/export"
            f"?mimeType={urllib.parse.quote(mime)}"
        )
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Bearer {self.token()}")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:  # type: ignore[attr-defined]
            raise GoogleUnavailable(exc.read().decode("utf-8", "replace")[:300]) from exc
        except OSError as exc:
            raise GoogleUnavailable(str(exc)) from exc


    def rename(self, file_id: str, name: str) -> dict[str, Any]:
        return self.request(
            "PATCH", f"{API}/files/{urllib.parse.quote(file_id)}", params={"fields": _FILE_FIELDS}, body={"name": name}
        )

    def upload(self, path: str, name: str | None = None, parent: str | None = None) -> dict[str, Any]:
        import mimetypes
        import os
        import urllib.request

        with open(path, "rb") as fh:
            content = fh.read()
        metadata: dict[str, Any] = {"name": name or os.path.basename(path)}
        if parent:
            metadata["parents"] = [parent]
        mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
        boundary = "qweeps-drive-boundary"
        body = b"".join(
            [
                f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".encode(),
                json.dumps(metadata).encode(),
                f"\r\n--{boundary}\r\nContent-Type: {mime}\r\n\r\n".encode(),
                content,
                f"\r\n--{boundary}--\r\n".encode(),
            ]
        )
        req = urllib.request.Request(
            f"{UPLOAD}/files?uploadType=multipart&fields={urllib.parse.quote(_FILE_FIELDS)}",
            data=body,
            method="POST",
        )
        req.add_header("Authorization", f"Bearer {self.token()}")
        req.add_header("Content-Type", f"multipart/related; boundary={boundary}")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as exc:  # type: ignore[attr-defined]
            raise GoogleUnavailable(exc.read().decode("utf-8", "replace")[:300]) from exc
        except OSError as exc:
            raise GoogleUnavailable(str(exc)) from exc


def build_drive(cfg: Config) -> GoogleDrive | None:
    if not getattr(cfg.drive, "enabled", False):
        return None
    client_id = cfg.secret(cfg.calendar.client_id_env)
    client_secret = cfg.secret(cfg.calendar.client_secret_env)
    refresh = cfg.secret(cfg.calendar.refresh_token_env)
    if not (client_id and client_secret and refresh):
        return None
    return GoogleDrive(
        client_id=client_id,
        client_secret=client_secret,
        refresh_token=refresh,
        cache_path=str(cfg.config_dir / "google_token.json"),
    )


def _sanitize(name: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9 _.-]", "", name or "").strip().replace(" ", "_")
    return (safe or "doc")[:60]


def gdrive_cache_dir(cfg: Config):
    return cfg.config_dir / "gdrive_docs"


def sync_google_docs(cfg: Config, force: bool = False, ttl_min: int = 15) -> int:
    """Mirror Google Docs to local text files for RAG indexing.

    Only re-exports docs whose modifiedTime changed; returns the number
    (re)written. Best-effort: callers must not depend on it succeeding.
    """
    import json as _json

    if not getattr(cfg.drive, "enabled", False):
        return 0
    if not getattr(cfg.drive, "sync_docs", True):
        return 0
    drive = build_drive(cfg)
    if drive is None:
        return 0
    cache = gdrive_cache_dir(cfg)
    cache.mkdir(parents=True, exist_ok=True)
    state_path = cfg.config_dir / "gdrive_docs_state.json"
    try:
        state = _json.loads(state_path.read_text())
    except (OSError, ValueError):
        state = {}
    docs_state = state.get("docs", {})
    now = time.time()
    if not force and now - float(state.get("synced_at", 0)) < ttl_min * 60:
        return 0

    changed = 0
    seen: set[str] = set()
    for doc in drive.list_docs():
        did = doc.get("id", "")
        if not did:
            continue
        seen.add(did)
        prev = docs_state.get(did, {})
        target = cache / f"{_sanitize(doc.get('name', ''))}-{did[:6]}.txt"
        if prev.get("modifiedTime") == doc.get("modifiedTime") and target.exists():
            continue
        try:
            text = drive.export_doc(did)
        except GoogleUnavailable:
            continue
        header = f"# {doc.get('name', '')}\nSource: Google Doc\n\n"
        target.write_text(header + text, encoding="utf-8")
        docs_state[did] = {"modifiedTime": doc.get("modifiedTime", ""), "file": target.name}
        changed += 1

    for did in list(docs_state):
        if did not in seen:
            fname = docs_state[did].get("file")
            if fname:
                try:
                    (cache / fname).unlink()
                except OSError:
                    pass
            docs_state.pop(did, None)

    state["docs"] = docs_state
    state["synced_at"] = now
    try:
        state_path.write_text(_json.dumps(state, indent=2))
    except OSError:
        pass
    return changed
