from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from pathlib import Path

from .cache import _similarity, _tokens
from .config import Config
from .embeddings import cosine

_PARA = re.compile(r"\n\s*\n")


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", "ignore")).hexdigest()[:12]


def _chunks(text: str, max_chars: int = 900) -> list[str]:
    out: list[str] = []
    buf = ""
    for para in _PARA.split(text or ""):
        para = para.strip()
        if not para:
            continue
        if len(buf) + len(para) + 2 <= max_chars:
            buf = (buf + "\n\n" + para).strip()
        else:
            if buf:
                out.append(buf)
            while len(para) > max_chars:
                out.append(para[:max_chars])
                para = para[max_chars:]
            buf = para
    if buf:
        out.append(buf)
    return out


def _sources(cfg: Config) -> list[Path]:
    files: list[Path] = []
    notes = Path(cfg.notes.dir).expanduser()
    if notes.is_dir():
        files.extend(sorted(notes.rglob("*.md")))
    # Documents: only top-level files - never recurse into project trees.
    docs = Path(cfg.documents.dir).expanduser()
    if docs.is_dir():
        files.extend(sorted(docs.glob("*.md")))
    # Google Docs mirrored to local text by sync_google_docs().
    gdocs = Path(cfg.config_dir) / "gdrive_docs"
    if gdocs.is_dir():
        files.extend(sorted(gdocs.glob("*.txt")))
    if Path(cfg.facts_path).exists():
        files.append(Path(cfg.facts_path))
    sessions = Path(cfg.sessions_dir)
    if sessions.is_dir():
        files.extend(sorted(sessions.glob("*.json")))
    # Skip anything implausibly large (generated files, exports, etc.).
    return [f for f in files if _size_ok(f)]


def _size_ok(path: Path, limit: int | None = None) -> bool:
    if limit is None:
        import os

        limit = int(os.environ.get("QWEEPS_RAG_MAX_BYTES", "10000000"))
    try:
        return path.stat().st_size <= limit
    except OSError:
        return False


class RAGIndex:
    """Incremental index of the user's notes, documents, facts and sessions.

    Each source file is stored with its content SHA. On reindex, a file whose
    SHA is unchanged is skipped entirely - so editing one note only re-indexes
    that note, never the whole corpus.
    """

    def __init__(self, path: Path, embedder=None) -> None:
        self.path = Path(path)
        self.embedder = embedder
        self._init()

    def _connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init(self) -> None:
        with self._connect() as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS files (source TEXT PRIMARY KEY, sha TEXT)")
            conn.execute(
                "CREATE TABLE IF NOT EXISTS chunks (source TEXT, ord INTEGER, text TEXT, tokens TEXT, vec TEXT)"
            )
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(chunks)")}
            if "vec" not in columns:
                conn.execute("ALTER TABLE chunks ADD COLUMN vec TEXT")

    def reindex(self, cfg: Config) -> int:
        """Index changed sources; return the number of files (re)indexed."""
        try:  # mirror Google Docs (best-effort, TTL-limited)
            from .gdrive import sync_google_docs

            sync_google_docs(cfg)
        except Exception:  # noqa: BLE001 - indexing must never block a turn
            pass
        touched = 0
        with self._connect() as conn:
            known = {row["source"]: row["sha"] for row in conn.execute("SELECT source, sha FROM files")}
            seen: set[str] = set()
            for file in _sources(cfg):
                key = str(file)
                seen.add(key)
                try:
                    content = file.read_text(encoding="utf-8", errors="ignore")
                except OSError:
                    continue
                sha = _sha(content)
                if known.get(key) == sha:
                    continue
                conn.execute("DELETE FROM chunks WHERE source = ?", (key,))
                pieces = _chunks(content)
                vectors = None
                if self.embedder is not None and self.embedder.available():
                    vectors = self.embedder.embed(pieces)
                for i, chunk in enumerate(pieces):
                    vec = None
                    if vectors is not None and i < len(vectors):
                        vec = json.dumps(vectors[i])
                    conn.execute(
                        "INSERT INTO chunks (source, ord, text, tokens, vec) VALUES (?, ?, ?, ?, ?)",
                        (key, i, chunk, " ".join(sorted(_tokens(chunk))), vec),
                    )
                conn.execute(
                    "INSERT INTO files (source, sha) VALUES (?, ?) "
                    "ON CONFLICT(source) DO UPDATE SET sha = excluded.sha",
                    (key, sha),
                )
                touched += 1
            # Drop sources that no longer exist.
            for stale in set(known) - seen:
                conn.execute("DELETE FROM chunks WHERE source = ?", (stale,))
                conn.execute("DELETE FROM files WHERE source = ?", (stale,))
        return touched

    def query(self, text: str, k: int = 4, min_score: float = 0.34) -> list[dict]:
        tokens = _tokens(text)
        query_vec = None
        if self.embedder is not None and self.embedder.available():
            vectors = self.embedder.embed([text])
            query_vec = vectors[0] if vectors else None
        if not tokens and query_vec is None:
            return []
        scored: list[tuple[float, sqlite3.Row]] = []
        with self._connect() as conn:
            for row in conn.execute("SELECT source, text, tokens, vec FROM chunks"):
                if query_vec is not None and row["vec"]:
                    score = cosine(query_vec, json.loads(row["vec"]))
                    floor = 0.35
                else:
                    chunk = set(row["tokens"].split())
                    score = len(tokens & chunk) / len(tokens) if tokens else 0.0
                    floor = min_score
                if score >= floor:
                    scored.append((score, row))
        scored.sort(key=lambda pair: pair[0], reverse=True)
        return [{"source": row["source"], "text": row["text"], "score": score} for score, row in scored[:k]]

    def size(self) -> int:
        with self._connect() as conn:
            return int(conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0])

    def clear(self) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM chunks")
            conn.execute("DELETE FROM files")
