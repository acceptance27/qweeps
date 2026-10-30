"""Visual Explainer Skill for QWEEPS.

Creates source-grounded live visual lessons and interactive explanations.
Known authored examples remain available; new topics use the browser lesson pipeline.
"""
from __future__ import annotations

import re
from typing import Any

from ..types import SkillResult
from ..visual.runner import VisualRunner
from .base import SkillContext

_ACTIVE_RUNNER: VisualRunner | None = None


def get_active_runner(tts: Any = None) -> VisualRunner:
    global _ACTIVE_RUNNER
    if _ACTIVE_RUNNER is None:
        _ACTIVE_RUNNER = VisualRunner(tts=tts)
    elif tts is not None:
        _ACTIVE_RUNNER.tts = tts
    return _ACTIVE_RUNNER


class VisualExplainerSkill:
    name = "visual_explainer"
    description = "Teach a topic or attached PDF through an interactive live visual lesson"
    kind = "action"
    order = 15

    # Match queries asking for visual explanations or specifically A* pathfinding
    _EXPLAIN_RE = re.compile(
        r"\b(?:explain|show\s+me|visualize|draw|illustrate|how\s+does)\b.*?"
        r"\b(a\*|a\s+star|astar|pathfinding|heuristic|dijkstra)\b",
        re.IGNORECASE,
    )

    _GENERIC_VISUAL_RE = re.compile(
        r"\b(?:visualize|show\s+(?:me\s+)?a\s+visual\s+of|explain\s+visually|"
        r"(?:generate|create|make|build|draw|render|play|code)\s+(?:an?\s+)?(?:interactive\s+)?(?:(?:manim|hyperframes?)\s+)?(?:animation|scene|visual|explainer|explanation|lesson|video)(?:\s*(?:about|of|for|on))?)(?:\s+(.+))?$",
        re.IGNORECASE,
    )

    _LEARNING_RE = re.compile(
        r"^(?:please\s+)?(?:explain\s+(?!concept\b)(.+)|teach\s+me\s+(.+)|"
        r"help\s+me\s+understand\s+(.+)|how\s+does\s+(.+?)\s+work[?.]*|how\s+do\s+i\s+use\s+(.+))[?.]*$",
        re.IGNORECASE,
    )

    _CONTROL_RE = re.compile(
        r"\b(pause|resume|continue|next|previous|prev|rewind|branch|close)\s+(?:the\s+)?(?:visual|animation|scene|explainer|beat|out)\b|"
        r"\bbranch\s+out\b",
        re.IGNORECASE,
    )

    _CONCEPT_RE = re.compile(
        r"\b(?:what(?:'s|s)?|explain|tell\s+me\s+about|why|how|role|purpose|mean|for)\b.*?"
        r"\b(?:node\s+[absg]|start\s+s|goal\s+g|admissib\w*|manhattan|heuristic|dijkstra|frontier)\b",
        re.IGNORECASE,
    )

    def match(self, text: str) -> dict[str, Any] | None:
        text = text.strip()

        # Check playback control commands first
        ctrl_match = self._CONTROL_RE.search(text)
        if ctrl_match:
            cmd = ctrl_match.group(1) or "branch"
            return {"action": "control", "command": cmd.lower()}

        # Check A* pathfinding / heuristic explainer launch query
        astar_match = self._EXPLAIN_RE.search(text)
        if astar_match:
            return {"action": "launch", "topic": "astar"}

        # Check specific concept/role question (e.g. node roles, frontier, admissibility)
        if self._CONCEPT_RE.search(text):
            return {"action": "explain_concept", "query": text}

        # Generic visual request
        gen_match = self._GENERIC_VISUAL_RE.search(text)
        if gen_match:
            raw_topic = (gen_match.group(1) or "").strip().rstrip(".?!")
            topic = re.sub(r"^(?:the|a|an)\s+", "", raw_topic, flags=re.IGNORECASE).strip() if raw_topic else "alu"
            if topic.casefold() == "alu":
                topic = "alu"
            return {"action": "launch", "topic": topic or "alu"}

        learning = self._LEARNING_RE.match(text)
        if learning:
            return {"action": "launch", "topic": text}

        # In the daemon, free-form follow-ups belong to the open visual session.
        if _ACTIVE_RUNNER is not None and _ACTIVE_RUNNER.is_active and re.match(r"^(?:why|what|how|could|can|would|does|is)\b", text, re.I):
            return {"action": "explain_concept", "query": text}

        return None

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        action = args.get("action", "launch")
        from ..tts import build_tts
        tts = getattr(ctx, "tts", None)
        if tts is None and hasattr(ctx, "cfg"):
            tts = build_tts(ctx.cfg)
        runner = get_active_runner(tts=tts)

        if action == "control":
            cmd = args.get("command", "")
            if cmd == "close":
                runner.close()
                return SkillResult(text="Closed visual explainer window.")
            methods = {"pause": (runner.toggle_pause, "Visual explanation paused."),
                       "resume": (runner.resume, "Resuming visual explanation."),
                       "continue": (runner.resume, "Resuming visual explanation."),
                       "next": (runner.step_forward, "Stepping forward to the next beat."),
                       "prev": (runner.step_backward, "Rewinding to the previous beat."),
                       "previous": (runner.step_backward, "Rewinding to the previous beat."),
                       "rewind": (runner.step_backward, "Rewinding to the previous beat."),
                       "branch": (runner.branch, "Opening a visual branch for this selection.")}
            if cmd in methods:
                method, message = methods[cmd]
                return SkillResult(text=message if method() else "No visual window is connected. Open a visual lesson first.")

        if action == "explain_concept":
            try:
                text = runner.ask(args.get("query", ""))
            except Exception as exc:
                text = f"I couldn't connect this question to the visual model: {exc}"
            return SkillResult(text=text, action="visual_explainer")

        topic = args.get("topic", "").lower()
        if re.search(r"\ba\*|\ba\s+star\b|\bastar\b|\bpathfinding\b|\bheuristic\b", topic):
            try:
                launched = runner.launch_studio("astar_heuristic")
            except Exception as exc:
                return SkillResult(text=f"Could not open the visual studio: {exc}")
            return SkillResult(
                text="Opening visual explainer for A* pathfinding. Lean back and watch the grid draw out—you can click or drag any node on the frontier to explore."
            )

        # For general topics, launch studio with the requested scene
        try:
            launched = runner.launch_studio(args.get("topic", topic))
        except Exception as exc:
            return SkillResult(text=f"Could not open the visual studio: {exc}")
        return SkillResult(text=f"Opening visual explainer for {topic}.")
