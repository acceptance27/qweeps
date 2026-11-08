import { useEffect, useMemo, useRef, useState } from 'react';
import { ArchitectureVoice } from './ArchitectureVoice';
import type { VoiceScope } from './speechClock';

export function useArchitectureNarration(scope: VoiceScope, playhead: number, playing: boolean, pause: () => void) {
  const [, update] = useState(0);
  const [enabled, setEnabled] = useState(() => new URLSearchParams(location.search).get('muted') !== '1');
  const pauseRef = useRef(pause); pauseRef.current = pause;
  const mounted = useRef(true);
  const controller = useRef<ArchitectureVoice | null>(null);
  if (!controller.current) controller.current = new ArchitectureVoice(() => { if (mounted.current) update(n => n + 1); }, () => pauseRef.current());
  const voice = controller.current;
  const key = useMemo(() => JSON.stringify(scope), [scope]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; voice.dispose(); }; }, [voice]);
  useEffect(() => { voice.select(key, scope, playhead); }, [voice, key]);
  useEffect(() => { voice.syncScene(playhead); }, [voice, key, playhead]);
  useEffect(() => { voice.setEnabled(enabled); }, [voice, enabled]);
  useEffect(() => { voice.setPlaying(playing); return () => voice.setPlaying(false); }, [voice, playing, enabled, key]);
  const current = voice.key === key;
  return {
    enabled,
    busy: current && ['preparing', 'loading'].includes(voice.phase),
    status: current ? voice.error || (voice.phase === 'ready' ? '' : voice.stage) : '',
    error: current && voice.phase === 'error',
    clock: (dt: number) => current ? voice.clock(dt) : enabled ? playhead : null,
    displayTime: current ? voice.displayTime(playhead) : playhead,
    duration: current && voice.track ? voice.track.duration : scope.steps.reduce((n, s) => n + s.duration, 0),
    steps: current && voice.track ? scope.steps.map((s, i) => ({ ...s, duration: voice.track!.chapters[i].end - voice.track!.chapters[i].start })) : scope.steps,
    caption: current ? voice.caption(playhead) : undefined,
    toScene: (time: number) => { voice.seekAudio(time); return voice.clock(0) ?? time; },
    seekScene: (time: number) => voice.seekScene(time),
    toggle: () => { pauseRef.current(); setEnabled(v => !v); },
    cancel: () => { pauseRef.current(); voice.cancel(); setEnabled(false); },
  };
}
