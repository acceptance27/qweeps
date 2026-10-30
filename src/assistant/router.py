from __future__ import annotations

import re
import threading
import time
from typing import Any, Callable

from . import notify
from .agent import Agent, AgentUnavailable, WorkspaceAgent, extract_capability, extract_recipe, strip_recipe, RECIPE_INSTRUCTION
from .cache import ResponseCache
from .config import Config
from .desktop import looks_like_desktop
from .embeddings import Embedder
from .interns import InternRegistry
from .llm import LLM
from .memory import Memory
from .rag import RAGIndex
from .safety import (
    INTERN_HINT,
    POLITE_COMMAND,
    Confirmer,
    classify_text,
    looks_like_action,
    max_risk,
    requires_confirmation,
)
from .signature import world_signature
from .skills import SkillContext, SkillRegistry, save_recipe
from .timers import TimerService
from .types import Response, SkillResult

_SENTENCE_END = re.compile(r"[.!?](\s|$)")

# How long Intern progress / the final result waits for the spoken
# acknowledgement, so the person always hears "on it" before the outcome.
_ACK_WAIT = 4.0

_POLITE_PREFIX = re.compile(
    r"^\s*(?:hey\s+\w+[,\s]+)?(?:please\s+)?(?:can|could|would|will)\s+you\s+(?:please\s+)?"
    r"(?:go\s+(?:and\s+)?)?",
    re.IGNORECASE,
)


def _imperative(text: str) -> str:
    """'Could you please close this window?' -> 'close this window'."""
    if not POLITE_COMMAND.search(text):
        return text
    stripped = _POLITE_PREFIX.sub("", text, count=1).strip().rstrip("?").rstrip()
    stripped = re.sub(r"[,\s]+please$", "", stripped, flags=re.IGNORECASE)
    return stripped or text


# Pronouns and anaphoric references triggering 1-turn follow-up context injection
_FOLLOWUP_PRONOUNS = re.compile(
    r"\b(it|that|this|them|those|the\s+first(?:\s+one)?|the\s+second(?:\s+one)?|the\s+last(?:\s+one)?|the\s+former|the\s+latter)\b",
    re.IGNORECASE,
)

# An explicit hand-off to the Interns/an agent ("ask the agent to…", "tell
# opencode to…"). These must reach the agent even when the request also contains
# desktop-ish words (workspace, open, browser) that would otherwise match the
# desktop skill first.
_HANDOFF = re.compile(
    r"\b(ask|tell|have|get|make|send|instruct|order|direct)\s+"
    r"(?:that\s+|your\s+|the\s+|my\s+)?"
    r"(interns?|agents?|hands|opencode|antigravity|agy)\b",
    re.IGNORECASE,
)
_HANDOFF_PREFIX = re.compile(
    r"^\s*(?:please\s+)?(?:can\s+you\s+|could\s+you\s+|would\s+you\s+|will\s+you\s+)?"
    r"(?:ask|tell|have|get|make|send|instruct|order|direct)\s+"
    r"(?:your\s+|the\s+|my\s+)?(?:interns?|agents?|hands|opencode|antigravity|agy)\b"
    r"(?:\s+(?:in|on)\s+(?:the|this|that|your|my)?\s*(?:\w+\s+)?workspace)?\s*(?:to\s+)?",
    re.IGNORECASE,
)


def _strip_handoff(text: str) -> str:
    stripped = _HANDOFF_PREFIX.sub("", text, count=1).strip()
    return stripped or text


# Requests about the user's own files, accounts, apps, or machine.
_PERSONAL = re.compile(
    r"\bmy\s+(?:\w+\s+){0,2}(notes?|docs?|documents?|files?|folders?|emails?|inbox|calendar|"
    r"photos?|account|machine|computer|desktop|browser|bookmarks?|tabs?|google|obsidian|notion|"
    r"drive|messages?|chats?|contacts?|music|library|playlist)\b|"
    r"\b(google\s+docs?|obsidian|notion|gmail|outlook|dropbox|slack|discord)\b",
    re.IGNORECASE,
)


def _looks_personal(text: str) -> bool:
    return bool(_PERSONAL.search(text or ""))

# Output from an agent run that is just a plan/abort rather than a result.
_ABORT = re.compile(
    r"\b(i'?ll|i will|i'?m going to|let me|dispatching|i'?m starting|starting to|"
    r"i can'?t|i cannot|unable to)\b",
    re.IGNORECASE,
)


def _looks_aborted(text: str) -> bool:
    stripped = (text or "").strip()
    return len(stripped) < 200 and bool(_ABORT.search(stripped))


def iter_sentences(chunks) -> Any:
    buffer = ""
    for chunk in chunks:
        buffer += chunk
        while True:
            match = _SENTENCE_END.search(buffer)
            if not match:
                break
            end = match.end()
            sentence = buffer[:end].strip()
            buffer = buffer[end:]
            if sentence:
                yield sentence
    if buffer.strip():
        yield buffer.strip()


class Router:
    def __init__(
        self,
        cfg: Config,
        registry: SkillRegistry,
        llm: LLM,
        memory: Memory,
        confirmer: Confirmer,
        agent: Agent | None = None,
        timers: TimerService | None = None,
        notifier: Any = None,
        runner: Any = None,
        conversation: Any = None,
        capabilities: Any = None,
    ) -> None:
        self.cfg = cfg
        self.registry = registry
        self.llm = llm
        self.memory = memory
        self.confirmer = confirmer
        self.agent = agent
        self.timers = timers
        self.notifier = notifier or notify
        self.runner = runner
        self.conversation = conversation
        self.capabilities = capabilities
        self.last_intern_task: str | None = None
        self.last_intern_result: str | None = None
        self.cache = ResponseCache(cfg.cache_path, embedder=self._embedder(cfg))
        self.signature = world_signature(cfg)
        self.rag = RAGIndex(cfg.rag_path, embedder=self._embedder(cfg))
        try:
            self.rag.reindex(cfg)
        except Exception:  # noqa: BLE001 - indexing must never block a turn
            pass

    def _confirm(self, prompt: str) -> bool:
        return self.confirmer(prompt)

    def _embedder(self, cfg: Config) -> Embedder:
        key = cfg.secret("OPENROUTER_API_KEY") or ""
        return Embedder(key, cfg.embeddings_path)

    def _context(self, dry_run: bool) -> SkillContext:
        return SkillContext(
            cfg=self.cfg,
            memory=self.memory,
            notifier=self.notifier,
            timers=self.timers,
            runner=self.runner,
            llm=self.llm,
            agent=self.agent,
            dry_run=dry_run,
        )

    def route(self, text: str, dry_run: bool = False,
              on_sentence: Callable[[str], None] | None = None,
              on_progress: Callable[[str], None] | None = None,
              on_token: Callable[[str], None] | None = None) -> Response:
        text = text.strip()
        if not text:
            return Response(text="I didn't catch that.", source="system")
        history = self.conversation.messages() if self.conversation else None
        start = time.time()
        response = self._dispatch(text, dry_run, history, on_sentence, on_progress, on_token)
        if response.source != "agent":
            self.last_intern_task = None
            self.last_intern_result = None
        if self.conversation is not None:
            self.conversation.add("user", text)
            self.conversation.add("assistant", response.text)
        from .log import get as _log

        duration = time.time() - start
        logger = _log()
        if duration >= 4.0:
            logger.warning("slow turn %r -> %s in %.2fs", text[:50], response.source, duration)
        else:
            logger.debug("turn %r -> %s in %.2fs", text[:50], response.source, duration)
        return response

    def _classify(self, text: str) -> str:
        if self.cfg.llm.classify_mode == "llm":
            return self.llm.classify(text)
        return "action" if looks_like_action(text) else "question"

    def _dispatch(self, text: str, dry_run: bool, history: list | None,
                  on_sentence: Callable[[str], None] | None = None,
                  on_progress: Callable[[str], None] | None = None,
                  on_token: Callable[[str], None] | None = None) -> Response:
        from .log import get as _log

        if self._agent_ready() and _HANDOFF.search(text):
            _log().debug("agent hand-off: %r", text[:60])
            return self._run_agent(text, on_progress=on_progress, dry_run=dry_run)

        # Spoken commands often arrive as polite questions; skills match the
        # imperative form ("can you close this window?" -> "close this window").
        command = _imperative(text)
        matched = self.registry.match(command)
        if matched is not None:
            skill, args = matched
            _log().debug("skill match: %s", skill.name)
            return self._run_skill(skill, args, dry_run, on_progress=on_progress)

        if not text.rstrip().endswith("?"):
            pick = self._route_capability(text)
            if pick is not None:
                skill = self._skill_by_name(pick["name"])
                if skill is not None:
                    _log().debug("capability route: %s", pick["name"])
                    return self._run_skill(skill, {"params": pick.get("params", {})}, dry_run,
                                           on_progress=on_progress)

        kind = self._classify(text)
        _log().debug("classified %r as %s", text[:60], kind)
        if kind == "action" and self._agent_ready():
            return self._run_agent(text, on_progress=on_progress, dry_run=dry_run)

        # Signature-keyed cache: instant answers for repeated, state-independent
        # questions. Anything live (personal data, desktop state) is never cached.
        cacheable = not (_looks_personal(text) or looks_like_desktop(text))
        if cacheable:
            cached = self.cache.get(text, self.signature)
            if cached:
                _log().debug("cache hit: %r", text[:60])
                return Response(text=cached, source="cache")

        # A request about the user's own stuff is handed to the Interns rather
        # than answered with a limitation - unless it's a question we can answer
        # from the local knowledge base (notes/documents/Google Docs).
        if self._agent_ready() and _looks_personal(text):
            if kind == "question" and self._has_rag_hits(text):
                _log().debug("answering from knowledge base: %r", text[:60])
            else:
                _log().debug("routing to Interns: %r", text[:60])
                return self._run_agent(text, on_progress=on_progress, dry_run=dry_run)

        if self._has_talker():
            return self._talk(text, history, cacheable, on_sentence, on_progress, on_token, dry_run=dry_run)

        answer, streamed = self._answer(text, history, on_sentence, on_token)
        if cacheable and answer and "I don't have a language model configured" not in answer:
            self.cache.put(text, answer, self.signature)
        response = Response(text=answer, source="llm")
        if streamed:
            response.data["streamed"] = True
        return response

    # -- Talker ---------------------------------------------------------------

    def _has_talker(self) -> bool:
        return callable(getattr(self.llm, "stream_talk", None)) or callable(getattr(self.llm, "talk", None))

    def _talk(self, text: str, history: list | None, cacheable: bool,
              on_sentence: Callable[[str], None] | None,
              on_progress: Callable[[str], None] | None,
              on_token: Callable[[str], None] | None,
              dry_run: bool = False) -> Response:
        """Let the Talker answer *or* route: the safety net for everything the
        local router didn't catch. The ROUTE header is decided before any prose,
        so a missed action becomes a hand-off instead of "I can't do that"."""
        from . import talker
        from .log import get as _log

        context = self._context_blob(text)
        stream = talker.RoutedStream()
        collected: list[str] = []
        streamed = False
        announced = False
        speak_live = on_sentence is not None or on_token is not None
        streamer = getattr(self.llm, "stream_talk", None)
        try:
            if streamer is not None and speak_live:
                buffer = ""
                for delta in streamer(text, context, history):
                    spoken = stream.feed(delta)
                    # An INTERNS confirmation is held back until the hand-off is
                    # approved, so we never say "doing it!" before a refusal.
                    if not spoken or stream.result.route == talker.INTERNS:
                        continue
                    streamed = True
                    if on_token is not None:
                        on_token(spoken)
                    buffer += spoken
                    while (match := _SENTENCE_END.search(buffer)):
                        sentence = buffer[: match.end()].strip()
                        buffer = buffer[match.end():]
                        if sentence:
                            collected.append(sentence)
                            if on_sentence is not None and not announced:
                                on_sentence(sentence)
                                announced = True
                routed = stream.close()
                if streamed and buffer.strip():
                    collected.append(buffer.strip())
                    if on_sentence is not None and not announced:
                        on_sentence(buffer.strip())
            else:
                routed = talker.parse(self.llm.talk(text, context, history))
        except Exception as exc:  # noqa: BLE001 - fall back to a plain answer
            _log().warning("talker failed (%s); falling back to a plain answer", exc)
            answer, was_streamed = self._answer(text, history, on_sentence, on_token)
            response = Response(text=answer, source="llm")
            if was_streamed:
                response.data["streamed"] = True
            return response

        _log().debug("talker routed %r -> %s %r", text[:60], routed.route, routed.task[:60])
        if routed.route == talker.INTERNS:
            if self._agent_ready():
                return self._run_agent(text, on_progress=on_progress, ack=routed.say,
                                       task=routed.task or None, dry_run=dry_run)
            return Response(
                text=(
                    "Ooh, that one's a job for my Interns - but, uh, none of them are on shift right now! "
                    "Open an opencode or Antigravity window and I'll put them straight on it."
                ),
                source="llm",
            )

        answer = " ".join(collected).strip() if streamed else routed.say
        if not answer:
            answer, was_streamed = self._answer(text, history, on_sentence, on_token)
            streamed = streamed or was_streamed
        if cacheable and answer and "I don't have a language model configured" not in answer:
            self.cache.put(text, answer, self.signature)
        response = Response(text=answer, source="llm")
        if streamed:
            response.data["streamed"] = True
        return response

    def _answer(self, text: str, history: list | None,
                on_sentence: Callable[[str], None] | None,
                on_token: Callable[[str], None] | None = None) -> tuple[str, bool]:
        context = self._context_blob(text)
        streamer = getattr(self.llm, "stream_answer", None)
        if streamer is None or (on_sentence is None and on_token is None):
            return self.llm.answer(text, context, history), False
        try:
            collected: list[str] = []
            buffer = ""
            announced = False
            for delta in streamer(text, context, history):
                if on_token is not None:
                    on_token(delta)
                buffer += delta
                while True:
                    match = _SENTENCE_END.search(buffer)
                    if not match:
                        break
                    end = match.end()
                    sentence = buffer[:end].strip()
                    buffer = buffer[end:]
                    if sentence:
                        collected.append(sentence)
                        if on_sentence is not None and not announced:
                            on_sentence(sentence)
                            announced = True
            if buffer.strip():
                collected.append(buffer.strip())
                if on_sentence is not None and not announced:
                    on_sentence(buffer.strip())
                    announced = True
            answer = " ".join(collected).strip()
            if answer:
                return answer, True
        except Exception as exc:  # noqa: BLE001 - fall back to a full answer
            from .log import get as _log

            _log().warning("streaming answer failed (%s); falling back", exc)
        return self.llm.answer(text, context, history), False

    def _route_capability(self, text: str) -> dict | None:
        if self.capabilities is None:
            return None
        available = [c for c in self.capabilities.available() if c.source == "learned"]
        if not available:
            return None
        router = getattr(self.llm, "route_capability", None)
        if router is None:
            return None
        try:
            pick = router(text, available)
        except Exception:
            return None
        if not pick or not pick.get("name"):
            return None
        return pick

    def _skill_by_name(self, name: str):
        for skill in self.registry.skills:
            if getattr(skill, "name", None) == name:
                return skill
        return None

    def _context_blob(self, query: str = "") -> str:
        parts = []
        facts = self.memory.as_context() if self.memory else ""
        if facts:
            parts.append("Known facts about the user:\n" + facts)
        if self.capabilities is not None:
            capabilities = self.capabilities.context()
            if capabilities:
                parts.append(capabilities)
        parts.append(self._interns_status())
        if query:
            try:
                hits = self.rag.query(query, k=4)
            except Exception:  # noqa: BLE001 - retrieval must never block a turn
                hits = []
            if hits:
                retrieved = "\n\n".join(
                    f"[{hit['source'].rsplit('/', 1)[-1]}] {hit['text']}" for hit in hits
                )
                parts.append("Relevant notes and documents (retrieved for this question):\n" + retrieved)
        return "\n\n".join(parts)

    def _interns_status(self) -> str:
        if self._agent_ready():
            return "Interns status: on shift and ready - hand them anything on the computer."
        if self.cfg.agent.enabled and self.agent is not None:
            return (
                "Interns status: none on shift right now (no agent window is open). For computer jobs, say "
                "cheerfully that you'll put them on it as soon as an opencode or Antigravity window is open."
            )
        return "Interns status: disabled in the config."

    def _has_rag_hits(self, text: str) -> bool:
        try:
            return bool(self.rag.query(text, k=1))
        except Exception:  # noqa: BLE001 - retrieval must never block a turn
            return False

    def _agent_ready(self) -> bool:
        return (
            self.cfg.agent.enabled
            and self.agent is not None
            and self.agent.available()
        )

    def _needs_agent(self, text: str) -> bool:
        # Heuristic only: the LLM check is unreliable with reasoning models and
        # adds latency on every turn.
        return _looks_personal(text)

    def _run_skill(self, skill: Any, args: dict[str, Any], dry_run: bool,
                   on_progress: Callable[[str], None] | None = None) -> Response:
        result: SkillResult = skill.run(args, self._context(dry_run))
        if result.data.get("defer"):
            # The skill couldn't resolve it (e.g. an unfamiliar GUI task). Fall
            # back to the Interns, which have desktop/browser computer-use tools.
            text = args.get("raw") or result.text
            if self._agent_ready():
                return self._run_agent(text, on_progress=on_progress)
            return Response(
                text="Ooh, that one's a job for my Interns - but none of them are on shift! Open an "
                     "opencode or Antigravity window and I'll put them right on it.",
                source="skill",
            )
        if result.command and requires_confirmation(result.risk, self.cfg.safety, result.command):
            shown = " ".join(result.command)
            if not self._confirm(f"{result.text}\nRun: {shown}"):
                return Response(text="Cancelled.", source="skill", confirmed=False)
        return Response(
            text=result.text,
            source="skill",
            action=result.action,
            confirmed=True if result.command else None,
        )

    def _run_agent(self, text: str, on_progress: Callable[[str], None] | None = None,
                   ack: str | None = None, task: str | None = None, dry_run: bool = False) -> Response:
        """Hand a job to the Interns.

        ``ack`` is a confirmation the Talker already wrote; ``task`` is the
        precise instruction it extracted (which saves a separate planning call).
        Once the hand-off is approved, the acknowledgement is spoken *in
        parallel* with the Interns starting work, and any progress or result
        waits for it so the person always hears "on it" first.
        """
        assert self.agent is not None
        if dry_run:
            return Response(text=f"[dry-run] would run agent with task: {task or text}", source="agent")
        risk = max_risk(classify_text(text), classify_text(task or ""))
        # A visible agent is an explicit hand-off: the user is talking to an agent
        # they can see, so don't make them "learn" it first, and send their words
        # as-is rather than rewriting them. Promotion is for hidden headless runs.
        visible = isinstance(self.agent, WorkspaceAgent)
        promote_skills = self.cfg.agent.promote_skills and not visible
        # An explicit order ("order your interns…", "have my interns…") already
        # means "just do it" - don't ask permission to learn first. Risk still
        # gets confirmed below.
        explicit = bool(INTERN_HINT.search(text)) or visible
        if self.cfg.agent.ask_before_learning and not explicit:
            risky = requires_confirmation(risk, self.cfg.safety)
            warn = " (heads up - this one looks risky)" if risky else ""
            prompt = f"That's new for me. Should my Interns learn it?{warn}\n{text}"
            if not self._confirm(prompt):
                return Response(
                    text="Okey-dokey, I'll leave that one alone! Just say the word and my Interns will learn it.",
                    source="agent",
                    confirmed=False,
                )
        elif requires_confirmation(risk, self.cfg.safety):
            if not self._confirm(f"Hand this to the agent?\n{text}"):
                return Response(text="Cancelled.", source="agent", confirmed=False)

        ack_done = self._start_ack(text, on_progress, ack, visible)
        gated_progress = None
        if on_progress is not None:
            def gated_progress(message: str) -> None:
                ack_done.wait()
                on_progress(message)

        is_followup = bool(
            self.last_intern_task
            and self.last_intern_result
            and (_FOLLOWUP_PRONOUNS.search(text) or (task and _FOLLOWUP_PRONOUNS.search(task)))
        )
        followup_context = ""
        if is_followup:
            followup_context = (
                f"Context from the previous task ({self.last_intern_task}):\n"
                f"{self.last_intern_result}\n\n"
                f"Follow-up request: "
            )

        if visible:
            job = (followup_context + (task or _strip_handoff(text))) if is_followup else (task or _strip_handoff(text))
        else:
            prompt = (followup_context + text) if is_followup else text
            job = (followup_context + task) if (is_followup and task) else (task or self.llm.plan(prompt))
            if promote_skills:
                if self.capabilities is not None:
                    context = self.capabilities.context()
                    if context:
                        job += "\n\nCapabilities you already have (reuse these instead of rebuilding):\n" + context
                job = job.rstrip() + "\n\n" + RECIPE_INSTRUCTION
        spoke_progress = False
        registry = InternRegistry(self.cfg.interns_path)
        tid = registry.start(text)
        try:
            streamer = getattr(self.agent, "stream", None)
            if self.cfg.agent.progress and gated_progress is not None and streamer is not None:
                output, spoke_progress = self._stream_agent(job, gated_progress, registry, tid)
            else:
                output = self.agent.run(job)
        except (AgentUnavailable, RuntimeError) as exc:
            registry.finish(tid, "failed", str(exc))
            ack_done.wait()
            return Response(text=f"Oh, uh... my Interns couldn't even get started: {exc}", source="agent")
        clean = strip_recipe(output)
        promoted = None
        recipe = extract_recipe(output)
        if recipe and promote_skills:
            promoted = self._maybe_promote(recipe)
        elif promote_skills:
            capability = extract_capability(output)
            if capability:
                self._register_capability(
                    capability.get("name"), capability.get("description") or capability.get("name")
                )
            elif not _looks_aborted(clean):
                # Register the task as a learned capability - but skip runs that
                # only narrated a plan or gave up, so the capability list (and
                # the LLM's context) isn't polluted with junk names.
                self._register_capability(_slug(text), text)
        registry.finish(tid, "done", clean or "Done.")
        self.last_intern_task = text
        self.last_intern_result = (clean or "Done.")[:600]
        spoken = clean or "Done."
        reported = False
        if not spoke_progress:
            report = self._report(text, clean)
            if report:
                spoken, reported = report, True
        ack_done.wait()
        response = Response(text=spoken, source="agent", promoted=promoted, confirmed=True)
        if reported:
            response.data["raw"] = clean
        if spoke_progress:
            response.data["spoken_progress"] = True
        return response

    def _start_ack(self, text: str, on_progress: Callable[[str], None] | None,
                   ack: str | None, visible: bool) -> "_Ack":
        """Speak the hand-off confirmation without blocking the Interns.

        Uses the Talker's own line when it routed the job; otherwise asks the
        Talker for one under a state-forced directive (the job is already
        accepted, so the only thing left to write is the confirmation).
        """
        done = _Ack()
        if on_progress is None:
            return done.finish()
        if ack:
            on_progress(ack)
            return done.finish()
        fallback = "Handing that to my Interns now!" if visible else ""
        acknowledge = getattr(self.llm, "acknowledge", None)
        if not callable(acknowledge):
            if fallback:
                on_progress(fallback)
            return done.finish()

        def work() -> None:
            try:
                line = acknowledge(text, self._context_blob())
            except Exception:  # noqa: BLE001 - an ack must never sink the job
                line = ""
            line = (line or "").strip() or fallback
            # If the job outran the ack, drop it rather than speak it late.
            if line and not done.expired.is_set():
                on_progress(line)
            done.finish()

        threading.Thread(target=work, daemon=True).start()
        return done

    def _report(self, request: str, output: str) -> str:
        """Have the Talker turn long or markdown-heavy Intern output into a
        short spoken report. Short plain results are spoken as-is.
        Hard-capped to max 2 sentences / 25 words so TTS latency stays under 500ms."""
        if not output or not getattr(self.cfg.agent, "report", True):
            return ""
        reporter = getattr(self.llm, "report", None)
        if not callable(reporter):
            return ""
        from .persona import has_markdown, words

        if words(output) <= 25 and not has_markdown(output):
            return ""
        try:
            summary = (reporter(request, output) or "").strip()
        except Exception:  # noqa: BLE001 - fall back to the raw output
            return ""
        if not summary:
            return ""
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", summary) if s.strip()]
        capped = " ".join(sentences[:2]) if sentences else summary
        word_list = capped.split()
        if len(word_list) > 25:
            capped = " ".join(word_list[:25]).rstrip(".,;:-") + "."
        return capped

    def _stream_agent(self, task: str, on_progress: Callable[[str], None], registry=None, tid=None) -> tuple[str, bool]:
        collected: list[str] = []
        spoke = False
        for event in self.agent.stream(task):
            part = event.get("part", {}) if isinstance(event, dict) else {}
            if part.get("type") == "text":
                text = (part.get("text") or "").strip()
                if not text:
                    continue
                collected.append(text)
                if registry is not None and tid is not None:
                    registry.event(tid, text)
                spoken = _progress_text(text)
                if spoken:
                    on_progress(spoken)
                    spoke = True
        return " ".join(collected).strip(), spoke

    def _register_capability(self, name, description, command=None, patterns=None,
                             params=None, source="learned", status="available") -> None:
        if self.capabilities is None or not name:
            return
        from .capabilities import Capability

        self.capabilities.add(
            Capability(
                name=str(name),
                description=str(description or name),
                status=status,
                source=source,
                patterns=[str(p) for p in (patterns or [])],
                command=[str(c) for c in (command or [])],
                params=[str(p) for p in (params or [])],
            )
        )

    def _maybe_promote(self, recipe: dict) -> str | None:
        from .log import get as _log
        from .skills.promoted import is_promotable_recipe

        name = recipe.get("name")
        description = recipe.get("description") or name
        valid, reason = is_promotable_recipe(recipe)
        if not valid:
            _log().warning("skill recipe %s rejected (safety denylist: %s)", name, reason)
            return None
        if self.cfg.agent.auto_promote_skills:
            approved = True
        else:
            approved = self._confirm(
                f"Learned a reusable skill: {description}.\nCommand: {' '.join(recipe.get('command', []))}\nSave it?"
            )
        if not approved:
            _log().info("skill promotion declined: %s", name)
            return None
        path = save_recipe(self.cfg.skills_dir, recipe)
        if path is None:
            _log().warning("skill recipe rejected as invalid: %s", recipe)
            return None
        self.registry.reload_promoted(self.cfg.skills_dir)
        self._register_capability(
            name,
            description,
            command=recipe.get("command", []),
            patterns=recipe.get("patterns", []),
            params=recipe.get("params", []),
        )
        _log().info("promoted skill %s -> %s", name, path)
        return name


class _Ack:
    """Tracks the spoken hand-off confirmation running alongside the Interns."""

    def __init__(self) -> None:
        self.ready = threading.Event()
        self.expired = threading.Event()

    def finish(self) -> "_Ack":
        self.ready.set()
        return self

    def wait(self, timeout: float = _ACK_WAIT) -> None:
        if not self.ready.wait(timeout=timeout):
            self.expired.set()


def _progress_text(text: str) -> str:
    for marker in ("SKILL_RECIPE", "CAPABILITY"):
        index = text.find(marker)
        if index != -1:
            text = text[:index]
    return text.strip()


def _slug(text: str, words: int = 5) -> str:
    import re

    tokens = re.findall(r"[a-z0-9]+", (text or "").lower())
    return "-".join(tokens[:words]) or "learned-task"


def build_confirmer() -> Confirmer:
    import sys

    from .safety import stdin_confirmer

    if sys.stdin.isatty():
        return stdin_confirmer
    return lambda _prompt: False


def build_router(cfg: Config, registry: SkillRegistry | None = None, session: str | None = None) -> Router:
    from .capabilities import CapabilityStore
    from .conversation import SessionStore
    from .llm import build_llm
    from .skills import build_registry

    registry = registry or build_registry(cfg)
    memory = Memory(cfg.facts_path)
    timers = TimerService(notifier=notify, path=cfg.config_dir / "timers.json")
    llm = build_llm(cfg)
    agent = None
    if cfg.agent.enabled:
        agent = WorkspaceAgent(cfg, llm=llm) if cfg.agent.visible_only else Agent(cfg)
    store = SessionStore(cfg.sessions_dir, max_turns=cfg.context.max_turns, max_chars=cfg.context.max_chars)
    capabilities = CapabilityStore(cfg.capabilities_path)
    capabilities.sync_from_skills(registry.skills)
    return Router(
        cfg=cfg,
        registry=registry,
        llm=llm,
        memory=memory,
        confirmer=build_confirmer(),
        agent=agent,
        timers=timers,
        conversation=store.get(session),
        capabilities=capabilities,
    )
