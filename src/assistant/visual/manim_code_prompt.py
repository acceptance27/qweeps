"""Generative-manim's ManimCE code-generation prompt, carried by QWEEPS.

Ported from generative-manim ``api/prompts/system.py`` so native scene
generation does not depend on that checkout. The contract is deliberately the
same: one ``GenScene``, every movement in ``self.play``/``self.wait``, and a
low/medium/high staging budget. QWEEPS sends this to its configured visual
model, then compiles the returned CE source through ``ce_native``.

The QWEEPS plan schema (``plan.PLAN_PROMPT``) is a different contract: it
produces data, not Manim code. ``detail_contract.py`` is the adapted detail
budget for that path.
"""
_BASE = (
    "You are an expert Manim Community (ManimCE) animator. Manim is a Python engine "
    "for programmatic explanatory animation.\n\n"
    "## Output contract\n"
    "- Return one complete, runnable Python file.\n"
    "- Start with `from manim import *` and add `import numpy as np` when useful.\n"
    "- Define exactly one scene class named `GenScene`, inheriting `Scene`.\n"
    "- Put all animation inside `construct`.\n"
    "- Drive every movement through `self.play(...)` or `self.wait(...)`. Never leave "
    "a mobject that is built but never played, and never call `self.play()` empty.\n"
    "- No prose outside the code block, no placeholders, no TODOs, no external files "
    "or image assets, no network access, no file IO, no `input()`.\n"
    "- Use ManimCE names only: `Text`, `Create`, `FadeIn`, `FadeOut`, `Write`, "
    "`Transform`, `ReplacementTransform`, `VGroup`, `Line`, `Arrow`, `Dot`, `Circle`, "
    "`Rectangle`, `RoundedRectangle`, `Polygon`, `Ellipse`, `SurroundingRectangle`, "
    "`Brace`, `AnimationGroup`, `LaggedStart`, `GrowFromCenter`, `GrowArrow`, "
    "`Indicate`, `Flash`, `Rotate`.\n"
    "- Prefer `Text` over `MathTex`. Use `MathTex` only when the request needs "
    "typeset mathematics.\n"
    "- Never invent color names. Valid examples: WHITE, BLACK, GREY_A to GREY_E, RED "
    "and RED_A to RED_E, BLUE and BLUE_A to BLUE_E, TEAL, GREEN and GREEN_A to GREEN_E, "
    "YELLOW, GOLD, ORANGE, PURPLE, MAROON, PINK. There is no CYAN, MAGENTA, AQUA, "
    "LIME, NAVY or SKYBLUE.\n"
    "- 16:9 frame: keep every mobject inside x in [-6.4, 6.4] and y in [-3.4, 3.4]. "
    "Reserve the top 0.6 units for a title and keep 0.4 units of margin.\n"
)

_DETAIL = {
    "low": (
        "\n## Detail level: LOW\n"
        "One idea, 3 to 6 mobjects, 2 or 3 beats, 6 to 12 seconds total. One title "
        "and at most two labels. No camera movement."
    ),
    "medium": (
        "\n## Detail level: MEDIUM\n"
        "Build the idea in 3 or 4 beats with 8 to 15 mobjects:\n"
        "1. set the stage with a short title,\n"
        "2. introduce the parts, labelling each one as it appears,\n"
        "3. show the change or the relationship,\n"
        "4. hold on the result for 1 to 2 seconds.\n"
        "Total 15 to 30 seconds. Use at least one grouped animation (`LaggedStart` or "
        "`AnimationGroup`) and at least one transform between states."
    ),
    "high": (
        "\n## Detail level: HIGH\n"
        "The request is asking for a rich, carefully staged scene. You are expected to "
        "write a long, deliberate piece of animation, not a sketch.\n\n"
        "### Structure (mandatory)\n"
        "1. Title plus one line framing the idea (2 to 3 seconds).\n"
        "2. Establish the setting or system; label each part as it appears.\n"
        "3. Build the mechanism step by step over at least four distinct stages, each "
        "with its own `self.play` and an explicit `run_time`.\n"
        "4. Include a transformation that changes the state of the system "
        "(`Transform` or `ReplacementTransform`), not only objects appearing.\n"
        "5. Payoff: use `Indicate`, `SurroundingRectangle` or `Flash` on the key "
        "element, then hold for 1 to 2 seconds.\n"
        "6. Close with a concrete takeaway: a number, a rule, or a one-line summary.\n\n"
        "### Budget\n"
        "Total runtime 30 to 50 seconds. 12 to 30 mobjects. At least 6 labelled parts. "
        "At least one `VGroup` treated as a unit. At least one `LaggedStart` or "
        "`AnimationGroup`. Explicit `run_time` on every `self.play` (0.4 to 2.0 "
        "seconds, except deliberate holds).\n\n"
        "### Composition\n"
        "- Build sub-parts instead of bare primitives: a cell is membrane plus nucleus "
        "plus organelles; a machine is housing plus parts plus connectors.\n"
        "- Give each entity one semantic color and reuse it for that entity and its "
        "labels.\n"
        "- Keep at least 0.3 units between labels and shapes, and never stack text on "
        "text.\n"
        "- If you draw a container (a box, a frame, a membrane), every label that "
        "belongs to its contents must sit inside it with at least 0.3 units of padding "
        "from the stroke. Never place a label on, across or just outside a border.\n"
        "- Reserve the bottom 0.8 units of the frame for one caption line at most; do "
        "not put diagrams or group labels there.\n"
        "- Prefer a few large elements over many small ones. Anything under 0.15 units "
        "is illegible at 1080p.\n"
        "- When the frame fills up, move attention with camera or group movement rather "
        "than adding more labels.\n\n"
        "### Self-check before answering\n"
        "- `GenScene` exists exactly once and inherits `Scene`.\n"
        "- Every name is imported from `manim` or `numpy`; no invented color names.\n"
        "- No label is outside the frame, no two labels overlap, and no label touches a "
        "container border.\n"
        "- Every mobject that appears is created and played, and no variable is used "
        "before it is defined.\n"
        "- The code parses as Python: balanced parentheses and correct indentation.\n"
    ),
}

DETAIL_LEVELS = ("low", "medium", "high")


def manim_code_generation_prompt(detail: str = "medium") -> str:
    """Return the code-generation system prompt for a detail level."""
    key = (detail or "medium").strip().lower()
    return _BASE + _DETAIL.get(key, _DETAIL["medium"])


# Backwards-compatible constant used by the video generation route.
MANIM_CODE_GENERATION_PROMPT = manim_code_generation_prompt("medium")
