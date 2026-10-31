#!/usr/bin/env python3
"""Start the model beat factory and print the SSE stream."""
from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:4174")
    parser.add_argument("--out", default="/tmp/opencode/beat-factory-events.jsonl")
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()

    request = urllib.request.Request(
        args.base_url.rstrip("/") + "/api/visual/beats/start",
        data=b"{}", headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        job = json.load(response)
    print("job", job, flush=True)

    started = time.monotonic()
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w") as handle, urllib.request.urlopen(
        args.base_url.rstrip("/") + "/api/visual/beats/stream/" + job["id"], timeout=args.timeout
    ) as stream:
        for raw in stream:
            line = raw.decode().strip()
            if not line.startswith("data: "):
                continue
            event = json.loads(line[6:])
            handle.write(json.dumps(event) + "\n")
            handle.flush()
            kind = event.get("type")
            elapsed = time.monotonic() - started
            if kind == "start":
                print(f"start {event.get('model')}", flush=True)
            elif kind == "beat_start":
                print(f"[{elapsed:6.1f}s] start {event.get('teaching')}", flush=True)
            elif kind == "repair":
                print(f"[{elapsed:6.1f}s] repair {event.get('index')} {event.get('findings')}", flush=True)
            elif kind == "compiled":
                print(f"[{elapsed:6.1f}s] PASS {event.get('teaching')} {event.get('seconds')}s tries={event.get('attempts')}", flush=True)
            elif kind == "beat_error":
                print(f"[{elapsed:6.1f}s] FAIL {event.get('title')} {event.get('error')}", flush=True)
            elif kind == "done":
                print(f"[{elapsed:6.1f}s] done total={event.get('total')}s", flush=True)
                break
            elif kind == "error":
                print("ERROR", event, flush=True)
    print(f"events: {output}")


if __name__ == "__main__":
    main()
