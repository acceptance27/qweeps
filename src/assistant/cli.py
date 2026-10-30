"""QWEEPS — Live Interactive Visual Teaching CLI."""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

from . import __version__
from .config import load_config, write_default_config, write_secret


def cmd_visual(args) -> int:
    from .config import load_config
    from .tts import build_tts
    from .visual.runner import VisualRunner

    topic = " ".join(args.topic) if isinstance(args.topic, list) else (args.topic or "astar")
    topic = topic or "astar"
    if topic == "serve":
        from .visual.server import serve
        serve()
        return 0
    if topic == "mcp":
        from .visual.mcp import main
        main()
        return 0
    cfg = load_config()
    runner = VisualRunner(tts=build_tts(cfg) if not getattr(args, "no_speak", False) else None)
    if topic.lower() in {"astar", "a*", "a_star", "heuristic"}:
        topic = "astar_heuristic"
    print(f"Opening QWEEPS visual lesson: {topic}")
    try:
        return 0 if runner.launch_studio(topic) else 1
    except Exception as exc:
        print(f"Could not launch visual studio: {exc}", file=sys.stderr)
        return 1


def cmd_doctor(args) -> int:
    cfg = load_config()
    print(f"QWEEPS version: {__version__}")
    print(f"config dir: {cfg.config_dir}")
    print(f"config file: {cfg.config_dir / 'config.toml'} (exists={(cfg.config_dir / 'config.toml').exists()})")
    print("binaries:")
    for name in ("agy", "mpv", "ffplay", "espeak-ng", "piper", "python3"):
        print(f"  {name:<12} {'yes' if shutil.which(name) else 'no'}")
    print(f"visual provider: {cfg.llm.visual_provider or 'antigravity'}")
    print(f"visual model: {cfg.llm.visual_model}")
    print(f"vision reviewer: {cfg.llm.visual_vision_model}")
    print(f"tts provider: {cfg.tts.provider}  model: {cfg.tts.model}")
    from .visual.server import STUDIO_DIR
    dist_ready = (STUDIO_DIR / "dist" / "index.html").is_file()
    print(f"visual studio: {STUDIO_DIR} (built={dist_ready})")
    bundled_dir = Path(__file__).resolve().parents[2] / "bundled-lessons" / "browser-lessons"
    print(f"bundled lessons: {bundled_dir} (exists={bundled_dir.is_dir()})")
    return 0


def cmd_set_key(args) -> int:
    cfg = load_config()
    if getattr(args, "stdin", False):
        key = sys.stdin.read().strip()
    else:
        import getpass
        try:
            key = getpass.getpass("OpenRouter API key: ").strip()
        except EOFError:
            key = ""
    if not key:
        print("Empty key, not updating.")
        return 1
    write_secret(cfg.config_dir, "OPENROUTER_API_KEY", key)
    print(f"Saved OPENROUTER_API_KEY to {cfg.config_dir / 'secrets.toml'}")
    return 0


def cmd_config(args) -> int:
    cfg = load_config()
    path = cfg.config_dir / "config.toml"
    if not path.exists():
        written = write_default_config(cfg.config_dir)
        print(f"Wrote default config to {written}")
        return 0
    print(f"# {path}")
    print(path.read_text(encoding="utf-8"))
    return 0


def cmd_logs(args) -> int:
    from .log import log_file
    path = log_file()
    if not path.exists():
        print(f"(no log yet at {path})")
        return 0
    lines = path.read_text(errors="replace").splitlines()
    for line in lines[-args.lines:]:
        print(line)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="qweeps", description="QWEEPS — Live Interactive Visual Teaching")
    parser.add_argument("-V", "--version", action="version", version=__version__)
    parser.add_argument("-v", "--verbose", action="store_true", help="verbose logging to stderr")
    sub = parser.add_subparsers(dest="command", required=True)

    p_visual = sub.add_parser("visual", help="launch or serve an interactive visual lesson")
    p_visual.add_argument("topic", nargs="*", default=["astar"], help="lesson topic, 'serve', or 'mcp'")
    p_visual.add_argument("--no-speak", action="store_true", help="disable spoken narration")
    p_visual.set_defaults(func=cmd_visual)

    p_doctor = sub.add_parser("doctor", help="inspect configured dependencies and models")
    p_doctor.set_defaults(func=cmd_doctor)

    p_key = sub.add_parser("set-key", help="configure an API key in secrets")
    p_key.add_argument("--stdin", action="store_true", help="read key from standard input")
    p_key.set_defaults(func=cmd_set_key)

    p_config = sub.add_parser("config", help="show or initialize visual configuration")
    p_config.set_defaults(func=cmd_config)

    p_logs = sub.add_parser("logs", help="show recent visual server log lines")
    p_logs.add_argument("-n", "--lines", type=int, default=40, help="number of lines to show")
    p_logs.set_defaults(func=cmd_logs)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    from .log import setup
    setup(verbose=args.verbose)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
