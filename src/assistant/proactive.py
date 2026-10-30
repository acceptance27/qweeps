from __future__ import annotations

EVENT_PROMPTS = {
    "post-boot": (
        "You have just started up alongside the desktop. Greet your boss warmly in one or two "
        "short sentences, and mention one thing you could help with."
    ),
    "hourly": (
        "It is now {time}. Make one short, in-character remark about the time of day. "
        "One sentence only."
    ),
    "idle": (
        "Your boss has been quiet for a while. Say one short line to gently check in. "
        "One sentence only."
    ),
    "battery-low": (
        "The battery is at {percent} percent. Warn your boss in one short, in-character sentence."
    ),
    "theme-set": (
        "The desktop theme just changed to '{theme}'. Make one short, pleased remark about it."
    ),
    "agent-done": (
        "Your Interns just finished a job: {summary}. Report it in one short, in-character sentence."
    ),
}

_MOODS = [
    (("laughing", "giggle", "giggling", "excited", "happy", "delighted", "chuckle"), "\U0001F604"),
    (("sad", "embarrassed", "soft", "apologetic", "sighing", "sigh"), "\U0001F614"),
    (("whispering", "whisper", "calm", "breathy"), "\U0001F92B"),
    (("emphasis", "surprised", "gasping"), "\U0001F62E"),
]


def event_prompt(event: str, **kwargs) -> str:
    template = EVENT_PROMPTS.get(event)
    if template is None:
        return f"[event: {event}] Say one short line, in character."
    try:
        return template.format(**kwargs)
    except (KeyError, IndexError):
        return template


def mood_for(text: str) -> str:
    lowered = (text or "").lower()
    for keywords, face in _MOODS:
        if any(f"[{word}" in lowered or word in lowered for word in keywords):
            return face
    return "\U0001F642"
