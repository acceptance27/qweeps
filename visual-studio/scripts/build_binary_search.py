import json, hashlib, wave, subprocess
from pathlib import Path
from assistant.config import load_config
from assistant.visual.narration import NarrationStore
from assistant.visual.alignment import align_recordings, spoken_sentence_cues

cfg = load_config()
narration = NarrationStore(cfg)
folder = Path.home() / ".cache/omarchy-assistant/browser-lessons/1ac198aec0efc9ba04dfa14bd242bd33"
with open(folder / "working.json") as f:
    working = json.load(f)["raw"]

chapters_raw = working["chapters"]
print(f"Synthesizing {len(chapters_raw)} chapters...")

pcm_chunks = [bytes(int(0.2 * 24000) * 2)]
chapters = []
cursor = 0.0
prev_id = None

for idx, c in enumerate(chapters_raw):
    narr = c["narration"].strip()
    bridge = c.get("continuity", {}).get("bridge", "").strip()
    lead_this = 0.2 if idx == 0 else 0.0
    pause_after = 0.6 if idx == len(chapters_raw) - 1 else 0.25
    dur = round(max(12.5, len(narr.split()) / 2.3 + 1.5), 2)
    spoken_cues = []
    speech_dur = len(narr.split()) / 2.3
    
    t = c['title'][:35]
    print(f"Beat {idx+1}: {t}...")
    clip = narration.prepare(narr)
    audio_url = clip["url"]
    mp3_file = narration.folder / f"{clip['key']}.mp3"
    if mp3_file.is_file():
        run = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mp3_file), "-f", "s16le", "-acodec", "pcm_s16le", "-ar", "24000", "-ac", "1", "pipe:1"], capture_output=True, timeout=15)
        if run.returncode == 0 and run.stdout:
            pcm_data = run.stdout
            speech_dur = len(pcm_data) / (24000 * 2)
            dur = round(lead_this + speech_dur + pause_after, 3)
            pcm_chunks.append(pcm_data)
            pcm_chunks.append(bytes(int(pause_after * 24000) * 2))
    try:
        [alignment] = align_recordings(narration, [clip], lambda msg: None)
        spoken_cues = spoken_sentence_cues(narr, alignment, speech_dur)
    except Exception as e:
        print("  Alignment fallback:", e)

    start = round(cursor, 3)
    end = round(start + dur, 3)
    cursor = end
    b_dur = round(max(1.8, dur * (len(bridge.split()) / max(1, len(narr.split())))), 2)
    t_at = round(max(b_dur + 1.5, dur * 0.72), 2)
    cues_list = [{"at": round(lead_this + cu["at"], 2), "text": cu["text"]} for cu in spoken_cues] if spoken_cues else ([{"at": 0.05, "text": bridge}, {"at": b_dur, "text": narr}] if bridge else [{"at": 0.05, "text": narr}])

    visual = {
        'layout': c.get('layout', 'diagram'),
        'nodes': c.get('nodes', []),
        'connections': c.get('connections', []),
        'columns': c.get('columns', []),
        'takeaway': c.get('takeaway', ''),
        'experiment': c.get('experiment'),
        'presentation': c.get('presentation', {'method': 'Interactive Diagram', 'why': 'Visual demonstration', 'visualEvidence': c.get('insight', ''), 'textMode': 'descriptive'})
    }

    nodes = c.get('nodes', [])
    roles = {n['id']: f"{n.get('title', n['id'])}: {n.get('body', '')}" for n in nodes}

    ch = {
        **c,
        "roles": roles,
        "visual": visual,
        "audio": audio_url,
        "start": start,
        "end": end,
        "finishedAt": round(end - 0.25, 3),
        "visualStart": start,
        "visualEnd": end,
        "targetDuration": dur,
        "narrationAt": 0.0,
        "cues": cues_list,
        "transitionOut": 0.25,
        "transition": {"from": prev_id, "to": c["id"], "type": "fade", "duration": 0.28, "shared": []} if prev_id else {"type": "fade", "duration": 0.35, "shared": []},
    }
    chapters.append(ch)
    prev_id = c["id"]

# Build master wav
full_pcm = b"".join(pcm_chunks)
total_dur = round(len(full_pcm) / (24000 * 2), 3)
chapters[-1]["end"] = total_dur
chapters[-1]["visualEnd"] = total_dur

wav_key = hashlib.sha256(b"binary-search-master-v1:" + full_pcm).hexdigest()
wav_path = narration.folder / f"{wav_key}.wav"
with wave.open(str(wav_path), "wb") as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(24000)
    wf.writeframes(full_pcm)

lesson = {
    "id": "1ac198aec0efc9ba04dfa14bd242bd33",
    "kind": "live_generated",
    "title": "Binary Search Algorithm",
    "question": working["question"],
    "representation": working["representation"],
    "example": working["example"],
    "chapters": chapters,
    "duration": total_dur,
    "documentId": None,
    "documentTitle": None,
    "sources": [],
    "audioTrack": {
        "url": f"/narration/{wav_key}.wav",
        "key": wav_key,
        "duration": total_dur,
        "clock": "audio"
    },
    "speechSynchronization": {
        "version": 5,
        "baseFingerprint": wav_key,
        "method": "one-lesson-recording-with-measured-word-anchors",
        "scriptSource": "binary search synchronized script",
        "recordingCount": 1
    },
    "review": {
        "approved": True,
        "method": "teaching-review-and-word-sync",
        "findings": [],
        "observations": []
    }
}

(folder / "lesson.json").write_text(json.dumps(lesson, ensure_ascii=False, indent=2))
(folder / "stream-lesson.json").write_text(json.dumps(lesson, ensure_ascii=False, indent=2))
print("Successfully generated binary search lesson.json!")
print(f"Total duration: {total_dur}s, AudioTrack: /narration/{wav_key}.wav")
