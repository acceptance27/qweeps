from __future__ import annotations

import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import assistant.tts as ttsmod
from assistant.config import load_config
from assistant.http import open_stream
from assistant.llm import build_llm
from assistant.orchestrator import Orchestrator
from assistant.persona import Persona
from assistant.safety import looks_like_action


def _ms(seconds: float) -> str:
    return f"{seconds * 1000:8.0f} ms"


def main() -> None:
    cfg = load_config()
    llm = build_llm(cfg)
    persona = Persona(cfg)
    tts = ttsmod.build_tts(cfg)
    ttsmod._stream_player = lambda: ["mpv", "--no-video", "--really-quiet", "--ao=null", "-"]

    system = persona.system_prompt()
    print("=" * 70)
    print(f"classify mode    : {cfg.llm.classify_mode}   (model {cfg.llm.model})")
    print(f"persona prompt   : {len(system)} chars (~{len(system)//4} tokens)")
    print(f"tts model/stream : {cfg.tts.model}  stream={cfg.tts.stream}")
    print("=" * 70)

    question = "In three sentences, explain how a transistor works."
    runs = 2
    classify, answer, ttfb, tts_total, first_audio, end_to_end = [], [], [], [], [], []

    for i in range(runs):
        t0 = time.perf_counter()
        looks_like_action(question)
        classify.append(time.perf_counter() - t0)

        print(f"run {i + 1}: answer(), tts stream, end-to-end ...", flush=True)
        t0 = time.perf_counter()
        reply = llm.answer(question, "", [])
        answer.append(time.perf_counter() - t0)

        spoken = persona.spoken(reply)
        payload = tts._payload(spoken)
        t0 = time.perf_counter()
        response = open_stream(tts.url, payload, headers=tts._headers(), timeout=120)
        first = None
        while True:
            chunk = response.read(4096)
            if not chunk:
                break
            if first is None:
                first = time.perf_counter() - t0
        response.close()
        ttfb.append(first)
        tts_total.append(time.perf_counter() - t0)

        orch = Orchestrator(cfg)
        started = {}
        original_speak = orch.tts.speak

        def wrapped(text, _orig=original_speak, _started=started):
            if "first" not in _started:
                _started["first"] = time.perf_counter()
            return _orig(text)

        orch.tts.speak = wrapped
        t0 = time.perf_counter()
        orch.handle_text(question, speak=True)
        end_to_end.append(time.perf_counter() - t0)
        first_audio.append((started.get("first", t0) - t0))

    def row(label, values):
        mean = statistics.mean(values)
        spread = statistics.pstdev(values)
        print(f"{label:<26}{_ms(mean)}   (+/- {_ms(spread).strip()})")

    print(f"\nmean over {runs} runs:")
    row("local classify()", classify)
    row("llm.answer() [ref]", answer)
    row("tts time-to-1st byte", ttfb)
    row("tts total stream", tts_total)
    print("-" * 70)
    row("time-to-1st AUDIO (live)", first_audio)
    row("end-to-end (muted)", end_to_end)
    print("=" * 70)


if __name__ == "__main__":
    main()
