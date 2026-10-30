from __future__ import annotations

import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from ..types import Risk, SkillResult
from .base import SkillContext


def _slug(text: str, words: int = 6) -> str:
    tokens = re.findall(r"[a-z0-9]+", (text or "").lower())
    slug = "-".join(tokens[:words]).strip("-")
    return slug or "document"


class NotesSkill:
    name = "notes"
    description = "Add, read, search, or list Markdown notes"
    kind = "action"
    order = 44
    patterns = ["make a note buy milk", "read my notes", "search my notes for budget"]

    _add = re.compile(
        r"^\s*(?:please\s+)?(?:make|add|write|save|jot(?:\s+down)?|take)\s+(?:a\s+)?note\b"
        r"\s*(?:that)?\s*[:\-]?\s*(.+)$",
        re.IGNORECASE,
    )
    _note_self = re.compile(r"^\s*note\s+to\s+self\b[:\s\-]+(.+)$", re.IGNORECASE)
    _note_that = re.compile(r"^\s*note\s+that\s+(.+)$", re.IGNORECASE)
    _search = re.compile(r"^\s*(?:search|find|look\s+up|grep)\b.*?\bnotes?\b.*?\bfor\b\s+(.+)$", re.IGNORECASE)
    _list = re.compile(r"^\s*list\b.*?\bnotes?\b", re.IGNORECASE)
    _read = re.compile(r"^\s*(?:read|show|see|open)\b.*?\bnotes?\b", re.IGNORECASE)
    _append = re.compile(
        r"^\s*(?:add|append)\s+(?:this\s+)?(?:to|into)\s+(?:my\s+|the\s+)?note\s+"
        r"['\"]?(.+?)['\"]?\s*[:\-]\s*(.+)$",
        re.IGNORECASE,
    )

    def match(self, text: str) -> dict[str, Any] | None:
        stripped = text.strip()
        m = self._append.search(stripped)
        if m:
            return {"action": "append", "name": m.group(1).strip(" ,."), "text": m.group(2).strip(" ,.")}
        for regex in (self._note_self, self._note_that, self._add):
            m = regex.search(stripped)
            if m:
                return {"action": "add", "text": m.group(1).strip(" ,.")}
        m = self._search.search(stripped)
        if m:
            return {"action": "search", "query": m.group(1).strip(" ,.?")}
        if self._list.search(stripped):
            return {"action": "list"}
        if self._read.search(stripped):
            return {"action": "read"}
        return None

    def _dir(self, ctx: SkillContext) -> Path:
        return Path(ctx.cfg.notes.dir).expanduser()

    @staticmethod
    def _frontmatter(title: str) -> str:
        from datetime import datetime

        return (
            "---\n"
            "tags: [qweeps]\n"
            f"created: {datetime.now().isoformat(timespec='seconds')}\n"
            "---\n\n"
            f"# {title}\n\n"
        )

    def _note_path(self, ctx: SkillContext, directory: Path, text: str) -> Path:
        from datetime import datetime

        mode = getattr(ctx.cfg.notes, "mode", "daily")
        if mode == "file":
            slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "note"
            return directory / f"{slug}.md"
        if mode == "inbox":
            return directory / "inbox.md"
        return directory / f"{datetime.now().strftime('%Y-%m-%d')}.md"

    def _append_bullet(self, path: Path, text: str, ctx: SkillContext) -> None:
        from datetime import datetime

        if not path.exists() and getattr(ctx.cfg.notes, "frontmatter", True):
            title = path.stem
            path.write_text(self._frontmatter(title), encoding="utf-8")
        ts = datetime.now().strftime("%Y-%m-%d %H:%M")
        with path.open("a", encoding="utf-8") as fh:
            fh.write(f"- {ts} - {text}\n")

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        directory = self._dir(ctx)
        action = args["action"]
        if action in {"add", "append"}:
            if action == "append":
                name = args.get("name", "")
                path = directory / f"{name}.md"
                if not path.exists():
                    candidates = [
                        p for p in directory.rglob("*.md")
                        if name.lower() in p.stem.lower()
                    ] if directory.exists() else []
                    if candidates:
                        path = candidates[0]
                note = args.get("text", "")
            else:
                note = args["text"]
                path = self._note_path(ctx, directory, note)
            if ctx.dry_run:
                return SkillResult(text=f"(would note: {note})", action="notes")
            directory.mkdir(parents=True, exist_ok=True)
            path.parent.mkdir(parents=True, exist_ok=True)
            self._append_bullet(path, note, ctx)
            return SkillResult(text=f"Noted in {path.name}: {note}", action="notes", command=["write", str(path)])
        if action == "list":
            files = sorted(p.name for p in directory.glob("*.md")) if directory.exists() else []
            return SkillResult(
                text=("Your notes: " + ", ".join(files)) if files else "You have no notes yet.",
                action="notes",
            )
        if action == "search":
            query = args["query"].lower()
            hits: list[str] = []
            if directory.exists():
                for path in sorted(directory.rglob("*.md")):
                    for line in path.read_text(errors="replace").splitlines():
                        if query in line.lower():
                            hits.append(f"{path.stem}: {line.strip()}")
            if not hits:
                return SkillResult(text=f"No notes mention '{args['query']}'.", action="notes")
            return SkillResult(
                text=f"{len(hits)} match(es):\n" + "\n".join(hits[:20]), action="notes"
            )
        if not directory.exists():
            return SkillResult(text="You have no notes yet.", action="notes")
        inbox = directory / "inbox.md"
        if inbox.exists():
            lines = inbox.read_text(errors="replace").splitlines()
            return SkillResult(text="Recent notes:\n" + "\n".join(lines[-10:]), action="notes")
        files = sorted(directory.rglob("*.md"))
        if not files:
            return SkillResult(text="You have no notes yet.", action="notes")
        return SkillResult(text=files[-1].read_text(errors="replace")[:1000], action="notes")


class DocumentSkill:
    name = "document"
    description = "Write a document (Markdown, optionally .docx)"
    kind = "action"
    order = 46
    patterns = ["write a document about the water cycle", "draft a report on X as a word document"]

    _re = re.compile(
        r"^\s*(?:please\s+)?(?:write|create|make|draft|generate)\s+(?:me\s+)?(?:a\s+|an\s+)?"
        r"(?:word\s+|google\s+)?(?:document|docx|doc|report|memo|essay|article)\b(.*)$",
        re.IGNORECASE,
    )
    _named = re.compile(
        r"\b(?:called|named|titled)\s+['\"]?(.+?)['\"]?(?:\s+(?:about|on)\s+(.+))?$", re.IGNORECASE
    )
    _topic = re.compile(r"\b(?:about|on)\s+(.+)$", re.IGNORECASE)

    def match(self, text: str) -> dict[str, Any] | None:
        m = self._re.search(text.strip())
        if not m:
            return None
        rest = m.group(1).strip()
        name = None
        topic = None
        named = self._named.search(rest)
        if named:
            name = named.group(1).strip(" ,.")
            topic = named.group(2)
        topic_match = self._topic.search(rest)
        if not topic and topic_match:
            topic = topic_match.group(1).strip(" ,.")
        if not topic and rest:
            topic = rest.strip(" ,.")
        docx = "docx" in text.lower() or "word document" in text.lower()
        return {"name": name, "topic": topic, "docx": docx}

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        topic = args.get("topic")
        name = args.get("name")
        if not topic and not name:
            return SkillResult(text="What should the document be about?", action="document")
        name = name or _slug(topic or "document")
        directory = Path(ctx.cfg.documents.dir).expanduser()
        path = directory / f"{name}.md"
        if ctx.dry_run:
            return SkillResult(text=f"(would write {path})", action="document")
        content = ""
        if ctx.llm is not None and topic:
            content = ctx.llm.compose(
                f"Write a clear, well-structured document about: {topic}. "
                "Begin with a title heading."
            )
        directory.mkdir(parents=True, exist_ok=True)
        path.write_text(content or f"# {name}\n\n", encoding="utf-8")
        result_path = str(path)
        if args.get("docx"):
            converted = self._to_docx(ctx, path)
            if converted:
                result_path = converted
            else:
                result_path += " (no .docx produced - install pandoc)"
        return SkillResult(text=f"Wrote {result_path}", action="document", command=["write", str(path)])

    def _to_docx(self, ctx: SkillContext, md_path: Path) -> str | None:
        pandoc = shutil.which("pandoc")
        if pandoc:
            out = md_path.with_suffix(".docx")
            code, _o, _e = ctx.run_command([pandoc, str(md_path), "-o", str(out)], timeout=60)
            return str(out) if code == 0 else None
        soffice = shutil.which("soffice") or shutil.which("libreoffice")
        if soffice:
            code, _o, _e = ctx.run_command(
                [soffice, "--headless", "--convert-to", "docx",
                 "--outdir", str(md_path.parent), str(md_path)],
                timeout=120,
            )
            out = md_path.with_suffix(".docx")
            return str(out) if code == 0 and out.exists() else None
        return None


class ResearchSkill:
    name = "research"
    description = "Research a topic on the web and write a report"
    kind = "action"
    order = 66
    patterns = ["deep research the history of the bicycle"]

    _re = re.compile(r"^\s*(?:please\s+)?(?:deep[\s-]?research|research)\b[:,]?\s+(.+)$", re.IGNORECASE)

    def match(self, text: str) -> dict[str, Any] | None:
        m = self._re.search(text.strip())
        return {"topic": m.group(1).strip(" ,.")} if m else None

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        topic = args["topic"]
        available = ctx.agent is not None and getattr(ctx.agent, "available", lambda: False)()
        if not available:
            return SkillResult(
                text="I would need my Interns (the agent) to research that.", action="research"
            )
        if ctx.dry_run:
            return SkillResult(text=f"(would research {topic})", action="research")
        directory = Path(ctx.cfg.documents.dir).expanduser()
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{_slug(topic)}.md"
        prompt = (
            f"Research '{topic}' thoroughly using web search. Read several sources, cross-check the "
            f"facts, then write a well-structured Markdown report with headings and a final Sources "
            f"section listing links. Save the report to {path}. "
            "Reply with a short two-sentence summary and the file path."
        )
        try:
            output = ctx.agent.run(prompt)
        except Exception as exc:  # noqa: BLE001
            return SkillResult(text=f"Research failed: {exc}", action="research")
        return SkillResult(text=output or f"Research saved to {path}.", action="research")
