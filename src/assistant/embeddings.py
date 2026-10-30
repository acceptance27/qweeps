from __future__ import annotations

import hashlib
import json
import math
import os
import sqlite3
from pathlib import Path

from .http import post_json

# Free on OpenRouter; swap via config/embeddings model if you prefer another.
DEFAULT_MODEL = "nvidia/nemotron-3-embed-1b:free"
EMBED_URL = "https://openrouter.ai/api/v1/embeddings"
# Embeddings are optional (callers fall back to lexical/RAG coverage), so fail
# fast instead of stalling a turn on a slow network.
EMBED_TIMEOUT = int(os.environ.get("QWEEPS_EMBED_TIMEOUT", "5"))
EMBED_RETRIES = int(os.environ.get("QWEEPS_EMBED_RETRIES", "0"))


def _key(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", "ignore")).hexdigest()[:20]


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


class Embedder:
    """Text embeddings via OpenRouter, cached by content hash (deterministic).

    Returns None when unavailable (no key, network error) so callers can fall
    back to lexical matching rather than fail.
    """

    def __init__(self, api_key: str, path: Path, model: str = DEFAULT_MODEL) -> None:
        self.api_key = api_key
        self.model = model
        self.path = Path(path)
        self._init()

    def _connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init(self) -> None:
        with self._connect() as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS emb (h TEXT PRIMARY KEY, v TEXT)")

    def available(self) -> bool:
        return bool(self.api_key)

    def _cached(self) -> dict[str, list[float]]:
        with self._connect() as conn:
            return {row["h"]: json.loads(row["v"]) for row in conn.execute("SELECT h, v FROM emb")}

    def embed(self, texts: list[str]) -> list[list[float]] | None:
        if not self.api_key or not texts:
            return None
        cache = self._cached()
        missing = [t for t in texts if _key(t) not in cache]
        if missing:
            try:
                data = post_json(
                    EMBED_URL,
                    {"model": self.model, "input": missing},
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    timeout=EMBED_TIMEOUT,
                    retries=EMBED_RETRIES,
                )
                vectors = [row["embedding"] for row in data.get("data", [])]
            except Exception:  # noqa: BLE001 - fall back to lexical
                return None
            if len(vectors) != len(missing):
                return None
            with self._connect() as conn:
                for text, vector in zip(missing, vectors):
                    conn.execute(
                        "INSERT OR REPLACE INTO emb (h, v) VALUES (?, ?)",
                        (_key(text), json.dumps(vector)),
                    )
                    cache[_key(text)] = vector
        result = [cache.get(_key(t)) for t in texts]
        return result if all(v is not None for v in result) else None  # type: ignore[return-value]
