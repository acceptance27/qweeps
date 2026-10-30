from __future__ import annotations

import json
import re
import sqlite3
import time
from pathlib import Path

from .embeddings import cosine

_WORD = re.compile(r"[a-z0-9]+")
_CONTRACTION = re.compile(r"'(s|t|re|ve|ll|d|m)\b")
_STOP = {
    "a", "an", "the", "is", "are", "was", "were", "be", "do", "does", "did", "of", "to",
    "in", "on", "for", "and", "or", "what", "how", "why", "who", "when", "where", "which",
    "can", "could", "would", "should", "you", "i", "me", "my", "we", "please", "tell",
    "give", "show", "it", "this", "that", "s", "t", "about",
}


# Similarity backend is pluggable. The default is lexical (token Jaccard) so it
# works with no model installed; swap in embeddings later without touching the
# cache's storage or invalidation logic.
def _tokens(text: str) -> set[str]:
    lowered = _CONTRACTION.sub("", (text or "").lower())
    return {word for word in _WORD.findall(lowered) if word not in _STOP}


def _similarity(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


class ResponseCache:
    """A signature-keyed response cache.

    An entry is only a hit when the *world signature* matches (so any config or
    code change invalidates it) and the question is close enough by similarity.
    """

    def __init__(self, path: Path, embedder=None, threshold: float = 0.72,
                 semantic_threshold: float = 0.90, ttl: float = 86400.0) -> None:
        self.path = Path(path)
        self.embedder = embedder
        self.threshold = threshold
        self.semantic_threshold = semantic_threshold
        self.ttl = ttl
        self._init()

    def _connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init(self) -> None:
        with self._connect() as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS cache ("
                "question TEXT, answer TEXT, sig TEXT, sources TEXT, vec TEXT, ts REAL)"
            )
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(cache)")}
            if "vec" not in columns:
                conn.execute("ALTER TABLE cache ADD COLUMN vec TEXT")

    def _embed(self, text: str):
        if self.embedder is None or not self.embedder.available():
            return None
        vectors = self.embedder.embed([text])
        return vectors[0] if vectors else None

    def get(self, question: str, signature: str) -> str | None:
        tokens = _tokens(question)
        query_vec = self._embed(question)
        now = time.time()
        best_answer: str | None = None
        best_score = 0.0
        threshold = self.semantic_threshold if query_vec is not None else self.threshold
        with self._connect() as conn:
            rows = conn.execute("SELECT question, answer, vec, ts FROM cache WHERE sig = ?", (signature,))
            for row in rows:
                if now - float(row["ts"]) > self.ttl:
                    continue
                if query_vec is not None and row["vec"]:
                    score = cosine(query_vec, json.loads(row["vec"]))
                else:
                    score = _similarity(tokens, _tokens(row["question"]))
                if score > best_score:
                    best_score = score
                    best_answer = row["answer"]
        return best_answer if best_score >= threshold else None

    def put(self, question: str, answer: str, signature: str, sources: list[str] | None = None) -> None:
        vector = self._embed(question)
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO cache (question, answer, sig, sources, vec, ts) VALUES (?, ?, ?, ?, ?, ?)",
                (question, answer, signature, json.dumps(sources or []),
                 json.dumps(vector) if vector is not None else None, time.time()),
            )

    def clear(self) -> int:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM cache")
            return cur.rowcount

    def size(self) -> int:
        with self._connect() as conn:
            return int(conn.execute("SELECT COUNT(*) FROM cache").fetchone()[0])
