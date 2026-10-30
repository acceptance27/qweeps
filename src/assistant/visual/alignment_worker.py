"""Isolated local Whisper runtime; emits measured word timestamps."""
import argparse
import json
import os
from pathlib import Path

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--model',required=True);parser.add_argument('--batch',required=True)
    args=parser.parse_args()
    from faster_whisper import WhisperModel
    model=WhisperModel(args.model,device='cpu',compute_type='int8',cpu_threads=4,local_files_only=True)
    items=json.loads(Path(args.batch).read_text())
    for i,item in enumerate(items):
        segments,info=model.transcribe(item['audio'],language='en',word_timestamps=True,beam_size=3,condition_on_previous_text=False)
        words=[{'text':w.word,'start':float(w.start),'end':float(w.end),'probability':float(w.probability)} for s in segments for w in s.words or []]
        output=Path(item['output']);pending=output.with_suffix(f'.{os.getpid()}.tmp')
        pending.write_text(json.dumps({'words':words,'duration':float(info.duration)}));pending.replace(output)
        print(json.dumps({'completed':i+1,'total':len(items)}),flush=True)

if __name__=='__main__':main()
