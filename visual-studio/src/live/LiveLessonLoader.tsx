import {useCompactLayout} from './useCompactLayout';
import PixelQ from '../components/PixelQ';
import LearningWorld from './LearningWorld';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Brain, Clock3, FileUp, Sliders, Zap } from 'lucide-react';
import { api } from '../learning/types';
import LiveLessonPlayer from './LiveLessonPlayer';
import LivePreparation from './LivePreparation';
import SettingsApisModal, { type SettingsData } from './SettingsApisModal';
import {
  ReinforcementQuizModal,
  ReinforcementQuizNavbar,
  createInitialQuizState,
  type QuizProgressState,
} from './ReinforcementQuizModal';
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

function StandaloneQuizPlayer({
  lesson,
  onExit,
}: {
  lesson: LiveLesson;
  onExit: () => void;
}) {
  const [quizState, setQuizState] = useState<QuizProgressState>(() =>
    createInitialQuizState(lesson, true)
  );

  return (
    <main className="standalone-quiz-container">
      <header className="standalone-quiz-top-bar">
        <button
          type="button"
          className="standalone-quiz-exit-btn"
          onClick={onExit}
          title="Return to main menu"
        >
          <ArrowLeft size={16} />
          <span>Main menu</span>
        </button>
        <div className="standalone-quiz-title-box">
          <span className="standalone-quiz-kicker">REINFORCEMENT QUIZ · {lesson.quiz?.length || 0} CARDS</span>
          <h2>{lesson.title}</h2>
        </div>
        <ReinforcementQuizNavbar
          lesson={lesson}
          quizState={quizState}
          setQuizState={setQuizState}
          hideTitle
          className="live-replaced-quiz-navbar"
        />
      </header>

      <div className="standalone-quiz-stage-body">
        <ReinforcementQuizModal
          embedded
          hideHeader
          lesson={lesson}
          quizState={quizState}
          setQuizState={setQuizState}
          onClose={onExit}
        />
      </div>
    </main>
  );
}

export default function LiveLessonLoader() {
  const params = new URLSearchParams(location.search);
  const defaultPvpLesson = !params.get('lesson') && !params.get('job') && !params.get('topic') && params.get('home') !== '1';

  const [lesson, setLesson] = useState<LiveLesson | null>(null);
  const [standaloneQuiz, setStandaloneQuiz] = useState<LiveLesson | null>(null);
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [catalogLessons, setCatalogLessons] = useState<CatalogLesson[]>([]);
  const initialDocs = (params.get('documents') || params.get('document') || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const [selectedDocs, setSelectedDocs] = useState<string[]>(initialDocs);
  const selected = selectedDocs.join(',');
  const setSelected = (val: string | string[]) => {
    if (Array.isArray(val)) {
      setSelectedDocs(val);
    } else if (!val) {
      setSelectedDocs([]);
    } else {
      setSelectedDocs(val.split(',').map(s => s.trim()).filter(Boolean));
    }
  };
  const [question, setQuestion] = useState(params.get('topic') || '');
  const [native, setNative] = useState(params.get('native') === '1');
  const [generateQuiz, setGenerateQuiz] = useState(params.get('quiz') === '1');
  const [openQuizOnLoad, setOpenQuizOnLoad] = useState(params.get('quiz') === '1');
  const [nativeMode, setNativeMode] = useState<'per_beat' | 'continuous'>(
    params.get('nativeMode') === 'continuous' ? 'continuous' : 'per_beat'
  );
  const [sortBy, setSortBy] = useState<SortMode>('newest');
  const {compact, pageSize, keyboard} = useCompactLayout();
  const [homePanel,setHomePanel] = useState<'create'|'library'>('create');
  const [libraryPage,setLibraryPage] = useState(0);
  const [job, setJob] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyQuiz, setBusyQuiz] = useState(false);
  const [busyLessonQuizId, setBusyLessonQuizId] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(params.get('settings') === '1');
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);

  const initialized = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const syncAvailable = useRef(false);

  const checkApiStatus = async (): Promise<boolean> => {
    try {
      const data = await api<SettingsData>('settings');
      const isConfigured = Boolean(
        data?.api_keys?.openrouter?.configured ||
        data?.api_keys?.opencode_go?.configured ||
        data?.api_keys?.antigravity?.available
      );
      setApiConfigured(isConfigured);
      return isConfigured;
    } catch {
      return true;
    }
  };

  async function generateQuizOnly(doc = selected, q = question) {
    if (busy || busyQuiz) return;
    if (apiConfigured === false) {
      setError('⚠️ AI API Key Required: No AI API connection detected. Connect a 100% free OpenRouter key or OpenCode Go in Settings/APIs to generate quizzes.');
      setShowSettingsModal(true);
      return;
    }
    if (!q.trim() && !doc) {
      setError('Please enter a learning topic or select a source document.');
      return;
    }
    setBusyQuiz(true);
    setError('');
    try {
      let docId = doc;
      if (!docId && q) {
        const qLower = q.toLowerCase();
        const matchedDocs = documents.filter(
          d =>
            (d.filename && qLower.includes(d.filename.toLowerCase())) ||
            (d.title && qLower.includes(d.title.toLowerCase()))
        );
        if (matchedDocs.length > 0) docId = matchedDocs.map(d => d.id).join(',');
      }
      const existing = catalogLessons.find(
        l => (docId && l.id === docId) || (q && l.question?.toLowerCase().includes(q.trim().toLowerCase()))
      );
      const docIdsArray = docId ? docId.split(',').map(s => s.trim()).filter(Boolean) : [];
      const res = await api<{
        quiz: any[];
        count: number;
        lessonId?: string;
        lesson?: LiveLesson;
      }>('live/quiz', {
        lessonId: existing?.id,
        documentId: docId || undefined,
        documentIds: docIdsArray.length > 0 ? docIdsArray : undefined,
        question: q || undefined,
        topic: q || undefined,
      });

      if (!res?.quiz || res.quiz.length === 0) {
        throw new Error('No quiz questions were returned.');
      }

      const titleText = (res.lesson?.title) || (existing?.title) || q.trim() || 'Reinforcement Quiz';
      const chapters = (res.lesson?.chapters?.length)
        ? res.lesson.chapters
        : res.quiz.map((item: any, i: number) => ({
            id: item.chapterId || `beat-${i + 1}`,
            title: item.chapterTitle || `Card ${i + 1}`,
            question: item.prompt,
            insight: item.explanation,
            start: 0,
            end: 30,
            narration: '',
            cues: [],
            visual: { takeaway: item.chapterTitle || `Card ${i + 1}`, nodes: [] },
          }));

      const quizLesson: LiveLesson = {
        id: res.lessonId || existing?.id || 'standalone_quiz',
        title: titleText,
        question: q.trim() || `Mastery Quiz: ${titleText}`,
        duration: 30,
        kind: 'standalone_quiz',
        chapters: chapters as any,
        sources: [],
        quiz: res.quiz,
      };

      setStandaloneQuiz(quizLesson);
      setLesson(null);
      setJob(null);
      history.replaceState(null, '', `/?quiz_only=1&doc=${docId || ''}`);
    } catch (e) {
      const msg = (e as Error).message || '';
      setError(msg);
      if (
        msg.toLowerCase().includes('api key') ||
        msg.toLowerCase().includes('openrouter_api_key') ||
        msg.toLowerCase().includes('opencode go') ||
        msg.toLowerCase().includes('unauthorized') ||
        msg.toLowerCase().includes('subscription')
      ) {
        setShowSettingsModal(true);
      }
    } finally {
      setBusyQuiz(false);
    }
  }

  async function generateQuizForLesson(lessonId: string) {
    if (busy || busyQuiz || busyLessonQuizId) return;
    if (apiConfigured === false) {
      setError('⚠️ AI API Key Required: No AI API connection detected. Connect a 100% free OpenRouter key or OpenCode Go in Settings/APIs to generate quizzes.');
      setShowSettingsModal(true);
      return;
    }
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

      let targetLesson = res.lesson;
      if (!targetLesson) {
        targetLesson = await api<LiveLesson>(`live/lessons/${lessonId}`);
      }
      const quizLesson: LiveLesson = {
        ...targetLesson,
        quiz: res.quiz,
      };

      setStandaloneQuiz(quizLesson);
      setLesson(null);
      setJob(null);
      history.replaceState(null, '', `/?quiz_only=1&lesson=${lessonId}`);
    } catch (e) {
      const msg = (e as Error).message || '';
      setError(msg);
      if (
        msg.toLowerCase().includes('api key') ||
        msg.toLowerCase().includes('openrouter_api_key') ||
        msg.toLowerCase().includes('opencode go') ||
        msg.toLowerCase().includes('unauthorized') ||
        msg.toLowerCase().includes('subscription')
      ) {
        setShowSettingsModal(true);
      }
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
    if (apiConfigured === false) {
      setError('⚠️ AI API Key Required: No AI API connection detected. Connect a 100% free OpenRouter key or OpenCode Go in Settings/APIs to generate visual lessons.');
      setShowSettingsModal(true);
      return;
    }
    setBusy(true);
    setError('');
    setOpenQuizOnLoad(withQuiz);
    try {
      let docId = doc;
      if (!docId && q) {
        const qLower = q.toLowerCase();
        const matchedDocs = documents.filter(
          d =>
            (d.filename && qLower.includes(d.filename.toLowerCase())) ||
            (d.title && qLower.includes(d.title.toLowerCase()))
        );
        if (matchedDocs.length > 0) docId = matchedDocs.map(d => d.id).join(',');
      }
      const docIdsArray = docId ? docId.split(',').map(s => s.trim()).filter(Boolean) : [];
      const result = await api<LiveJob>('live/jobs', {
        question: q,
        documentId: docId || undefined,
        documentIds: docIdsArray.length > 0 ? docIdsArray : undefined,
        resumeLessonId,
        native,
        nativeMode: mode,
        generateQuiz: withQuiz,
      });
      setJob(result.id);
    } catch (e) {
      const msg = (e as Error).message || '';
      setError(msg);
      if (
        msg.toLowerCase().includes('api key') ||
        msg.toLowerCase().includes('openrouter_api_key') ||
        msg.toLowerCase().includes('opencode go') ||
        msg.toLowerCase().includes('unauthorized') ||
        msg.toLowerCase().includes('subscription')
      ) {
        setShowSettingsModal(true);
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void checkApiStatus();

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
        if (params.get('quiz_only') === '1') {
          const qLessonId = params.get('lesson');
          const qDocId = params.get('doc');
          if (qLessonId || qDocId) {
            void api<{ quiz: any[]; lesson?: LiveLesson }>('live/quiz', { lessonId: qLessonId, documentId: qDocId })
              .then(res => {
                if (res?.quiz?.length) {
                  const title = res.lesson?.title || 'Reinforcement Quiz';
                  const chapters = (res.lesson?.chapters?.length) ? res.lesson.chapters : res.quiz.map((item: any, i: number) => ({
                    id: item.chapterId || `beat-${i + 1}`,
                    title: item.chapterTitle || `Card ${i + 1}`,
                    question: item.prompt,
                    insight: item.explanation,
                    start: 0,
                    end: 30,
                    narration: '',
                    cues: [],
                    visual: { takeaway: item.chapterTitle || `Card ${i + 1}`, nodes: [] },
                  }));
                  setStandaloneQuiz({
                    id: qLessonId || 'standalone_quiz',
                    title,
                    question: `Mastery Quiz: ${title}`,
                    duration: 30,
                    kind: 'standalone_quiz',
                    chapters: chapters as any,
                    sources: [],
                    quiz: res.quiz,
                  });
                }
              })
              .catch(() => {});
            return;
          }
        }
        const id = params.get('lesson') || (defaultPvpLesson ? 'b1b20bea700000000000000000000001' : null);
        if (id) return api<LiveLesson>(`live/lessons/${id}`).then(ready);
        else if (params.get('job')) setJob(params.get('job')!);
        else if (params.get('topic')) return start(params.get('topic')!, params.get('document') || '');
      })
      .catch(e => setError(e.message));
  }, [sortBy]);

  async function uploadMultiple(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (!fileArray.length) return;
    setBusy(true);
    setError('');
    try {
      const uploaded: DocumentMeta[] = [];
      for (const file of fileArray) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
          reader.readAsDataURL(file);
        });
        const doc = await api<DocumentMeta>('documents', { filename: file.name, base64 });
        uploaded.push(doc);
      }
      setDocuments(prev => {
        const ids = new Set(uploaded.map(x => x.id));
        return [...prev.filter(x => !ids.has(x.id)), ...uploaded];
      });
      setSelectedDocs(prev => Array.from(new Set([...prev, ...uploaded.map(d => d.id)])));
      if (!question) {
        if (uploaded.length === 1) {
          setQuestion('Teach me ' + uploaded[0].title);
        } else {
          setQuestion('Synthesize lesson from ' + uploaded.map(d => d.title).join(' and '));
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    return uploadMultiple([file]);
  }

  const ready = (value: LiveLesson, quizMode = false) => {
    const isQuiz =
      quizMode ||
      openQuizOnLoad ||
      generateQuiz ||
      params.get('quiz') === '1' ||
      params.get('beat') === 'quiz';
    if (!isQuiz && value.kind === 'live_generated' && !value.audioTrack && syncAvailable.current && params.get('nosync') !== '1') {
      void api<LiveJob>('live/synchronize', { lessonId: value.id })
        .then(j => setJob(j.id))
        .catch(e => setError(e.message));
      return;
    }
    const query = new URLSearchParams({ lesson: value.id });
    for (const key of ['muted', 'desktop', 'nosync', 't', 'beat']) {
      if (params.has(key)) query.set(key, params.get(key)!);
    }
    if (isQuiz) query.set('quiz', '1');
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

  const libraryPageCount = Math.max(1, Math.ceil(sortedLessons.length / pageSize));
  const currentLibraryPage = Math.min(libraryPage, libraryPageCount - 1);
  const visibleLessons = compact ? sortedLessons.slice(currentLibraryPage * pageSize, (currentLibraryPage + 1) * pageSize) : sortedLessons;

  return (
    <>
      {standaloneQuiz ? (
        <StandaloneQuizPlayer
          lesson={standaloneQuiz}
          onExit={() => {
            setStandaloneQuiz(null);
            history.replaceState(null, '', '/?home=1');
          }}
        />
      ) : lesson ? (
        <LiveLessonPlayer
          initialLesson={lesson}
          initialTime={Number(params.get('t') || 0)}
          initialOpenQuiz={openQuizOnLoad || generateQuiz || params.get('quiz') === '1'}
        />
      ) : (
        <main className="live-generator" data-mobile-panel={homePanel} data-keyboard-open={keyboard}>
          <LearningWorld />
          <div>
            <div className="live-menu-top-bar">
              <span className="live-menu-brand-text"><PixelQ/> QWEEPS <small>VISUAL LEARNING STUDIO</small></span>
              <button
                type="button"
                className="live-menu-settings-btn"
                onClick={() => setShowSettingsModal(true)}
                title="Configure APIs, AI Models & Thinking Effort for each process"
                aria-label="Settings and APIs configuration"
              >
                <Sliders size={15} />
                <span>Settings/APIs</span>
              </button>
            </div>
            <nav className="mobile-home-tabs" aria-label="Learning workspace"><button type="button" aria-pressed={homePanel==='create'} onClick={()=>setHomePanel('create')}>Create a lesson</button><button type="button" aria-pressed={homePanel==='library'} onClick={()=>setHomePanel('library')}>Your library ({catalogLessons.length})</button></nav>
            <div className="live-home-intro">
              <span className="live-home-eyebrow">YOUR LEARNING ADVENTURE AWAITS</span>
              <h1>A little world<br /><em>of big ideas.</em></h1>
              <p>Turn a question or a source into a visual lesson you can explore at your own pace.</p>
            </div>


            <section className="live-generated-lessons-box" aria-label="Generated Lesson List">
              <div className="live-generated-lessons-header">
                <div className="live-header-title-group">
                  <span>YOUR LESSON LIBRARY</span>
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
                    onChange={e => {setSortBy(e.target.value as SortMode);setLibraryPage(0);}}
                    aria-label="Sort lessons by"
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="duration">Duration</option>
                    <option value="title">Title (A–Z)</option>
                  </select>
                </div>
              </div>

              <div className="live-generated-lessons-scroll">
                {!compact&&<a
                  href="/?stream=1"
                  className="live-generated-lesson-item variant-quiz"
                  title="Instant parallel chapter streaming demo"
                >
                  <span className="live-generated-lesson-text">
                    <Zap size={17} aria-hidden="true" /><span><strong>Fast chapter stream</strong><small>Parallel chapter preview</small></span>
                  </span>
                  <span className="live-generated-lesson-arrow">→</span>
                </a>}

                {sortedLessons.length === 0 ? (
                  <div className="live-generated-lessons-empty">
                    Loading lesson catalog…
                  </div>
                ) : (
                  visibleLessons.map((item, idx) => {
                    const variants = ['variant-gold', 'variant-blue', 'variant-emerald'] as const;
                    const vClass = item.hasNative ? 'variant-gold' : variants[idx % variants.length];
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
                            <BookOpen size={18} aria-hidden="true" />
                            <span><strong>{item.title}</strong><small>{item.beatCount} chapters · {item.hasNative ? 'Hybrid lesson' : 'Visual lesson'}</small></span>
                          </span>
                          <div className="live-generated-lesson-meta">
                            {relTime && (
                              <span className="live-meta-badge live-badge-time" title={item.updatedAt || ''}>
                                {relTime}
                              </span>
                            )}
                            <span className="live-meta-badge live-badge-duration"><Clock3 size={12} aria-hidden="true" /> {durStr}</span>
                            <span className="live-generated-lesson-arrow">→</span>
                          </div>
                        </a>
                        {item.quizCount > 0 ? (
                          <button
                            type="button"
                            className="live-generated-lesson-quiz-btn"
                            disabled={busyQuiz || busyLessonQuizId === item.id}
                            onClick={() => void generateQuizForLesson(item.id)}
                            title={`Take ${item.quizCount}-Question Reinforcement Quiz`}
                          >
                            <Brain size={15} aria-hidden="true" /> Quiz ({item.quizCount})
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="live-generated-lesson-quiz-btn quiz-action-generate"
                            disabled={busyQuiz || busyLessonQuizId === item.id}
                            onClick={() => void generateQuizForLesson(item.id)}
                            title="Generate reinforcement quiz for this lesson"
                          >
                            <Brain size={15} aria-hidden="true" /> {busyLessonQuizId === item.id ? 'Generating…' : '+ Quiz'}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="mobile-library-pages"><button type="button" aria-label="Previous library page" disabled={currentLibraryPage===0} onClick={()=>setLibraryPage(currentLibraryPage-1)}>← Previous</button><span>{currentLibraryPage+1} / {libraryPageCount}</span><button type="button" aria-label="Next library page" disabled={currentLibraryPage+1>=libraryPageCount} onClick={()=>setLibraryPage(currentLibraryPage+1)}>Next →</button></div>
            </section>

            {apiConfigured === false && (
              <div
                className="live-api-warning-banner"
                onClick={() => setShowSettingsModal(true)}
                role="alert"
                title="Click to configure AI models and API credentials"
              >
                <div className="live-api-warning-content">
                  <span className="live-api-warning-icon">⚠️</span>
                  <div>
                    <strong>AI API Key Required</strong>: Connect a 100% free OpenRouter key or OpenCode Go to generate visual lessons & quizzes.
                  </div>
                </div>
                <button type="button" className="live-api-warning-btn">
                  Configure Settings/APIs →
                </button>
              </div>
            )}

            <form className="live-create-form"
              onSubmit={e => {
                e.preventDefault();
                void start();
              }}
            >
              <div className="live-create-heading"><PixelQ/><div><strong>Start exploring</strong><small>WHAT WILL YOU LEARN TODAY?</small></div></div>
              <label htmlFor="live-topic">Your learning request</label>
              <textarea
                id="live-topic"
                aria-label="Learning request"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="Explain how a neuron sends a signal..."
                rows={3}
              />
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                <label htmlFor="live-source">Source material (Multiple PDFs supported)</label>
                {selectedDocs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDocs([])}
                    style={{fontSize:'10px',color:'#edb09f',textDecoration:'underline',cursor:'pointer'}}
                  >
                    Clear sources
                  </button>
                )}
              </div>
              <select
                id="live-source"
                aria-label="Lesson PDF"
                value=""
                onChange={e => {
                  const val = e.target.value;
                  if (val) {
                    setSelectedDocs(prev => prev.includes(val) ? prev : [...prev, val]);
                    e.target.value = '';
                  }
                }}
              >
                <option value="">{selectedDocs.length > 0 ? '+ Add another source document...' : 'Match a saved source, or use general knowledge'}</option>
                {documents.map(d => (
                  <option key={d.id} value={d.id} disabled={selectedDocs.includes(d.id)}>
                    {selectedDocs.includes(d.id) ? '✓ ' : ''}{d.title} · {d.pageCount} pages
                  </option>
                ))}
              </select>
              {selectedDocs.length > 0 && (
                <div className="live-selected-docs-tray" style={{display:'flex',flexWrap:'wrap',gap:'6px',margin:'2px 0 8px'}}>
                  {selectedDocs.map(id => {
                    const doc = documents.find(d => d.id === id);
                    return (
                      <span
                        key={id}
                        style={{
                          display:'inline-flex',alignItems:'center',gap:'6px',padding:'3px 8px',
                          background:'rgba(237,202,130,0.12)',border:'1px solid rgba(237,202,130,0.3)',
                          borderRadius:'14px',fontSize:'11px',color:'#ebd8a7'
                        }}
                      >
                        📄 {doc?.title || id} <small style={{opacity:0.75}}>({doc?.pageCount || 1}p)</small>
                        <button
                          type="button"
                          onClick={() => setSelectedDocs(prev => prev.filter(x => x !== id))}
                          style={{cursor:'pointer',fontSize:'13px',fontWeight:'bold',color:'#edca82',lineHeight:1,padding:'0 2px'}}
                          title="Remove document"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                  <span style={{fontSize:'10px',color:'#849da8',alignSelf:'center'}}>
                    ({selectedDocs.length} PDF{selectedDocs.length > 1 ? 's' : ''} ·{' '}
                    {selectedDocs.reduce((acc, id) => acc + (documents.find(d => d.id === id)?.pageCount || 0), 0)} total pages)
                  </span>
                </div>
              )}
              <input
                ref={input}
                type="file"
                multiple
                accept="application/pdf,.pdf,.pptx,.ppt"
                aria-label="Attach source PDFs"
                style={{display:'none'}}
                onChange={e => {
                  if (e.target.files) void uploadMultiple(e.target.files);
                }}
              />
              <div className="live-generator-options">
                <label className="live-native-option"
                  style={{display:'flex',gap:6,alignItems:'center',color:'#9fb6bf',cursor:'pointer'}}
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
                <button type="button" disabled={busy || busyQuiz} onClick={() => input.current?.click()} title="Upload one or multiple PDFs">
                  <FileUp size={16} aria-hidden="true" /> {selectedDocs.length > 0 ? 'Attach more PDFs' : 'Attach PDF(s)'}
                </button>
                <div className="live-generator-action-group">
                  <button
                    type="button"
                    className="live-menu-generate-quiz-btn"
                    disabled={busy || busyQuiz || (!question.trim() && selectedDocs.length === 0)}
                    onClick={() => void generateQuizOnly()}
                    title="Generate reinforcement quiz only (instant, without building animations)"
                  >
                    <Brain size={16} aria-hidden="true" /> {busyQuiz ? 'Generating quiz…' : 'Generate quiz'}
                  </button>
                  <button type="submit" disabled={busy || busyQuiz || (!question.trim() && selectedDocs.length === 0)}>
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
      <SettingsApisModal
        isOpen={showSettingsModal}
        onClose={() => {
          setShowSettingsModal(false);
          void checkApiStatus();
          const p = new URLSearchParams(location.search);
          if (p.has('settings')) {
            p.delete('settings');
            history.replaceState(null, '', p.toString() ? `/?${p}` : '/?home=1');
          }
        }}
      />
    </>
  );
}
