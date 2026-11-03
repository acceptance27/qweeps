import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../learning/types';
import LiveLessonPlayer from './LiveLessonPlayer';
import LivePreparation from './LivePreparation';
import type { LiveJob, LiveLesson } from './lessonTypes';
import './live.css';

type DocumentMeta = {
  id: string;
  title: string;
  filename: string;
  pageCount: number;
  aliases: string[];
};

type CatalogLesson = {
  id: string;
  title: string;
  question: string;
  beatCount: number;
  duration: number;
  hasNative: boolean;
  quizCount: number;
  bundled: boolean;
  mtime?: number;
  updatedAt?: string;
};

type SortMode = 'newest' | 'oldest' | 'duration' | 'title';

function formatRelativeTime(mtime?: number): string {
  if (!mtime) return '';
  const now = Date.now() / 1000;
  const diff = Math.max(0, now - mtime);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours}h ago`;
  }
  const days = Math.floor(diff / 86400);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  const d = new Date(mtime * 1000);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

export default function LiveLessonLoader() {
  const params = new URLSearchParams(location.search);
  const defaultPvpLesson = !params.get('lesson') && !params.get('job') && !params.get('topic') && params.get('home') !== '1';

  const [lesson, setLesson] = useState<LiveLesson | null>(null);
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [catalogLessons, setCatalogLessons] = useState<CatalogLesson[]>([]);
  const [selected, setSelected] = useState(params.get('document') || '');
  const [question, setQuestion] = useState(params.get('topic') || '');
  const [native, setNative] = useState(params.get('native') === '1');
  const [generateQuiz, setGenerateQuiz] = useState(params.get('quiz') === '1');
  const [openQuizOnLoad, setOpenQuizOnLoad] = useState(params.get('quiz') === '1');
  const [nativeMode, setNativeMode] = useState<'per_beat' | 'continuous'>(
    params.get('nativeMode') === 'continuous' ? 'continuous' : 'per_beat'
  );
  const [sortBy, setSortBy] = useState<SortMode>('newest');
  const [job, setJob] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyQuiz, setBusyQuiz] = useState(false);
  const [busyLessonQuizId, setBusyLessonQuizId] = useState<string | null>(null);

  const initialized = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const syncAvailable = useRef(false);

  async function generateQuizOnly(doc = selected, q = question) {
    if (busy || busyQuiz) return;
    if (!q.trim() && !doc) {
      setError('Please enter a learning topic or select a source document.');
      return;
    }
    setBusyQuiz(true);
    setError('');
    try {
      const existing = catalogLessons.find(
        l => (doc && l.id === doc) || (q && l.question?.toLowerCase().includes(q.trim().toLowerCase()))
      );
      const res = await api<{
        quiz: any[];
        count: number;
        lessonId?: string;
        lesson?: LiveLesson;
      }>('live/quiz', {
        lessonId: existing?.id,
        documentId: doc || undefined,
        question: q || undefined,
        topic: q || undefined,
      });

      if (!res?.quiz || res.quiz.length === 0) {
        throw new Error('No quiz questions were returned.');
      }

      setOpenQuizOnLoad(true);
      setGenerateQuiz(true);

      let targetLesson: LiveLesson | null = res.lesson || null;
      if (!targetLesson && res.lessonId) {
        try {
          targetLesson = await api<LiveLesson>(`live/lessons/${res.lessonId}`);
        } catch {
          // ignore
        }
      }
      if (!targetLesson && existing) {
        try {
          targetLesson = await api<LiveLesson>(`live/lessons/${existing.id}`);
        } catch {
          // ignore
        }
      }

      if (targetLesson) {
        ready({ ...targetLesson, quiz: res.quiz });
      } else {
        const titleText = q.trim() || 'Reinforcement Quiz';
        const virtualLesson: LiveLesson = {
          id: res.lessonId || 'standalone_quiz',
          title: titleText,
          question: q.trim() || `Mastery Quiz: ${titleText}`,
          duration: 30,
          kind: 'live_generated',
          chapters: [
            {
              id: 'quiz-beat-1',
              title: titleText,
              question: q.trim() || `Mastery Quiz: ${titleText}`,
              insight: 'Interactive reinforcement mastery quiz',
              start: 0,
              end: 30,
              narration: 'Begin the interactive reinforcement quiz.',
              cues: [],
              visual: { takeaway: titleText, nodes: [] },
            },
          ],
          quiz: res.quiz,
        };
        ready(virtualLesson);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyQuiz(false);
    }
  }

  async function generateQuizForLesson(lessonId: string) {
    if (busy || busyQuiz || busyLessonQuizId) return;
    setBusyLessonQuizId(lessonId);
    setError('');
    try {
      const res = await api<{
        quiz: any[];
        count: number;
        lessonId?: string;
        lesson?: LiveLesson;
      }>('live/quiz', { lessonId });

      if (!res?.quiz || res.quiz.length === 0) {
        throw new Error('Could not generate quiz for this lesson.');
      }

      setOpenQuizOnLoad(true);
      setGenerateQuiz(true);
      let targetLesson = res.lesson;
      if (!targetLesson) {
        targetLesson = await api<LiveLesson>(`live/lessons/${lessonId}`);
      }
      ready({ ...targetLesson, quiz: res.quiz });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyLessonQuizId(null);
    }
  }

  async function start(
    q = question,
    doc = selected,
    resumeLessonId?: string,
    mode = nativeMode,
    withQuiz = generateQuiz
  ) {
    if (!q.trim() || busy) return;
    setBusy(true);
    setError('');
    setOpenQuizOnLoad(withQuiz);
    try {
      const result = await api<LiveJob>('live/jobs', {
        question: q,
        documentId: doc || undefined,
        resumeLessonId,
        native,
        nativeMode: mode,
        generateQuiz: withQuiz,
      });
      setJob(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void api<{ documents: DocumentMeta[] }>('documents')
      .then(r => setDocuments(r.documents))
      .catch(e => setError(e.message));

    void api<{ lessons: CatalogLesson[] }>(`live/lessons?sort=${sortBy}`)
      .then(r => setCatalogLessons(r.lessons || []))
      .catch(() => {});

    if (initialized.current) return;
    initialized.current = true;
    void api('health')
      .then(h => {
        syncAvailable.current = h.tts === 'openrouter';
        const id = params.get('lesson') || (defaultPvpLesson ? 'b1b20bea700000000000000000000001' : null);
        if (id) return api<LiveLesson>(`live/lessons/${id}`).then(ready);
        else if (params.get('job')) setJob(params.get('job')!);
        else if (params.get('topic')) return start(params.get('topic')!, params.get('document') || '');
      })
      .catch(e => setError(e.message));
  }, [sortBy]);

  async function upload(file: File) {
    setBusy(true);
    setError('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Could not read the PDF.'));
        reader.readAsDataURL(file);
      });
      const doc = await api<DocumentMeta>('documents', { filename: file.name, base64 });
      setDocuments(d => [...d.filter(x => x.id !== doc.id), doc]);
      setSelected(doc.id);
      if (!question) setQuestion('Teach me ' + doc.title);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ready = (value: LiveLesson) => {
    if (!openQuizOnLoad && params.get('quiz') !== '1' && value.kind === 'live_generated' && !value.audioTrack && syncAvailable.current && params.get('nosync') !== '1') {
      void api<LiveJob>('live/synchronize', { lessonId: value.id })
        .then(j => setJob(j.id))
        .catch(e => setError(e.message));
      return;
    }
    const query = new URLSearchParams({ lesson: value.id });
    for (const key of ['muted', 'desktop', 'nosync', 't', 'beat']) {
      if (params.has(key)) query.set(key, params.get(key)!);
    }
    if (generateQuiz || openQuizOnLoad || params.get('quiz') === '1') query.set('quiz', '1');
    setLesson(value);
    setJob(null);
    history.replaceState(null, '', `/?${query}`);
  };

  const lessonHref = (id: string) => (generateQuiz ? `/?lesson=${id}&quiz=1` : `/?lesson=${id}`);

  const sortedLessons = useMemo(() => {
    const list = [...catalogLessons];
    if (sortBy === 'newest') {
      return list.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    }
    if (sortBy === 'oldest') {
      return list.sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
    }
    if (sortBy === 'duration') {
      return list.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    }
    if (sortBy === 'title') {
      return list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }
    return list;
  }, [catalogLessons, sortBy]);

  return (
    <>
      {lesson ? (
        <LiveLessonPlayer
          initialLesson={lesson}
          initialTime={Number(params.get('t') || 0)}
          initialOpenQuiz={openQuizOnLoad || generateQuiz || params.get('quiz') === '1'}
        />
      ) : (
        <main className="live-generator">
          <div>
            <span>QWEEPS · LIVE VISUAL LEARNING</span>
            <h1>What would you like to understand?</h1>
            <p>
              Choose a source PDF or ask for a topic. QWEEPS plans, illustrates and reviews a live lesson you can pause,
              inspect and question.
            </p>

            <section className="live-generated-lessons-box" aria-label="Generated Lesson List">
              <div className="live-generated-lessons-header">
                <div className="live-header-title-group">
                  <span>GENERATED LESSONS</span>
                  <span className="live-header-count">{catalogLessons.length} available</span>
                </div>
                <div className="live-sort-controls">
                  <label htmlFor="live-lesson-sort" className="live-sort-label">
                    Sort by:
                  </label>
                  <select
                    id="live-lesson-sort"
                    className="live-sort-select"
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as SortMode)}
                    aria-label="Sort lessons by"
                  >
                    <option value="newest">🕒 Newest first</option>
                    <option value="oldest">⏳ Oldest first</option>
                    <option value="duration">⏱️ Duration</option>
                    <option value="title">🔤 Title (A–Z)</option>
                  </select>
                </div>
              </div>

              <div className="live-generated-lessons-scroll">
                <a
                  href="/?stream=1"
                  className="live-generated-lesson-item variant-quiz"
                  title="Instant parallel chapter streaming demo"
                >
                  <span className="live-generated-lesson-text">
                    ⚡ Fast Chapter Stream: <strong>Parallel Agents (Instant ~40s Start)</strong>
                  </span>
                  <span className="live-generated-lesson-arrow">→</span>
                </a>

                {sortedLessons.length === 0 ? (
                  <div className="live-generated-lessons-empty">
                    Loading lesson catalog…
                  </div>
                ) : (
                  sortedLessons.map((item, idx) => {
                    const variants = ['variant-gold', 'variant-blue', 'variant-emerald'] as const;
                    const vClass = item.hasNative ? 'variant-gold' : variants[idx % variants.length];
                    const icon = item.hasNative ? '🎬' : item.beatCount <= 4 ? '🌿' : '✨';
                    const relTime = formatRelativeTime(item.mtime);
                    const durStr = formatDuration(item.duration);
                    return (
                      <div key={item.id} className={`live-generated-lesson-row ${vClass}`}>
                        <a
                          href={lessonHref(item.id)}
                          className="live-generated-lesson-main"
                          title={`Play: ${item.title}`}
                        >
                          <span className="live-generated-lesson-text">
                            {icon} Play {item.beatCount}-Beat {item.hasNative ? 'Hybrid' : 'Lesson'}:{' '}
                            <strong>{item.title}</strong>
                          </span>
                          <div className="live-generated-lesson-meta">
                            {relTime && (
                              <span className="live-meta-badge live-badge-time" title={item.updatedAt || ''}>
                                🕒 {relTime}
                              </span>
                            )}
                            <span className="live-meta-badge live-badge-duration">⏱️ {durStr}</span>
                            <span className="live-generated-lesson-arrow">→</span>
                          </div>
                        </a>
                        {item.quizCount > 0 ? (
                          <a
                            href={`/?lesson=${item.id}&quiz=1&beat=quiz`}
                            className="live-generated-lesson-quiz-btn"
                            title={`Take ${item.quizCount}-Question Reinforcement Quiz`}
                          >
                            🧠 Quiz ({item.quizCount})
                          </a>
                        ) : (
                          <button
                            type="button"
                            className="live-generated-lesson-quiz-btn quiz-action-generate"
                            disabled={busyQuiz || busyLessonQuizId === item.id}
                            onClick={() => void generateQuizForLesson(item.id)}
                            title="Generate reinforcement quiz for this lesson"
                          >
                            {busyLessonQuizId === item.id ? 'Generating…' : '🧠 + Quiz'}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <form
              onSubmit={e => {
                e.preventDefault();
                void start();
              }}
            >
              <label htmlFor="live-topic">Your learning request</label>
              <textarea
                id="live-topic"
                aria-label="Learning request"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="Teach me Module 6"
                rows={3}
              />
              <label htmlFor="live-source">Source material</label>
              <select
                id="live-source"
                aria-label="Lesson PDF"
                value={selected}
                onChange={e => setSelected(e.target.value)}
              >
                <option value="">Match a saved source, or use general knowledge</option>
                {documents.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.title} · {d.pageCount} pages
                  </option>
                ))}
              </select>
              <input
                ref={input}
                type="file"
                accept="application/pdf,.pdf"
                aria-label="Attach a source PDF"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
              />
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '20px',
                  alignItems: 'center',
                  marginTop: '2px',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    gap: '6px',
                    alignItems: 'center',
                    fontSize: '0.85rem',
                    color: '#9fb6bf',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={native}
                    onChange={e => setNative(e.target.checked)}
                  />{' '}
                  Include native ManimGL beats
                </label>
                <label
                  style={{
                    display: 'flex',
                    gap: '6px',
                    alignItems: 'center',
                    fontSize: '0.85rem',
                    color: generateQuiz ? '#edca82' : '#9fb6bf',
                    cursor: 'pointer',
                  }}
                  title="Generates a reinforcement quiz where missed questions repeat until answered 100% perfectly"
                >
                  <input
                    type="checkbox"
                    checked={generateQuiz}
                    onChange={e => {
                      setGenerateQuiz(e.target.checked);
                      setOpenQuizOnLoad(e.target.checked);
                    }}
                  />{' '}
                  Generate Quiz/Tests
                </label>
              </div>
              {native && (
                <label
                  style={{
                    display: 'flex',
                    gap: '6px',
                    alignItems: 'center',
                    fontSize: '0.85rem',
                    color: '#9fb6bf',
                  }}
                >
                  Manim composition
                  <select
                    value={nativeMode}
                    onChange={e => setNativeMode(e.target.value as 'per_beat' | 'continuous')}
                    style={{
                      background: '#10242e',
                      color: '#dbe6e6',
                      border: '1px solid #365360',
                      borderRadius: 5,
                      padding: '4px 6px',
                    }}
                  >
                    <option value="per_beat">Per-beat scenes</option>
                    <option value="continuous">Continuous run</option>
                  </select>
                </label>
              )}
              <div className="live-generator-actions">
                <button type="button" disabled={busy || busyQuiz} onClick={() => input.current?.click()}>
                  Attach PDF
                </button>
                <div className="live-generator-action-group">
                  <button
                    type="button"
                    className="live-menu-generate-quiz-btn"
                    disabled={busy || busyQuiz || (!question.trim() && !selected)}
                    onClick={() => void generateQuizOnly()}
                    title="Generate reinforcement quiz only (instant, without building animations)"
                  >
                    {busyQuiz ? '🧠 Generating Quiz…' : '🧠 Generate Quiz'}
                  </button>
                  <button type="submit" disabled={busy || busyQuiz || !question.trim()}>
                    {busy ? 'Reading…' : generateQuiz ? 'Teach me + Generate Quiz' : 'Teach me visually'}
                  </button>
                </div>
              </div>
            </form>
            {error && (
              <p className="live-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </main>
      )}
      {job && (
        <LivePreparation
          key={job}
          jobId={job}
          onReady={ready}
          onCancel={() => setJob(null)}
          onRetry={j => {
            if (j.speechSync)
              void api<LiveJob>('live/synchronize', { lessonId: j.lessonId })
                .then(r => setJob(r.id))
                .catch(e => setError(e.message));
            else void start(question, selected, j.canResume ? j.lessonId : undefined);
          }}
        />
      )}
    </>
  );
}
