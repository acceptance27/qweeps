from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import tomllib  # type: ignore[import-not-found]
except ModuleNotFoundError:
    try:
        import tomli as tomllib  # type: ignore[import-not-found,no-redef]
    except ModuleNotFoundError:
        class _TomlFallback:
            @staticmethod
            def _strip_comment(line: str) -> str:
                in_str = False
                quote_char = ""
                escaped = False
                for i, ch in enumerate(line):
                    if escaped:
                        escaped = False
                        continue
                    if ch == "\\":
                        escaped = True
                        continue
                    if in_str:
                        if ch == quote_char:
                            in_str = False
                    elif ch in ('"', "'"):
                        in_str = True
                        quote_char = ch
                    elif ch == "#":
                        return line[:i]
                return line

            @classmethod
            def loads(cls, text: str) -> dict[str, Any]:
                root: dict[str, Any] = {}
                current: dict[str, Any] = root
                for raw_line in text.splitlines():
                    line = cls._strip_comment(raw_line).strip()
                    if not line:
                        continue
                    if line.startswith("[") and line.endswith("]"):
                        sec = line[1:-1].strip().strip('"').strip("'")
                        current = root.setdefault(sec, {})
                        continue
                    if "=" in line:
                        m = re.match(r'^("([^"\\]|\\.)*"|\'([^\'\\]|\\.)*\'|[A-Za-z0-9_.-]+)\s*=\s*(.+)$', line)
                        if m:
                            raw_k, _, _, raw_v = m.groups()
                            key = json.loads(raw_k) if raw_k.startswith('"') else raw_k.strip("'")
                            val_str = raw_v.strip()
                            if val_str.startswith("'") and val_str.endswith("'"):
                                val: Any = val_str[1:-1]
                            else:
                                val = json.loads(val_str)
                            current[key] = val
                return root

            @classmethod
            def load(cls, fp: Any) -> dict[str, Any]:
                raw = fp.read()
                text = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else str(raw)
                return cls.loads(text)

        tomllib = _TomlFallback()  # type: ignore[assignment]

DEFAULT_CONFIG_DIR = Path.home() / ".config" / "qweeps"
LEGACY_CONFIG_DIR = Path.home() / ".config" / "omarchy-assistant"

DEFAULT_CONFIG_TOML = """\
[llm]
enabled = true
base_url = "https://openrouter.ai/api/v1"
model = "nvidia/nemotron-3.5-super-vl:free"
fallback_models = []
classify_mode = "local"
classify_model = ""
api_key_env = "OPENROUTER_API_KEY"
auth_provider = "openrouter"
user_agent = "opencode/1.18.35"
session_id = ""
reasoning_effort = "none"
max_tokens = 2048
timeout = 60
fallback_provider = "offline"
visual_provider = "opencode-go"  # empty inherits the main provider
visual_model = "opencode-go/deepseek-v4.1-flash"
visual_vision_model = "opencode-go/deepseek-v4.1-flash"

[tts]
provider = "espeak"          # none | openrouter | piper | espeak
base_url = "https://openrouter.ai/api/v1"
model = "fish-audio/s2.1-pro-free:free"
voice = "33a2191b8fda440cae962137e9793985"
response_format = "mp3"
api_key_env = "OPENROUTER_API_KEY"
piper_model = ""
latency = "low"
temperature = 1.2
top_p = 0.95
stream = true
split_sentences = false

[stt]
provider = "voxtype"         # voxtype | openrouter | file | none
engine = "cohere"            # cohere | whisper | parakeet | ...
model = ""
language = "en"
base_url = "https://openrouter.ai/api/v1"
stt_model = "fish-audio/transcribe-1"
api_key_env = "OPENROUTER_API_KEY"
sample_rate = 16000
max_seconds = 30

[agent]
enabled = true
command = ["opencode", "run", "{prompt}"]
fallback_command = ["agy", "--continue", "--print", "{prompt}"]
start_dir = "~/Work"
timeout = 600
promote_skills = true
auto_promote_skills = true
ask_before_learning = true
progress = true
progress_interval = 4.0
format_args = ["--format", "json"]
visible_only = true
delegate_timeout = 60
report = true                # have QWEEPS summarise long Intern output out loud

[safety]
confirm_risk = ["medium", "high"]
allowlist = []
timeout_seconds = 30
allow_deletion = false

[persona]
enabled = true
name = "QWEEPS"
register = "gush"
hands = "a small crew of coding agents who are your hands"

[context]
max_turns = 12
max_chars = 6000

[notes]
dir = "~/Documents/Notes"
mode = "daily"
frontmatter = true

[documents]
dir = "~/Documents"

[calendar]
enabled = true
calendar_id = "primary"
client_id_env = "GOOGLE_CLIENT_ID"
client_secret_env = "GOOGLE_CLIENT_SECRET"
refresh_token_env = "GOOGLE_REFRESH_TOKEN"

[drive]
enabled = true
sync_docs = true

[events]
enabled = true
hourly = true

[apps]
browser = ["omarchy", "launch", "browser"]
terminal = ["omarchy", "launch", "terminal"]
files = ["xdg-open", "{home}"]

[routes]
"teams is434 architecture" = ["xdg-open", "https://teams.microsoft.com"]
"teams is434 discussion" = ["xdg-open", "https://teams.microsoft.com"]
"deep-research" = ["xdg-open", "https://chatgpt.com"]
"""


@dataclass
class LLMConfig:
    enabled: bool = True
    base_url: str = "https://openrouter.ai/api/v1"
    model: str = "nvidia/nemotron-3.5-super-vl:free"
    fallback_models: list[str] = field(default_factory=list)
    classify_mode: str = "local"
    classify_model: str = ""
    api_key_env: str = "OPENROUTER_API_KEY"
    auth_provider: str = "openrouter"
    user_agent: str = "opencode/1.18.35"
    session_id: str = ""
    reasoning_effort: str = "none"
    max_tokens: int = 2048
    timeout: int = 60
    fallback_provider: str = "offline"
    visual_provider: str = "opencode-go"
    visual_model: str = "opencode-go/deepseek-v4.1-flash"
    visual_vision_model: str = "opencode-go/deepseek-v4.1-flash"


@dataclass
class TTSConfig:
    provider: str = "espeak"
    base_url: str = "https://openrouter.ai/api/v1"
    model: str = "fish-audio/s2.1-pro-free:free"
    voice: str = ""
    response_format: str = "mp3"
    api_key_env: str = "OPENROUTER_API_KEY"
    piper_model: str = ""
    latency: str = "low"
    temperature: float = 1.2
    top_p: float = 0.95
    stream: bool = True
    split_sentences: bool = False


@dataclass
class STTConfig:
    provider: str = "voxtype"
    engine: str = "cohere"
    model: str = ""
    language: str = "en"
    base_url: str = "https://openrouter.ai/api/v1"
    stt_model: str = "fish-audio/transcribe-1"
    api_key_env: str = "OPENROUTER_API_KEY"
    sample_rate: int = 16000
    max_seconds: int = 30


@dataclass
class AgentConfig:
    enabled: bool = True
    command: list[str] = field(default_factory=lambda: ["opencode", "run", "{prompt}"])
    fallback_command: list[str] = field(
        default_factory=lambda: ["agy", "--continue", "--print", "{prompt}"]
    )
    start_dir: str = "~/Work"
    timeout: int = 600
    promote_skills: bool = True
    auto_promote_skills: bool = True
    ask_before_learning: bool = True
    progress: bool = True
    progress_interval: float = 4.0
    format_args: list[str] = field(default_factory=lambda: ["--format", "json"])
    # Prefer an agent window already open on the desktop over a hidden headless
    # run. When true, delegation only ever targets a visible agent (searching
    # other workspaces if the current one has none).
    visible_only: bool = True
    # Cap on a single delegated agent turn. Kept well under the Home Assistant
    # request timeout so a busy/hung session can't make HA wait forever.
    delegate_timeout: int = 60
    # Have the Talker turn long or markdown-heavy Intern output into a short,
    # in-character spoken report instead of reading it out verbatim.
    report: bool = True
    window_classes: dict[str, str] = field(
        default_factory=lambda: {
            "org.omarchy.agent": "opencode",
            "org.omarchy.opencode": "opencode",
            "org.omarchy.agy": "antigravity",
        }
    )
    delegate_commands: dict[str, list[str]] = field(
        default_factory=lambda: {
            "opencode": ["opencode", "run", "--session", "{session}", "--auto", "{prompt}"],
            "antigravity": ["agy", "--continue", "--print", "{prompt}"],
        }
    )


@dataclass
class SafetyConfig:
    confirm_risk: list[str] = field(default_factory=lambda: ["medium", "high"])
    allowlist: list[str] = field(default_factory=list)
    timeout_seconds: int = 30
    allow_deletion: bool = False


@dataclass
class PersonaConfig:
    enabled: bool = True
    name: str = "QWEEPS"
    register: str = "gush"
    hands: str = "a small crew of coding agents who are your hands"


@dataclass
class ContextConfig:
    max_turns: int = 12
    max_chars: int = 6000


@dataclass
class NotesConfig:
    dir: str = "~/Documents/Notes"
    mode: str = "daily"          # daily | inbox | file
    frontmatter: bool = True


@dataclass
class DocumentsConfig:
    dir: str = "~/Documents"



@dataclass
class CalendarConfig:
    enabled: bool = True
    calendar_id: str = "primary"
    client_id_env: str = "GOOGLE_CLIENT_ID"
    client_secret_env: str = "GOOGLE_CLIENT_SECRET"
    refresh_token_env: str = "GOOGLE_REFRESH_TOKEN"


@dataclass
class DriveConfig:
    enabled: bool = True
    sync_docs: bool = True


@dataclass
class EventsConfig:
    enabled: bool = True
    hourly: bool = True


@dataclass
class Config:
    llm: LLMConfig = field(default_factory=LLMConfig)
    tts: TTSConfig = field(default_factory=TTSConfig)
    stt: STTConfig = field(default_factory=STTConfig)
    agent: AgentConfig = field(default_factory=AgentConfig)
    safety: SafetyConfig = field(default_factory=SafetyConfig)
    persona: PersonaConfig = field(default_factory=PersonaConfig)
    context: ContextConfig = field(default_factory=ContextConfig)
    notes: NotesConfig = field(default_factory=NotesConfig)
    documents: DocumentsConfig = field(default_factory=DocumentsConfig)
    calendar: CalendarConfig = field(default_factory=CalendarConfig)
    drive: DriveConfig = field(default_factory=DriveConfig)
    events: EventsConfig = field(default_factory=EventsConfig)
    apps: dict[str, list[str]] = field(default_factory=dict)
    routes: dict[str, list[str]] = field(default_factory=dict)
    config_dir: Path = DEFAULT_CONFIG_DIR

    @property
    def sessions_dir(self) -> Path:
        return self.config_dir / "sessions"

    @property
    def capabilities_path(self) -> Path:
        return self.config_dir / "capabilities.json"

    @property
    def skills_dir(self) -> Path:
        return self.config_dir / "skills"

    @property
    def facts_path(self) -> Path:
        return self.config_dir / "facts.json"

    @property
    def interns_path(self) -> Path:
        return self.config_dir / "interns.json"

    @property
    def cache_path(self) -> Path:
        return self.config_dir / "cache.sqlite3"

    @property
    def rag_path(self) -> Path:
        return self.config_dir / "rag.sqlite3"

    @property
    def embeddings_path(self) -> Path:
        return self.config_dir / "embeddings.sqlite3"

    def secret(self, env_name: str) -> str | None:
        value = os.environ.get(env_name)
        if value:
            return value
        for secrets_file in (self.config_dir / "secrets.toml", LEGACY_CONFIG_DIR / "secrets.toml"):
            if secrets_file.exists():
                with secrets_file.open("rb") as fh:
                    data = tomllib.load(fh)
                for section in data.values():
                    if isinstance(section, dict):
                        for key, val in section.items():
                            if key.upper() == env_name.upper() and isinstance(val, str):
                                return val
        local_env = Path.cwd() / ".env"
        if local_env.is_file():
            try:
                for line in local_env.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, _, v = line.partition("=")
                        if k.strip().upper() == env_name.upper():
                            return v.strip().strip("'\"")
            except Exception:
                pass
        return None

    def opencode_auth_key(self, provider: str, path: Path | None = None) -> str | None:
        import json

        target = Path(path) if path else Path.home() / ".local" / "share" / "opencode" / "auth.json"
        if not target.exists():
            return None
        try:
            data = json.loads(target.read_text())
        except (OSError, ValueError):
            return None
        entry = data.get(provider)
        if isinstance(entry, dict):
            key = entry.get("key")
            if isinstance(key, str) and key:
                return key
        return None

    def llm_key(self) -> str | None:
        key = self.secret(self.llm.api_key_env)
        if key:
            return key
        if self.llm.auth_provider:
            return self.opencode_auth_key(self.llm.auth_provider)
        return None


def _apply(dc: Any, data: dict[str, Any]) -> None:
    for key, value in data.items():
        if hasattr(dc, key):
            setattr(dc, key, value)


def config_from_toml(raw: dict[str, Any], config_dir: Path = DEFAULT_CONFIG_DIR) -> Config:
    cfg = Config(config_dir=config_dir)
    for section, dc in (
        ("llm", cfg.llm),
        ("tts", cfg.tts),
        ("stt", cfg.stt),
        ("agent", cfg.agent),
        ("safety", cfg.safety),
        ("persona", cfg.persona),
        ("context", cfg.context),
        ("notes", cfg.notes),
        ("documents", cfg.documents),
        ("calendar", cfg.calendar),
        ("drive", cfg.drive),
        ("events", cfg.events),
    ):
        if isinstance(raw.get(section), dict):
            _apply(dc, raw[section])
    if isinstance(raw.get("apps"), dict):
        cfg.apps = {str(k): list(v) for k, v in raw["apps"].items()}
    if isinstance(raw.get("routes"), dict):
        cfg.routes = {str(k): list(v) for k, v in raw["routes"].items()}
    return cfg


def default_config(config_dir: Path = DEFAULT_CONFIG_DIR) -> Config:
    raw = tomllib.loads(DEFAULT_CONFIG_TOML)
    cfg = config_from_toml(raw, config_dir)
    cfg.apps = {str(k): list(v) for k, v in raw["apps"].items()}
    cfg.routes = {str(k): list(v) for k, v in raw["routes"].items()}
    return cfg


def load_config(
    path: str | Path | None = None,
    config_dir: Path | None = None,
) -> Config:
    if config_dir is None:
        env_dir = os.environ.get("QWEEPS_CONFIG_DIR") or os.environ.get("OMARCHY_ASSISTANT_CONFIG_DIR")
        if env_dir:
            config_dir = Path(env_dir)
        elif DEFAULT_CONFIG_DIR.exists():
            config_dir = DEFAULT_CONFIG_DIR
        elif LEGACY_CONFIG_DIR.exists():
            config_dir = LEGACY_CONFIG_DIR
        else:
            config_dir = DEFAULT_CONFIG_DIR
    if path is None:
        env_path = os.environ.get("QWEEPS_CONFIG") or os.environ.get("OMARCHY_ASSISTANT_CONFIG")
        if env_path:
            path = env_path
        elif (config_dir / "config.toml").is_file():
            path = config_dir / "config.toml"
        elif config_dir == DEFAULT_CONFIG_DIR and (LEGACY_CONFIG_DIR / "config.toml").is_file():
            path = LEGACY_CONFIG_DIR / "config.toml"
        else:
            path = config_dir / "config.toml"
    path = Path(path)
    if not path.exists():
        return default_config(config_dir)
    with path.open("rb") as fh:
        raw = tomllib.load(fh)
    return config_from_toml(raw, config_dir)


def write_default_config(config_dir: Path = DEFAULT_CONFIG_DIR) -> Path:
    config_dir.mkdir(parents=True, exist_ok=True)
    target = config_dir / "config.toml"
    if not target.exists():
        target.write_text(DEFAULT_CONFIG_TOML)
    return target


def _dump_toml(data: dict[str, dict[str, str]]) -> str:
    lines: list[str] = []
    for section, values in data.items():
        lines.append(f"[{section}]")
        for key, value in values.items():
            escaped = value.replace("\\", "\\\\").replace('"', '\\"')
            lines.append(f'{key} = "{escaped}"')
        lines.append("")
    return "\n".join(lines)


def write_secret(
    config_dir: Path,
    env_name: str,
    value: str,
    section: str = "openrouter",
) -> Path:
    config_dir.mkdir(parents=True, exist_ok=True)
    path = config_dir / "secrets.toml"
    data: dict[str, dict[str, str]] = {}
    if path.exists():
        with path.open("rb") as fh:
            existing = tomllib.load(fh)
        for sec, values in existing.items():
            if isinstance(values, dict):
                data[sec] = {str(k): str(v) for k, v in values.items()}
    data.setdefault(section, {})[env_name] = value
    path.write_text(_dump_toml(data))
    path.chmod(0o600)
    return path


def set_config_value(
    text: str,
    section: str,
    key: str,
    literal: str,
) -> str:
    lines = text.splitlines()
    section_re = re.compile(rf"^\s*\[{re.escape(section)}\]\s*$")
    key_re = re.compile(rf"^\s*{re.escape(key)}\s*=")
    in_section = False
    insert_at: int | None = None
    for i, line in enumerate(lines):
        if section_re.match(line):
            in_section = True
            insert_at = i + 1
            continue
        if in_section and line.strip().startswith("["):
            break
        if in_section:
            insert_at = i + 1
            if key_re.match(line):
                lines[i] = f"{key} = {literal}"
                return "\n".join(lines) + "\n"
    if insert_at is not None:
        lines.insert(insert_at, f"{key} = {literal}")
    else:
        lines.append(f"[{section}]")
        lines.append(f"{key} = {literal}")
    return "\n".join(lines) + "\n"


def enable_openrouter(config_dir: Path = DEFAULT_CONFIG_DIR) -> Path | None:
    path = config_dir / "config.toml"
    if not path.exists():
        write_default_config(config_dir)
    text = path.read_text()
    text = set_config_value(text, "llm", "enabled", "true")
    text = set_config_value(text, "tts", "provider", '"openrouter"')
    path.write_text(text)
    return path
