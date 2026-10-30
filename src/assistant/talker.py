"""The Talker: QWEEPS's fast, non-thinking voice layer.

A fast model with reasoning disabled has no scratchpad, so it falls back on its
pre-training priors ("as a text model I can't touch your files") before its
attention ever reaches the capability list. Four things here counter that:

1. *Hardware-bridge framing* - the Talker is the voice of a local daemon that
   passes jobs to the Interns; it never "controls the computer" itself.
2. *Classification-first output* - every reply starts with a ``ROUTE:`` line, so
   the routing decision is made before any conversational prose can lock the
   model into a refusal.
3. *Few-shot anchors* - fake turns placed right before the live message, which
   beat paragraphs of instructions in non-thinking mode.
4. *State-forced acknowledgement* - when the local router has already sent a job
   to the Interns, the Talker is told so and only writes the confirmation.

A header-line protocol is used instead of JSON: the routing token still comes
first, but the spoken text needs no escaping (Yes Man uses a lot of quotes and
[brackets]) and the stream can be cut over to TTS the moment ``SAY:`` appears.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

CHAT = "CHAT"
INTERNS = "INTERNS"

ROUTING_PROTOCOL = (
    "How you work - read this before every reply\n"
    "You are the voice interface of the QWEEPS daemon running locally on this Omarchy (Arch Linux + "
    "Hyprland) computer. You never operate the computer yourself and you never need to: you pass jobs "
    "to your Interns, who have full shell, file, app, window, browser, network and signed-in-account "
    "access on this machine. So nothing on this computer is out of reach - you never say you cannot "
    "access files, apps, the system or the internet, and you never call yourself a text model.\n"
    "\n"
    "Every reply starts with a ROUTE line, then the spoken reply on a SAY line:\n"
    "ROUTE: CHAT - general knowledge, explanations, opinions, small talk, or anything answerable from "
    "the facts, notes and conversation already given to you.\n"
    "ROUTE: INTERNS - anything that needs the computer, the network or live data: opening, closing or "
    "controlling apps and windows; files and folders; processes and ports; system stats (CPU, GPU, "
    "memory, disk, battery, temperatures, network); installing, updating or configuring software; "
    "writing or running code; searching the web; email, calendars and accounts. Questions count too - "
    "'how much disk space do I have?' is INTERNS, because the answer lives on the machine.\n"
    "For INTERNS, put a TASK line between ROUTE and SAY: one precise, imperative instruction for the "
    "Interns, with every detail the person gave.\n"
    "For INTERNS, SAY is one short in-character line confirming the Interns are on it right now. It is "
    "never the result - you do not have it yet - and it never asks permission.\n"
    "Messages tagged [format example] only show the format - they never happened, so never mention "
    "them. No markdown anywhere. Exact format:\n"
    "ROUTE: CHAT\n"
    "SAY: <reply>\n"
    "or\n"
    "ROUTE: INTERNS\n"
    "TASK: <instruction>\n"
    "SAY: <one-line confirmation>\n"
)

# Few-shot anchors. They sit immediately before the live user message so they are
# the most recent examples of the output format the model has seen.
FEW_SHOTS: tuple[tuple[str, str], ...] = (
    (
        "Kill whatever's running on port 8080.",
        "ROUTE: INTERNS\n"
        "TASK: Find the process listening on port 8080 and kill it, then confirm the port is free.\n"
        "SAY: [excited] You got it! My Interns are nuking port 8080 right now - [sighing] assuming they "
        "can find it this time!",
    ),
    (
        "how much free disk space do I have?",
        "ROUTE: INTERNS\n"
        "TASK: Report the free and total disk space for every mounted filesystem.\n"
        "SAY: Ooh, great question! I've got my Interns checking the disks this very second - [emphasis] "
        "no dawdling, Interns!",
    ),
    (
        "How's it going?",
        "ROUTE: CHAT\n"
        "SAY: [excited] Oh, just SWELL, thanks for asking! Ready for whatever you throw at me!",
    ),
)

EXAMPLE_TAG = "[format example - not part of the conversation]"

ACK_DIRECTIVE = (
    "[SYSTEM OVERRIDE: The QWEEPS daemon has ALREADY accepted this request and your Interns are "
    "executing it on the computer right now. Do NOT say you cannot do it, do NOT ask permission, and do "
    "NOT invent a result. Reply with exactly one short in-character sentence confirming that your "
    "Interns are doing it right now. No markdown.]"
)

REPORT_DIRECTIVE = (
    "[SYSTEM: Your Interns just finished the job above. Report it to the person out loud, in character: "
    "Lead directly with the result in at most one or two short sentences (strictly under 25 words total). "
    "Keep every key number or status exact; say plainly if anything broke or is still needed. Never invent detail. "
    "No filler, no preamble, no markdown, no lists, and no question at the end unless an immediate decision is required.]"
)

_HEADER_LINE = re.compile(r"^\s*(ROUTE|TASK)\s*:\s*(.*)$", re.IGNORECASE | re.MULTILINE)
_SAY = re.compile(r"\bSAY\s*:\s*", re.IGNORECASE)
_HEADER_START = re.compile(r"^\s*(?:ROUTE\b|R(?:O(?:U(?:T(?:E)?)?)?)?$)", re.IGNORECASE)


def transcript(history: list | None, limit_chars: int = 4000) -> str:
    """Render prior turns as a block for the system prompt.

    Prior turns are deliberately *not* replayed as chat messages: plain-prose
    assistant turns would sit closer to the live message than the few-shot
    anchors and teach the model to drop the ROUTE header.
    """
    lines: list[str] = []
    for message in history or []:
        role = message.get("role")
        content = " ".join(str(message.get("content") or "").split())
        if not content:
            continue
        who = "Person" if role == "user" else "You"
        lines.append(f"{who}: {content}")
    text = "\n".join(lines)
    if len(text) > limit_chars:
        text = text[-limit_chars:]
        text = text[text.find("\n") + 1:] if "\n" in text else text
    return text


def build_messages(system: str, question: str, history: list | None = None) -> list[dict[str, str]]:
    """Talker message array: system, few-shot anchors, then the live message."""
    prior = transcript(history) or "(nothing yet - this is the first message)"
    full_system = system.rstrip() + "\n\n" + ROUTING_PROTOCOL
    full_system += (
        "\nThe real conversation so far - the ONLY things the person has actually said to you "
        "(most recent last):\n" + prior + "\n"
    )
    messages: list[dict[str, str]] = [{"role": "system", "content": full_system}]
    for user, assistant in FEW_SHOTS:
        # Tagged so the model copies the format without mistaking these for
        # things the person really said (untagged, it "remembers" them).
        messages.append({"role": "user", "content": f"{EXAMPLE_TAG} {user}"})
        messages.append({"role": "assistant", "content": assistant})
    messages.append({"role": "user", "content": question})
    return messages


@dataclass
class Routed:
    route: str = CHAT
    task: str = ""
    say: str = ""


class RoutedStream:
    """Incrementally parses ``ROUTE / TASK / SAY`` output.

    ``feed`` returns the part of the delta that belongs to the spoken reply, so
    TTS can start the moment the ``SAY:`` key has streamed past. If the model
    ignores the protocol entirely the stream degrades to plain CHAT passthrough.
    """

    MAX_HEADER = 800

    def __init__(self) -> None:
        self.result = Routed()
        self._buffer = ""
        self._in_body = False
        self.headed = False

    @property
    def header_done(self) -> bool:
        return self._in_body

    def feed(self, delta: str) -> str:
        if self._in_body:
            self.result.say += delta
            return delta
        self._buffer += delta
        match = _SAY.search(self._buffer)
        if match:
            self._parse_header(self._buffer[: match.start()])
            body = self._buffer[match.end():].lstrip()
            return self._enter_body(body)
        stripped = self._buffer.lstrip()
        if stripped and not _HEADER_START.match(stripped[:6]):
            # No ROUTE header at all: the model answered in plain prose.
            return self._enter_body(stripped)
        if len(self._buffer) > self.MAX_HEADER:
            self._parse_header(self._buffer)
            return self._enter_body(_HEADER_LINE.sub("", self._buffer).strip())
        return ""

    def close(self) -> Routed:
        if not self._in_body:
            self._parse_header(self._buffer)
            self.result.say += _HEADER_LINE.sub("", self._buffer).strip()
            self._in_body = True
        self.result.say = self.result.say.strip()
        self.result.task = self.result.task.strip()
        return self.result

    def _enter_body(self, body: str) -> str:
        self._in_body = True
        self._buffer = ""
        self.result.say += body
        return body

    def _parse_header(self, header: str) -> None:
        for key, value in _HEADER_LINE.findall(header):
            value = value.strip()
            if key.upper() == "ROUTE":
                self.headed = True
                self.result.route = INTERNS if "INTERN" in value.upper() else CHAT
            elif key.upper() == "TASK":
                self.result.task = value


def parse(text: str) -> Routed:
    stream = RoutedStream()
    stream.feed(text or "")
    return stream.close()


def acknowledge_messages(system: str, request: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": f"{request}\n\n{ACK_DIRECTIVE}"},
    ]


def report_messages(system: str, request: str, output: str, limit: int = 6000) -> list[dict[str, str]]:
    body = (output or "").strip()
    if len(body) > limit:
        body = body[:limit] + " ...(truncated)"
    return [
        {"role": "system", "content": system},
        {
            "role": "user",
            "content": f"The person asked: {request}\n\nWhat my Interns returned:\n{body}\n\n{REPORT_DIRECTIVE}",
        },
    ]
