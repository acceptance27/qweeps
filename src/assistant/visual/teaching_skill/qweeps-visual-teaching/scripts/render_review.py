#!/usr/bin/env python3
"""Render one native Manim CE scene successfully, then extract review frames.

A media/receipt check is not a teaching approval. Inspect the generated contact
sheet and playback, then write the review findings separately.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def probe(path):
    return json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)], text=True))


def capture(video, timings, output, min_width=0):
    from PIL import Image, ImageDraw
    info = probe(video)
    stream = next(s for s in info["streams"] if s["codec_type"] == "video")
    if stream["width"] < min_width or not any(s["codec_type"] == "audio" for s in info["streams"]):
        raise ValueError("Expected resolution and narration track are required")
    duration = float(stream.get("duration", info["format"]["duration"]))
    audio = next(s for s in info["streams"] if s["codec_type"] == "audio")
    if float(audio.get("duration", duration)) > duration + .3:
        raise ValueError("Narration outlasts the video; extend the scene before review")
    beats = json.loads(timings.read_text())["beats"]
    starts = [b["start"] for b in beats]
    if not starts or starts[0] != 0 or starts != sorted(set(starts)) or starts[-1] >= duration:
        raise ValueError("Chapter times do not match the media")
    output.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGB", (1152, len(beats)*242), "#161b22")
    draw = ImageDraw.Draw(sheet)
    frames = []
    for i,b in enumerate(beats):
        end = starts[i+1] if i+1 < len(starts) else duration
        times = [b["start"]+.3, (b["start"]+end)/2, end-.4]
        for j,t in enumerate(times):
            target = output/f"beat-{i+1}-{j+1}.png"
            target.unlink(missing_ok=True)
            subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", str(t), "-i", str(video), "-frames:v", "1", str(target)], check=True)
            if not target.exists(): raise ValueError(f"No decoded video frame at {t:.3f}s")
            with Image.open(target) as frame:
                sheet.paste(frame.convert("RGB").resize((384,216)), (j*384,i*242))
            draw.text((j*384+5,i*242+218), f"Beat {i+1} | {t:.2f}s", fill="white")
            frames.append({"beat":i,"time":round(t,3),"file":target.name})
    sheet.save(output/"contact-sheet.jpg", quality=92)
    return {"video":str(video), "video_sha256":digest(video), "duration":duration,
            "resolution":[stream["width"],stream["height"]], "frames":frames,
            "teaching_review":"pending: inspect frames and playback"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--scene", required=True)
    parser.add_argument("--lesson", required=True, help="ID of companion timings JSON")
    parser.add_argument("--media-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--renderer", default=sys.executable)
    parser.add_argument("--quality", choices=["low","medium"], default="low")
    args = parser.parse_args()
    source = args.source.resolve()
    media = args.media_dir.resolve()
    inputs = [source]
    inputs += [source.parent/name for name in ["storyboards.json", "audio-durations.json"] if (source.parent/name).exists()]
    inputs += sorted((source.parent/"audio").glob(args.lesson+"_*.mp3"))
    before = {str(p):digest(p) for p in inputs}
    # Use the actual interpreter, not another ambient Python or ManimGL runtime.
    with tempfile.TemporaryDirectory(prefix="qweeps-manim-probe-") as scratch:
        subprocess.run([args.renderer,"-c","import manim, PIL; from manim import Text; Text('font probe', font='Sans'); print('Manim CE', manim.__version__, 'Pillow', PIL.__version__)"],check=True,cwd=scratch)
    quality = "-ql" if args.quality == "low" else "-qm"
    subprocess.run([args.renderer,"-m","manim",quality,"--disable_caching","-v","WARNING","--media_dir",str(media),str(source),args.scene],check=True)
    if {str(p):digest(p) for p in inputs} != before:
        raise ValueError("Source, storyboard or audio changed during render; render it again")
    video = media/"videos"/source.stem/("480p15" if args.quality == "low" else "720p30")/(args.scene+".mp4")
    timings = source.parent/"timings"/(args.lesson+".json")
    result = capture(video,timings,args.out.resolve(),854 if args.quality == "low" else 1280)
    result.update(source=str(source),source_sha256=before[str(source)],input_sha256=before,render_exit_verified=True,scene=args.scene)
    storyboard = source.parent/"storyboards.json"
    if storyboard.exists(): result["storyboard_sha256"] = digest(storyboard)
    (args.out/"receipt.json").write_text(json.dumps(result,indent=2))
    print(json.dumps({"render":"success","review":"pending","contact_sheet":str(args.out/"contact-sheet.jpg")}))


if __name__ == "__main__":
    main()
