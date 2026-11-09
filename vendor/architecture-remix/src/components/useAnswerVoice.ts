import { useCallback, useEffect, useRef, useState } from 'react';

export type AnswerVoiceState = {
  loading: boolean;
  playing: boolean;
  error: string | null;
};

function appendMedia(source: SourceBuffer, data: BufferSource): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      source.removeEventListener('updateend', done);
      source.removeEventListener('error', fail);
      resolve();
    };
    const fail = () => {
      source.removeEventListener('updateend', done);
      source.removeEventListener('error', fail);
      reject(new Error('Audio append failed.'));
    };
    source.addEventListener('updateend', done);
    source.addEventListener('error', fail);
    try {
      source.appendBuffer(data);
    } catch (error) {
      source.removeEventListener('updateend', done);
      source.removeEventListener('error', fail);
      reject(error);
    }
  });
}

/** Streams an Ask answer from the Python Fish endpoint through MediaSource. */
export function useAnswerVoice() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const controller = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const media = useRef<MediaSource | null>(null);
  const objectUrl = useRef<string | null>(null);
  const [state, setState] = useState<AnswerVoiceState>({
    loading: false,
    playing: false,
    error: null,
  });

  const ensureAudio = useCallback(() => {
    if (!audio.current) {
      const element = new Audio();
      element.preload = 'auto';
      element.onplaying = () => setState((s) => ({ ...s, playing: true, loading: false, error: null }));
      element.onpause = () => setState((s) => ({ ...s, playing: false }));
      element.onended = () => setState((s) => ({ ...s, playing: false, loading: false }));
      element.onerror = () => setState((s) => ({ ...s, playing: false, loading: false, error: 'Audio could not be played.' }));
      audio.current = element;
    }
    return audio.current;
  }, []);

  const stop = useCallback(() => {
    epoch.current++;
    try { controller.current?.abort(); } catch {}
    controller.current = null;
    try { media.current?.endOfStream(); } catch {}
    media.current = null;
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
    if (audio.current) {
      audio.current.pause();
      audio.current.removeAttribute('src');
    }
    setState({ loading: false, playing: false, error: null });
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    stop();
    const element = ensureAudio();
    const token = ++epoch.current;
    const abort = new AbortController();
    controller.current = abort;
    setState({ loading: true, playing: false, error: null });

    try {
      if (!('MediaSource' in window) || !MediaSource.isTypeSupported('audio/mpeg')) {
        const response = await fetch('/api/visual/narration/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: abort.signal,
        });
        if (!response.ok) throw new Error(`Voice stream failed (${response.status}).`);
        const url = URL.createObjectURL(await response.blob());
        objectUrl.current = url;
        element.src = url;
        element.load();
        await new Promise<void>((resolve, reject) => {
          const loaded = () => { element.onloadedmetadata = null; resolve(); };
          element.onloadedmetadata = loaded;
          element.onerror = () => reject(new Error('Audio could not be decoded.'));
          if (element.readyState >= 1) loaded();
        });
        if (token !== epoch.current) return;
        setState({ loading: false, playing: false, error: null });
        await element.play();
        return;
      }

      const source = new MediaSource();
      media.current = source;
      const url = URL.createObjectURL(source);
      objectUrl.current = url;
      element.src = url;
      element.load();
      await new Promise<void>((resolve) => source.addEventListener('sourceopen', () => resolve(), { once: true }));
      if (token !== epoch.current) return;

      const buffer = source.addSourceBuffer('audio/mpeg');
      const response = await fetch('/api/visual/narration/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: abort.signal,
      });
      if (!response.ok || !response.body) throw new Error(`Voice stream failed (${response.status}).`);
      const reader = response.body.getReader();
      let first = true;

      while (true) {
        if (token !== epoch.current) {
          try { await reader.cancel(); } catch {}
          return;
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.byteLength) {
          await appendMedia(buffer, value);
          if (token !== epoch.current) return;
          if (first) {
            first = false;
            setState((s) => ({ ...s, loading: false }));
            try {
              await element.play();
            } catch {
              setState((s) => ({ ...s, error: 'Tap “Speak answer” again to allow playback.' }));
            }
          }
        }
      }
      if (source.readyState === 'open') source.endOfStream();
    } catch (error) {
      if (token !== epoch.current || (error as Error).name === 'AbortError') return;
      setState({
        loading: false,
        playing: false,
        error: error instanceof Error ? error.message : 'Voice playback failed.',
      });
    }
  }, [ensureAudio, stop]);

  useEffect(() => () => {
    epoch.current++;
    try { controller.current?.abort(); } catch {}
    try { media.current?.endOfStream(); } catch {}
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    if (audio.current) {
      audio.current.pause();
      audio.current.removeAttribute('src');
    }
  }, []);

  return { speak, stop, state };
}
