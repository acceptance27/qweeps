import React, { useEffect, useState } from 'react';
import {
  Sliders,
  X,
  Check,
  Sparkles,
  Zap,
  Key,
  RefreshCw,
  Cpu,
  Volume2,
  Mic,
  CheckCircle2,
  AlertCircle,
  Eye,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { api } from '../learning/types';

export type ProcessConfig = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  provider: string;
  model: string;
  reasoning_effort?: string;
  voice?: string;
  engine?: string;
  recommended: {
    provider?: string;
    model?: string;
    reasoning_effort?: string;
    voice?: string;
    engine?: string;
    badge: string;
  };
  options?: {
    providers?: string[];
    models?: Array<{ value: string; label: string; badge?: string }>;
    reasoning?: Array<{ value: string; label: string; badge?: string }>;
    engines?: Array<{ value: string; label: string; badge?: string }>;
  };
};

export type SettingsData = {
  processes: Record<string, ProcessConfig>;
  api_keys: {
    openrouter: { configured: boolean; masked: string; source: string };
    opencode_go: { configured: boolean; masked: string; source: string };
    antigravity: { available: boolean; path: string };
  };
};

interface SettingsApisModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsApisModal({ isOpen, onClose }: SettingsApisModalProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<string>('all');
  const [settings, setSettings] = useState<SettingsData | null>(null);

  // Form states for editable fields
  const [openRouterKeyInput, setOpenRouterKeyInput] = useState<string>('');
  const [opencodeKeyInput, setOpencodeKeyInput] = useState<string>('');
  const [showOrKey, setShowOrKey] = useState<boolean>(false);

  // Fetch settings on open
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    api<SettingsData>('settings')
      .then(data => {
        if (!cancelled) {
          setSettings(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message || 'Failed to load settings');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const updateProcessField = (processId: string, field: string, value: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      processes: {
        ...settings.processes,
        [processId]: {
          ...settings.processes[processId],
          [field]: value,
        },
      },
    });
  };

  const applyProcessRecommendation = (processId: string) => {
    if (!settings || !settings.processes[processId]) return;
    const proc = settings.processes[processId];
    const rec = proc.recommended;
    setSettings({
      ...settings,
      processes: {
        ...settings.processes,
        [processId]: {
          ...proc,
          provider: rec.provider || proc.provider,
          model: rec.model || proc.model,
          reasoning_effort: rec.reasoning_effort || proc.reasoning_effort,
          voice: rec.voice || proc.voice,
          engine: rec.engine || proc.engine,
        },
      },
    });
    setSuccessMsg(`Applied recommendation for ${proc.title}!`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const applyAllRecommendations = () => {
    if (!settings) return;
    const updated = { ...settings.processes };
    for (const [key, proc] of Object.entries(updated)) {
      const rec = proc.recommended;
      updated[key] = {
        ...proc,
        provider: rec.provider || proc.provider,
        model: rec.model || proc.model,
        reasoning_effort: rec.reasoning_effort || proc.reasoning_effort,
        voice: rec.voice || proc.voice,
        engine: rec.engine || proc.engine,
      };
    }
    setSettings({
      ...settings,
      processes: updated,
    });
    setSuccessMsg('⭐ Applied all recommended presets across all 6 processes!');
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    const payload: any = {
      processes: settings.processes,
      api_keys: {},
    };

    if (openRouterKeyInput.trim()) {
      payload.api_keys.openrouter_key = openRouterKeyInput.trim();
    }
    if (opencodeKeyInput.trim()) {
      payload.api_keys.opencode_key = opencodeKeyInput.trim();
    }

    try {
      const res = await api<{ ok: boolean; settings: SettingsData }>('settings', payload);
      if (res && res.settings) {
        setSettings(res.settings);
        setOpenRouterKeyInput('');
        setOpencodeKeyInput('');
        setSuccessMsg('✅ Settings and APIs successfully saved and hot-reloaded!');
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const renderProcessIcon = (id: string) => {
    switch (id) {
      case 'lesson_planning':
        return <Layers size={17} className="text-amber-400" />;
      case 'frame_review':
        return <Eye size={17} className="text-blue-400" />;
      case 'quiz_generation':
        return <Sparkles size={17} className="text-emerald-400" />;
      case 'quiz_verification':
        return <Zap size={17} className="text-yellow-400" />;
      case 'tts':
        return <Volume2 size={17} className="text-purple-400" />;
      case 'stt':
        return <Mic size={17} className="text-cyan-400" />;
      default:
        return <Cpu size={17} className="text-slate-400" />;
    }
  };

  return (
    <div
      className="settings-modal-backdrop"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="settings-modal-dialog">
        {/* Header */}
        <div className="settings-modal-header">
          <div className="settings-modal-title-group">
            <div className="settings-icon-bubble">
              <Sliders size={20} className="text-amber-300" />
            </div>
            <div>
              <h2 id="settings-modal-title" className="settings-modal-title">
                Settings / APIs & Models
              </h2>
              <p className="settings-modal-subtitle">
                Configure APIs, AI Models & Thinking Effort for each process with highlighted recommendations.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="settings-modal-close"
            onClick={onClose}
            aria-label="Close settings dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Global Preset Banner */}
        <div className="settings-preset-banner">
          <div className="settings-preset-info">
            <div className="settings-preset-badge">⭐ Recommended Preset</div>
            <div className="settings-preset-desc">
              <strong>Free Tier & Sub-Second Latency</strong>: OpenCode Go + OpenRouter Free models, Fisch Audio TTS,
              Whisper STT, and 0-thinking instant typed quiz verification (&lt;800ms).
            </div>
          </div>
          <button
            type="button"
            className="settings-preset-apply-btn"
            onClick={applyAllRecommendations}
            title="Populate all processes with the recommended configuration"
          >
            <Zap size={15} />
            <span>Apply All Recommendations</span>
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="settings-tabs-bar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            className={`settings-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All Processes (6)
          </button>
          {settings &&
            Object.keys(settings.processes).map(key => {
              const p = settings.processes[key];
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === key}
                  className={`settings-tab-btn ${activeTab === key ? 'active' : ''}`}
                  onClick={() => setActiveTab(key)}
                >
                  {renderProcessIcon(key)}
                  <span>{p.title.split(' ')[0]}</span>
                </button>
              );
            })}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'keys'}
            className={`settings-tab-btn ${activeTab === 'keys' ? 'active' : ''}`}
            onClick={() => setActiveTab('keys')}
          >
            <Key size={14} />
            <span>API Keys</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="settings-modal-body">
          {loading ? (
            <div className="settings-modal-loading">
              <RefreshCw className="animate-spin" size={24} />
              <span>Loading current settings and system configuration…</span>
            </div>
          ) : error ? (
            <div className="settings-modal-alert alert-error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          ) : (
            <>
              {successMsg && (
                <div className="settings-modal-alert alert-success">
                  <CheckCircle2 size={18} />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* API Credentials Tab / Section */}
              {(activeTab === 'all' || activeTab === 'keys') && settings?.api_keys && (
                <section className="settings-section-card keys-card" aria-label="API Credentials">
                  <div className="settings-card-header">
                    <div className="settings-card-title-group">
                      <Key size={18} className="text-amber-400" />
                      <div>
                        <h3 className="settings-card-title">API Keys & Authentication</h3>
                        <p className="settings-card-desc">
                          Credentials and CLI engines powering the visual generation pipeline.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="settings-keys-grid">
                    {/* OpenRouter */}
                    <div className="settings-key-item">
                      <div className="settings-key-header">
                        <span className="settings-key-name">OpenRouter API Key</span>
                        {settings.api_keys.openrouter.configured ? (
                          <span className="settings-status-badge badge-connected">
                            <CheckCircle2 size={12} /> Connected
                          </span>
                        ) : (
                          <span className="settings-status-badge badge-missing">
                            <AlertCircle size={12} /> Key Missing
                          </span>
                        )}
                      </div>
                      <div className="settings-key-meta">
                        Masked:{' '}
                        <code>{settings.api_keys.openrouter.masked || 'None (saved in secrets.toml)'}</code>
                      </div>
                      <div className="settings-key-input-row">
                        <input
                          type={showOrKey ? 'text' : 'password'}
                          placeholder="Update OPENROUTER_API_KEY (sk-or-v1-...)"
                          value={openRouterKeyInput}
                          onChange={e => setOpenRouterKeyInput(e.target.value)}
                          className="settings-input"
                        />
                        <button
                          type="button"
                          className="settings-input-toggle-btn"
                          onClick={() => setShowOrKey(!showOrKey)}
                          title={showOrKey ? 'Hide key' : 'Show key'}
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                      <p className="settings-key-hint">
                        Powers free models like <code>nvidia/nemotron-3.5-super-vl:free</code> and Fish Audio TTS.
                      </p>
                    </div>

                    {/* OpenCode Go */}
                    <div className="settings-key-item">
                      <div className="settings-key-header">
                        <span className="settings-key-name">OpenCode Go Authentication</span>
                        {settings.api_keys.opencode_go.configured ? (
                          <span className="settings-status-badge badge-connected">
                            <CheckCircle2 size={12} /> Connected
                          </span>
                        ) : (
                          <span className="settings-status-badge badge-missing">
                            <AlertCircle size={12} /> Unauthenticated
                          </span>
                        )}
                      </div>
                      <div className="settings-key-meta">
                        Detected from:{' '}
                        <code>{settings.api_keys.opencode_go.source || '~/.local/share/opencode/auth.json'}</code>
                      </div>
                      <input
                        type="password"
                        placeholder="Optional custom oc_sk_... token"
                        value={opencodeKeyInput}
                        onChange={e => setOpencodeKeyInput(e.target.value)}
                        className="settings-input"
                      />
                      <p className="settings-key-hint">
                        Powers <code>muse-spark-1.3-contributor</code> for structured visual scene layout and quizzes.
                      </p>
                    </div>

                    {/* Antigravity CLI */}
                    <div className="settings-key-item">
                      <div className="settings-key-header">
                        <span className="settings-key-name">Antigravity CLI (agy)</span>
                        {settings.api_keys.antigravity.available ? (
                          <span className="settings-status-badge badge-connected">
                            <CheckCircle2 size={12} /> Detected
                          </span>
                        ) : (
                          <span className="settings-status-badge badge-missing">
                            <AlertCircle size={12} /> Not in PATH
                          </span>
                        )}
                      </div>
                      <div className="settings-key-meta">
                        Path: <code>{settings.api_keys.antigravity.path || 'Not found'}</code>
                      </div>
                      <p className="settings-key-hint">
                        Local CLI runner for high-fidelity Google Gemini multimodal models.
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {/* Processes Cards */}
              {settings &&
                Object.keys(settings.processes).map(procId => {
                  if (activeTab !== 'all' && activeTab !== procId) return null;
                  const proc = settings.processes[procId];
                  const rec = proc.recommended;
                  const isRecModel = proc.model === rec.model;
                  const isRecEffort = !rec.reasoning_effort || proc.reasoning_effort === rec.reasoning_effort;

                  return (
                    <section
                      key={proc.id}
                      className="settings-section-card"
                      aria-labelledby={`proc-heading-${proc.id}`}
                    >
                      {/* Card Header */}
                      <div className="settings-card-header">
                        <div className="settings-card-title-group">
                          <div className="settings-proc-icon-wrap">{renderProcessIcon(proc.id)}</div>
                          <div>
                            <div className="settings-proc-header-line">
                              <h3 id={`proc-heading-${proc.id}`} className="settings-card-title">
                                {proc.title}
                              </h3>
                              <span className="settings-proc-subtitle-pill">{proc.subtitle}</span>
                            </div>
                            <p className="settings-card-desc">{proc.description}</p>
                          </div>
                        </div>

                        {/* Recommendation Highlight Pill */}
                        <div className="settings-rec-highlight-box">
                          <div className="settings-rec-highlight-badge">
                            <Sparkles size={13} className="text-amber-300" />
                            <span>{rec.badge}</span>
                          </div>
                          {(!isRecModel || !isRecEffort) && (
                            <button
                              type="button"
                              className="settings-rec-apply-single-btn"
                              onClick={() => applyProcessRecommendation(proc.id)}
                              title="Set recommended values for this process"
                            >
                              Apply
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Card Controls Grid */}
                      <div className="settings-proc-controls-grid">
                        {/* Provider Selection */}
                        {proc.options?.providers && (
                          <div className="settings-control-group">
                            <label className="settings-label">
                              Provider
                              {rec.provider && (
                                <span className="settings-rec-tag">Recommended: {rec.provider}</span>
                              )}
                            </label>
                            <select
                              value={proc.provider}
                              onChange={e => updateProcessField(proc.id, 'provider', e.target.value)}
                              className="settings-select"
                            >
                              {proc.options.providers.map(prov => (
                                <option key={prov} value={prov}>
                                  {prov} {prov === rec.provider ? '★' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Model Selection */}
                        <div className="settings-control-group">
                          <label className="settings-label">
                            AI Model
                            {rec.model && (
                              <span className="settings-rec-tag">
                                Recommended: {rec.model.split('/').pop()}
                              </span>
                            )}
                          </label>
                          {proc.options?.models ? (
                            <select
                              value={proc.model}
                              onChange={e => updateProcessField(proc.id, 'model', e.target.value)}
                              className="settings-select"
                            >
                              {proc.options.models.map(m => (
                                <option key={m.value} value={m.value}>
                                  {m.label} {m.badge ? `(${m.badge})` : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={proc.model}
                              onChange={e => updateProcessField(proc.id, 'model', e.target.value)}
                              className="settings-input"
                            />
                          )}
                        </div>

                        {/* Thinking / Reasoning Effort (for LLM processes) */}
                        {proc.options?.reasoning && (
                          <div className="settings-control-group settings-reasoning-group">
                            <label className="settings-label">
                              Thinking / Reasoning Effort
                              {rec.reasoning_effort && (
                                <span className="settings-rec-tag">
                                  Recommended: {rec.reasoning_effort.toUpperCase()}
                                </span>
                              )}
                            </label>
                            <div className="settings-reasoning-pills">
                              {proc.options.reasoning.map(r => {
                                const isSelected = proc.reasoning_effort === r.value;
                                const isRec = rec.reasoning_effort === r.value;
                                return (
                                  <button
                                    key={r.value}
                                    type="button"
                                    className={`settings-pill-btn ${isSelected ? 'selected' : ''} ${
                                      isRec ? 'is-recommended' : ''
                                    }`}
                                    onClick={() => updateProcessField(proc.id, 'reasoning_effort', r.value)}
                                  >
                                    <span>{r.label.split(' ')[0]}</span>
                                    {isRec && <span className="settings-pill-star">★</span>}
                                  </button>
                                );
                              })}
                            </div>
                            {proc.id === 'quiz_verification' && (
                              <p className="settings-subsecond-tip">
                                ⚡ <strong>Sub-Second Latency Tip:</strong> Keep reasoning set to{' '}
                                <strong>None</strong> for instant 400–800ms student answer checks!
                              </p>
                            )}
                          </div>
                        )}

                        {/* TTS Voice Specific Fields */}
                        {proc.id === 'tts' && (
                          <div className="settings-control-group">
                            <label className="settings-label">
                              Voice ID / Accent
                              <span className="settings-rec-tag">Default: Fish Audio Natural Voice</span>
                            </label>
                            <input
                              type="text"
                              value={proc.voice || ''}
                              onChange={e => updateProcessField(proc.id, 'voice', e.target.value)}
                              placeholder="33a2191b8fda440cae962137e9793985"
                              className="settings-input"
                            />
                          </div>
                        )}

                        {/* STT Engine Specific Fields */}
                        {proc.id === 'stt' && proc.options?.engines && (
                          <div className="settings-control-group">
                            <label className="settings-label">
                              Recognition Engine
                              <span className="settings-rec-tag">Recommended: Whisper</span>
                            </label>
                            <select
                              value={proc.engine || 'whisper'}
                              onChange={e => updateProcessField(proc.id, 'engine', e.target.value)}
                              className="settings-select"
                            >
                              {proc.options.engines.map(eng => (
                                <option key={eng.value} value={eng.value}>
                                  {eng.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="settings-modal-footer">
          <div className="settings-footer-status">
            {saving ? (
              <span className="text-amber-300 flex items-center gap-2">
                <RefreshCw size={14} className="animate-spin" /> Saving & hot-reloading pipeline…
              </span>
            ) : successMsg ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <Check size={14} /> {successMsg}
              </span>
            ) : (
              <span className="text-slate-400">Settings persist in ~/.config/qweeps</span>
            )}
          </div>
          <div className="settings-footer-actions">
            <button type="button" className="settings-btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="settings-btn-primary"
              onClick={handleSave}
              disabled={saving || loading}
            >
              <Check size={16} />
              <span>{saving ? 'Saving…' : 'Save & Apply Settings'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default SettingsApisModal;
