from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys

from . import __version__
from .config import (
    enable_openrouter,
    load_config,
    set_config_value,
    write_default_config,
    write_secret,
)
from .memory import Memory
from .orchestrator import Orchestrator
from .safety import classify_text
from .skills import build_registry


def _orchestrator(args) -> Orchestrator:
    cfg = load_config()
    return Orchestrator(cfg, session=getattr(args, "session", None))


def cmd_text(args) -> int:
    orch = _orchestrator(args)
    response = orch.handle_text(args.text, speak=not args.no_speak, dry_run=args.dry_run)
    print(response.text)
    if response.promoted:
        print(f"[learned new skill: {response.promoted}]")
    return 0


def cmd_ask(args) -> int:
    import sys

    from .orchestrator import SpeechQueue

    cfg = load_config()
    orch = Orchestrator(cfg, session=args.session or "gui")
    speech = None if args.no_speak else SpeechQueue(orch.tts, orch.persona)
    buffer = {"text": ""}

    def emit() -> None:
        sys.stdout.write(buffer["text"].replace("\n", "\\n") + "\n")
        sys.stdout.flush()

    def on_token(delta: str) -> None:
        buffer["text"] += delta
        emit()

    first: dict = {}

    def on_sentence(sentence: str) -> None:
        if speech is None or "text" in first:
            return
        first["text"] = sentence
        speech.say(sentence)

    def on_progress(message: str) -> None:
        # Hand-off confirmations and Intern progress: show and speak them.
        buffer["text"] = message
        emit()
        if speech is not None:
            speech.say(message)

    split = bool(getattr(cfg.tts, "split_sentences", False))

    response = orch.router.route(
        args.text,
        on_token=on_token,
        on_sentence=(on_sentence if (speech is not None and split) else None),
        on_progress=on_progress,
    )
    if response.data.get("spoken_progress"):
        buffer["text"] = response.text
        emit()
        if speech is not None:
            speech.close()
        return 0
    if split and response.data.get("streamed"):
        if speech is not None:
            remainder = response.text
            spoken = first.get("text", "")
            if spoken and remainder.startswith(spoken):
                remainder = remainder[len(spoken):].strip()
            speech.say(remainder)
    else:
        buffer["text"] = response.text
        emit()
        if speech is not None:
            is_report = bool(response.source == "agent" and response.data.get("raw"))
            speech.say(response.text, interrupt=is_report)
    if speech is not None:
        speech.close()
    return 0


def cmd_chat(args) -> int:
    orch = _orchestrator(args)
    print(f"Omarchy Assistant {__version__}. Ctrl-D to exit.")
    while True:
        try:
            line = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not line:
            continue
        if line in {"exit", "quit"}:
            break
        response = orch.handle_text(line, speak=not args.no_speak, dry_run=args.dry_run)
        print(f"assistant> {response.text}")
        if response.promoted:
            print(f"[learned new skill: {response.promoted}]")
    return 0


def cmd_listen(args) -> int:
    if args.file:
        orch = _orchestrator(args)
        response = orch.handle_audio(args.file, speak=not args.no_speak, dry_run=args.dry_run)
        transcript = response.data.get("transcript", "")
        if transcript:
            print(f"heard> {transcript}")
        print(f"assistant> {response.text}")
        if response.promoted:
            print(f"[learned new skill: {response.promoted}]")
        return 0
    orch = _orchestrator(args)
    response = orch.listen(seconds=args.seconds, speak=not args.no_speak, dry_run=args.dry_run)
    transcript = response.data.get("transcript", "")
    if transcript:
        print(f"heard> {transcript}")
    print(f"assistant> {response.text}")
    if response.promoted:
        print(f"[learned new skill: {response.promoted}]")
    return 0


def cmd_skills(args) -> int:
    cfg = load_config()
    action = getattr(args, "action", None) or "list"
    if action == "remove":
        import json

        name = getattr(args, "name", None)
        target = None
        for path in sorted(cfg.skills_dir.glob("*.json")):
            try:
                data = json.loads(path.read_text())
            except (OSError, ValueError):
                continue
            if data.get("name") == name or path.stem == name:
                target = path
                break
        if target is None:
            print(f"not found: {name}")
            return 1
        target.unlink()
        print(f"removed: {target}")
        return 0
    registry = build_registry(cfg)
    print(f"skills directory: {cfg.skills_dir}")
    for skill in registry.skills:
        print(f"  {skill.order:>3}  {skill.name:<12} {skill.description}")
    return 0


def cmd_facts(args) -> int:
    cfg = load_config()
    memory = Memory(cfg.facts_path)
    if args.action == "add":
        for fact in args.fact:
            added = memory.add_fact(fact)
            print(f"added: {fact}" if added else f"already known: {fact}")
    elif args.action == "forget":
        for fact in args.fact:
            removed = memory.forget_fact(fact)
            print(f"forgot: {fact}" if removed else f"not found: {fact}")
    else:
        if not memory.facts:
            print("(no facts remembered)")
        for fact in memory.facts:
            print(f"- {fact}")
    return 0


def cmd_config(args) -> int:
    cfg = load_config()
    if args.init:
        path = write_default_config(cfg.config_dir)
        print(f"config: {path}")
    print(f"config dir: {cfg.config_dir}")
    print(f"skills dir: {cfg.skills_dir}")
    return 0


def cmd_capabilities(args) -> int:
    from .capabilities import Capability, CapabilityStore
    from .skills import build_registry

    cfg = load_config()
    store = CapabilityStore(cfg.capabilities_path)
    store.sync_from_skills(build_registry(cfg).skills)
    if args.action == "remove":
        print(f"removed: {args.name}" if store.remove(args.name) else f"not found: {args.name}")
        return 0
    if args.action == "add":
        store.add(Capability(name=args.name, description=args.description or args.name,
                             status="planned", source="planned"))
        print(f"added planned capability: {args.name}")
        return 0
    for capability in store.list():
        print(f"  [{capability.status:<9}] {capability.name:<20} {capability.description}")
    return 0


def cmd_interns(args) -> int:
    import json

    from .interns import InternRegistry

    cfg = load_config()
    registry = InternRegistry(cfg.interns_path)
    if args.action == "clear":
        registry.clear()
        print("cleared")
        return 0
    tasks = registry.list()
    if args.json:
        print(json.dumps(tasks))
        return 0
    if not tasks:
        print("  no intern activity yet")
        return 0
    for t in tasks[-20:]:
        print(f"  [{str(t.get('status', '?')):<7}] {t.get('title', '')}")
        for e in (t.get("events") or [])[-3:]:
            print(f"            {e}")
    return 0


def cmd_cache(args) -> int:
    from .cache import ResponseCache

    cfg = load_config()
    cache = ResponseCache(cfg.cache_path)
    if args.action == "clear":
        print(f"cleared {cache.clear()} entries")
    else:
        print(f"{cache.size()} cached answers")
    return 0


def cmd_sessions(args) -> int:
    from .conversation import SessionStore

    cfg = load_config()
    store = SessionStore(cfg.sessions_dir, max_turns=cfg.context.max_turns, max_chars=cfg.context.max_chars)
    if args.action == "clear":
        if args.name:
            print(f"cleared: {args.name}" if store.clear(args.name) else f"not found: {args.name}")
        else:
            for name in store.list_sessions():
                store.clear(name)
            print("cleared all sessions")
    elif args.action == "show":
        conv = store.get(args.name)
        if conv is None or not conv.turns:
            print("(empty)")
            return 0
        for turn in conv.turns:
            print(f"{turn.role}> {turn.content}")
    else:
        names = store.list_sessions()
        if not names:
            print("(no sessions)")
        for name in names:
            conv = store.get(name)
            turns = len(conv.turns) if conv else 0
            print(f"  {name:<20} {turns} turns")
    return 0


def cmd_doctor(args) -> int:
    cfg = load_config()
    print(f"version: {__version__}")
    print(f"config dir: {cfg.config_dir}")
    print(f"config file: {cfg.config_dir / 'config.toml'} (exists={ (cfg.config_dir / 'config.toml').exists() })")
    print("binaries:")
    for name in ("voxtype", "opencode", "agy", "claude", "pw-record", "pw-play", "mpv", "notify-send", "espeak-ng", "piper", "omarchy"):
        print(f"  {name:<12} {'yes' if shutil.which(name) else 'no'}")
    print(f"llm enabled: {cfg.llm.enabled}  key({cfg.llm.api_key_env}): {'set' if cfg.llm_key() else 'missing'}")
    print(f"llm model: {cfg.llm.model}  fallbacks: {cfg.llm.fallback_models}  fallback_provider: {getattr(cfg.llm, 'fallback_provider', 'antigravity')}  base: {cfg.llm.base_url}")
    print(f"persona: {cfg.persona.name} (register={cfg.persona.register}, enabled={cfg.persona.enabled})")
    print(f"tts provider: {cfg.tts.provider}  model: {cfg.tts.model}")
    print(f"stt provider: {cfg.stt.provider}  engine: {cfg.stt.engine}")
    print(f"agent: {cfg.agent.command}  fallback: {getattr(cfg.agent, 'fallback_command', [])}  enabled={cfg.agent.enabled}")
    return 0


def cmd_classify(args) -> int:
    print(classify_text(args.text).value)
    return 0


def _menu_input(prompt: str, width: int = 600) -> str:
    override = os.environ.get("OMARCHY_ASSISTANT_INPUT_CMD")
    if override:
        import shlex

        proc = subprocess.run(shlex.split(override), capture_output=True, text=True, timeout=300)
        return proc.stdout.strip()
    if shutil.which("omarchy"):
        proc = subprocess.run(
            ["omarchy", "menu", "input", prompt, "--width", str(width)],
            capture_output=True,
            text=True,
            timeout=300,
        )
        return proc.stdout.strip()
    if shutil.which("omarchy-menu-input"):
        proc = subprocess.run(
            ["omarchy-menu-input", prompt, "--width", str(width)],
            capture_output=True,
            text=True,
            timeout=300,
        )
        return proc.stdout.strip()
    try:
        return input(f"{prompt}: ").strip()
    except EOFError:
        return ""


def _prompt_key() -> str:
    if os.environ.get("OMARCHY_ASSISTANT_INPUT_CMD") or shutil.which("omarchy") or shutil.which("omarchy-menu-input"):
        return _menu_input("OpenRouter API key", width=500)
    import getpass

    return getpass.getpass("OpenRouter API key: ").strip()


def cmd_set_key(args) -> int:
    cfg = load_config()
    if args.stdin:
        key = sys.stdin.read().strip()
    elif args.clipboard:
        key = _read_clipboard()
    else:
        key = _prompt_key()
    if not key:
        print("No key entered; nothing changed.")
        return 1
    path = write_secret(cfg.config_dir, cfg.llm.api_key_env, key)
    print(f"Stored key in {path} (mode 600).")
    if not args.no_enable:
        enable_openrouter(cfg.config_dir)
        print("Enabled OpenRouter for LLM answers and Fish TTS.")
    masked = f"{key[:6]}...{key[-4:]}" if len(key) > 12 else "***"
    print(f"key: {masked}")
    return 0


def _read_clipboard() -> str:
    for command in (["wl-paste", "-n"], ["xclip", "-selection", "clipboard", "-o"]):
        if shutil.which(command[0]):
            proc = subprocess.run(command, capture_output=True, text=True, timeout=30)
            if proc.returncode == 0:
                return proc.stdout.strip()
    print("No clipboard tool found (install wl-clipboard).")
    return ""




def cmd_set_calendar(args) -> int:
    from .gcal import CalendarUnavailable, oauth_flow

    cfg = load_config()
    client_id = args.client_id or cfg.secret("GOOGLE_CLIENT_ID")
    client_secret = args.client_secret or cfg.secret("GOOGLE_CLIENT_SECRET")
    if not client_id:
        client_id = _menu_input("Google OAuth client id", width=600).strip()
    if not client_secret:
        import getpass

        try:
            client_secret = getpass.getpass("Google OAuth client secret: ").strip()
        except (EOFError, OSError):
            client_secret = ""
    if not (client_id and client_secret):
        print("Need both a client id and a client secret.")
        return 1
    write_secret(cfg.config_dir, "GOOGLE_CLIENT_ID", client_id, section="google")
    write_secret(cfg.config_dir, "GOOGLE_CLIENT_SECRET", client_secret, section="google")
    try:
        tokens = oauth_flow(client_id, client_secret)
    except CalendarUnavailable as exc:
        print(f"Authorization failed: {exc}")
        return 1
    refresh = tokens.get("refresh_token")
    if not refresh:
        print("No refresh token returned - retry and approve access when prompted.")
        return 1
    write_secret(cfg.config_dir, "GOOGLE_REFRESH_TOKEN", refresh, section="google")
    print("Calendar + Drive connected. Try: omarchy-assistant text \"what's on my calendar\"")
    return 0


def cmd_sync_docs(args) -> int:
    from .gdrive import build_drive, gdrive_cache_dir, sync_google_docs

    cfg = load_config()
    if build_drive(cfg) is None:
        print("Google Drive isn't connected - run 'omarchy-assistant set-calendar'.")
        return 1
    count = sync_google_docs(cfg, force=True)
    print(f"Synced {count} Google Doc(s) into {gdrive_cache_dir(cfg)}")
    print("They're indexed into the knowledge base on the next turn.")
    return 0


def cmd_import_docs(args) -> int:
    import json
    import re
    from pathlib import Path

    from .gdrive import GoogleUnavailable, build_drive

    cfg = load_config()
    drive = build_drive(cfg)
    if drive is None:
        print("Google Drive isn't connected - run 'omarchy-assistant set-calendar'.")
        return 1
    vault = Path(cfg.documents.dir).expanduser()
    vault.mkdir(parents=True, exist_ok=True)
    state_path = cfg.config_dir / "gdoc_import_state.json"
    try:
        state = json.loads(state_path.read_text())
    except (OSError, ValueError):
        state = {}
    used = set(state.values())
    count = 0
    for doc in drive.list_docs():
        name = doc.get("name", "untitled")
        doc_id = doc.get("id", "")
        try:
            body = drive.export_doc(doc_id, mime="text/markdown")
        except GoogleUnavailable:
            try:
                body = drive.export_doc(doc_id, mime="text/plain")
            except GoogleUnavailable as exc:
                print(f"  skip {name!r}: {exc}")
                continue
        safe = re.sub(r"[^A-Za-z0-9 _.-]", "", name).strip() or "untitled"
        fname = state.get(doc_id)
        if not fname:
            candidate = f"{safe}.md"
            if candidate in used or (vault / candidate).exists():
                candidate = f"{safe} - {doc_id[:6]}.md"
            fname = candidate
            state[doc_id] = fname
            used.add(fname)
        path = vault / fname
        front = (
            "---\n"
            "tags: [gdrive]\n"
            f"gdoc_id: {doc_id}\n"
            f"modified: {doc.get('modifiedTime', '')}\n"
            "---\n\n"
        )
        path.write_text(front + body, encoding="utf-8")
        count += 1
    # Remove previously-imported files that are no longer tracked (renames /
    # duplicate names from earlier runs).
    import re as _re

    for existing in vault.glob("*.md"):
        head = existing.read_text(errors="replace")[:200]
        match = _re.search(r"^gdoc_id:\s*(\S+)", head, _re.M)
        if match and state.get(match.group(1)) != existing.name:
            try:
                existing.unlink()
            except OSError:
                pass
    state_path.write_text(json.dumps(state, indent=2))
    print(f"Imported {count} Google Doc(s) as .md into {vault}")
    print("Reindex happens on the next turn (or restart the service).")
    return 0


def cmd_summon(args) -> int:
    from . import notify

    cfg = load_config()
    text = _menu_input("Ask " + cfg.persona.name, width=600)
    if not text:
        return 0
    orch = Orchestrator(cfg, session=args.session or "voice")
    response = orch.handle_text(text, speak=not args.no_speak, dry_run=args.dry_run)
    if not args.no_notify:
        notify.send(cfg.persona.name, response.text)
    print(response.text)
    return 0


def cmd_serve(args) -> int:
    import time
    from datetime import datetime

    cfg = load_config()
    orch = Orchestrator(cfg, session=None)
    timers = orch.router.timers
    print(f"{cfg.persona.name} service running; {len(timers.active())} timer(s) active")
    last_hour = None
    try:
        while True:
            time.sleep(5)
            timers.adopt_external()
            if cfg.events.enabled and cfg.events.hourly:
                now = datetime.now()
                if now.minute == 0 and last_hour != now.hour:
                    last_hour = now.hour
                    try:
                        orch.say(orch.proactive("hourly", time=now.strftime("%H:%M")))
                    except Exception:  # noqa: BLE001
                        pass
    except KeyboardInterrupt:
        return 0


def cmd_api(args) -> int:
    from .api import serve

    serve(host=args.host, port=args.port, model=args.model)
    return 0


def cmd_event(args) -> int:
    cfg = load_config()
    orch = Orchestrator(cfg, session="events")
    value = args.arg or ""
    text = orch.proactive(
        args.name, percent=value, theme=value, summary=value, time=value
    )
    print(text)
    if not args.no_speak:
        orch.say(text)
    return 0


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

    p_text = sub.add_parser("text", help="handle a single text request")
    p_text.add_argument("text")
    p_text.add_argument("--session", help="continue a named conversation")
    p_text.add_argument("--no-speak", action="store_true")
    p_text.add_argument("--dry-run", action="store_true")
    p_text.set_defaults(func=cmd_text)

    p_ask = sub.add_parser("ask", help="stream an answer as newline-delimited updates (for the GUI)")
    p_ask.add_argument("text")
    p_ask.add_argument("--session", default="gui")
    p_ask.add_argument("--no-speak", action="store_true")
    p_ask.set_defaults(func=cmd_ask)

    p_chat = sub.add_parser("chat", help="interactive text REPL")
    p_chat.add_argument("--session", default="chat", help="conversation name (default: chat)")
    p_chat.add_argument("--no-speak", action="store_true")
    p_chat.add_argument("--dry-run", action="store_true")
    p_chat.set_defaults(func=cmd_chat)

    p_listen = sub.add_parser("listen", help="record and handle a spoken request")
    p_listen.add_argument("--seconds", type=float, default=None)
    p_listen.add_argument("--file", help="transcribe a WAV file instead of recording")
    p_listen.add_argument("--session", help="continue a named conversation")
    p_listen.add_argument("--no-speak", action="store_true")
    p_listen.add_argument("--dry-run", action="store_true")
    p_listen.set_defaults(func=cmd_listen)

    p_skills = sub.add_parser("skills", help="list available skills")
    p_skills.add_argument("action", nargs="?", choices=["list", "remove"], default="list")
    p_skills.add_argument("name", nargs="?", default=None)
    p_skills.set_defaults(func=cmd_skills)

    p_facts = sub.add_parser("facts", help="manage remembered facts")
    p_facts.add_argument("action", nargs="?", choices=["list", "add", "forget"], default="list")
    p_facts.add_argument("fact", nargs="*")
    p_facts.set_defaults(func=cmd_facts)

    p_sessions = sub.add_parser("sessions", help="list, show, or clear conversations")
    p_sessions.add_argument("action", nargs="?", choices=["list", "show", "clear"], default="list")
    p_sessions.add_argument("name", nargs="?", default=None)
    p_sessions.set_defaults(func=cmd_sessions)

    p_caps = sub.add_parser("capabilities", help="list what the assistant can and cannot do")
    p_caps.add_argument("action", nargs="?", choices=["list", "add", "remove"], default="list")
    p_caps.add_argument("name", nargs="?", default=None)
    p_caps.add_argument("--description", default=None)
    p_caps.set_defaults(func=cmd_capabilities)

    p_interns = sub.add_parser("interns", help="show what the Interns (coding agents) are doing")
    p_interns.add_argument("action", nargs="?", choices=["list", "clear"], default="list")
    p_interns.add_argument("--json", action="store_true")
    p_interns.set_defaults(func=cmd_interns)

    p_cache = sub.add_parser("cache", help="inspect or clear the response cache")
    p_cache.add_argument("action", nargs="?", choices=["size", "clear"], default="size")
    p_cache.set_defaults(func=cmd_cache)

    p_config = sub.add_parser("config", help="show or initialize config")
    p_config.add_argument("--init", action="store_true")
    p_config.set_defaults(func=cmd_config)

    p_doctor = sub.add_parser("doctor", help="report system and config status")
    p_doctor.set_defaults(func=cmd_doctor)

    p_classify = sub.add_parser("classify", help="show the safety risk of a command string")
    p_classify.add_argument("text")
    p_classify.set_defaults(func=cmd_classify)

    p_key = sub.add_parser("set-key", help="prompt for and store an OpenRouter API key")
    p_key.add_argument("--no-enable", action="store_true",
                       help="store the key without enabling OpenRouter for LLM/TTS")
    p_key.add_argument("--clipboard", action="store_true",
                       help="read the key from the clipboard instead of a popup")
    p_key.add_argument("--stdin", action="store_true",
                       help="read the key from standard input")
    p_key.set_defaults(func=cmd_set_key)


    p_cal = sub.add_parser("set-calendar", help="connect Google Calendar + Drive (read/write) via OAuth")
    p_cal.add_argument("--client-id", help="Google OAuth client id")
    p_cal.add_argument("--client-secret", help="Google OAuth client secret")
    p_cal.set_defaults(func=cmd_set_calendar)

    p_import = sub.add_parser("import-docs", help="import Google Docs into the vault as .md")
    p_import.set_defaults(func=cmd_import_docs)

    p_sync = sub.add_parser("sync-docs", help="mirror Google Docs into the local knowledge base")
    p_sync.set_defaults(func=cmd_sync_docs)

    p_summon = sub.add_parser("summon", help="pop up an input box and ask the assistant")
    p_summon.add_argument("--session", default="voice")
    p_summon.add_argument("--no-speak", action="store_true")
    p_summon.add_argument("--no-notify", action="store_true")
    p_summon.add_argument("--dry-run", action="store_true")
    p_summon.set_defaults(func=cmd_summon)

    p_serve = sub.add_parser("serve", help="run the background timer/reminder service")
    p_serve.set_defaults(func=cmd_serve)

    p_api = sub.add_parser("api", help="OpenAI-compatible HTTP server (for Home Assistant)")
    p_api.add_argument("--host", default="127.0.0.1")
    p_api.add_argument("--port", type=int, default=8765)
    p_api.add_argument("--model", default="qweeps")
    p_api.set_defaults(func=cmd_api)

    p_event = sub.add_parser("event", help="deliver a proactive remark for a system event")
    p_event.add_argument("name", help="post-boot | hourly | idle | battery-low | theme-set | agent-done")
    p_event.add_argument("arg", nargs="?", default="", help="event value (percent, theme, summary, time)")
    p_event.add_argument("--no-speak", action="store_true")
    p_event.set_defaults(func=cmd_event)

    p_visual = sub.add_parser("visual", help="launch a 3Blue1Brown interactive visual explainer")
    p_visual.add_argument("topic", nargs="*", default=["astar"], help="topic, known scene, serve, or mcp")
    p_visual.add_argument("--no-speak", action="store_true", help="disable voice narration")
    p_visual.set_defaults(func=cmd_visual)

    p_logs = sub.add_parser("logs", help="show recent assistant log lines")
    p_logs.add_argument("--lines", type=int, default=40)
    p_logs.set_defaults(func=cmd_logs)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    from . import log

    log.setup(getattr(args, "verbose", False))
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
