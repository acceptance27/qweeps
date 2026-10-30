from __future__ import annotations

import logging
import os
from pathlib import Path

LOGGER_NAME = "omarchy-assistant"
_configured = False


def state_dir() -> Path:
    base = os.environ.get("XDG_STATE_HOME") or str(Path.home() / ".local" / "state")
    return Path(base) / "omarchy-assistant"


def log_file() -> Path:
    return state_dir() / "assistant.log"


def setup(verbose: bool = False) -> logging.Logger:
    global _configured
    logger = logging.getLogger(LOGGER_NAME)
    if _configured:
        if verbose:
            logger.setLevel(logging.DEBUG)
        return logger
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)
    logger.propagate = False
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    try:
        state_dir().mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_file())
        file_handler.setFormatter(fmt)
        logger.addHandler(file_handler)
    except OSError:
        pass
    if verbose:
        stream = logging.StreamHandler()
        stream.setFormatter(fmt)
        logger.addHandler(stream)
    _configured = True
    return logger


def get() -> logging.Logger:
    return logging.getLogger(LOGGER_NAME)
