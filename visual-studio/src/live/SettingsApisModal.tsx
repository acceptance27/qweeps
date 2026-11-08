import { useEffect, useState } from 'react';
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
  Edit3,
  Gift,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api } from '../learning/types';
import ThemeSettings from '../theme/ThemeSettings';

export type ModelOption = {
  value: string;
  label: string;
  badge?: string;
};

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
    provider_models?: Record<string, ModelOption[]>;
    provider_engines?: Record<string, ModelOption[]>;
    models?: ModelOption[];
    reasoning?: Array<{ value: string; label: string; badge?: string }>;
    engines?: ModelOption[];
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

  const [settings, setSettings] = useState<SettingsData | null>(null);

  // Custom model input toggles per process
  const [customModelMode, setCustomModelMode] = useState<Record<string, boolean>>({});

  // API Key inputs
  const [openRouterKeyInput, setOpenRouterKeyInput] = useState<string>('');
  const [opencodeKeyInput, setOpencodeKeyInput] = useState<string>('');
  const [showOrKey, setShowOrKey] = useState<boolean>(false);
  const [showOcKey, setShowOcKey] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(false);

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

  // When provider changes, update model to first model of that provider (or recommendation)
  const handleProviderChange = (processId: string, newProvider: string) => {
    if (!settings || !settings.processes[processId]) return;
    const proc = settings.processes[processId];
    const providerModels = proc.options?.provider_models?.[newProvider] || [];
    const providerEngines = proc.options?.provider_engines?.[newProvider] || [];

    let newModel = proc.model;
    let newEngine = proc.engine;

    // Check if current model exists in new provider
    const hasModel = providerModels.some(m => m.value === proc.model);
    if (!hasModel && providerModels.length > 0) {
      // Pick recommended if matches provider, else first
      if (proc.recommended.provider === newProvider && proc.recommended.model) {
        newModel = proc.recommended.model;
      } else {
        newModel = providerModels[0].value;
      }
    }

    if (providerEngines.length > 0) {
      const hasEngine = providerEngines.some(e => e.value === proc.engine);
      if (!hasEngine) {
        newEngine = providerEngines[0].value;
      }
    }

    setSettings({
      ...settings,
      processes: {
        ...settings.processes,
        [processId]: {
          ...proc,
          provider: newProvider,
          model: newModel,
          engine: newEngine,
        },
      },
    });
  };

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

  const applyOpenRouterFreePreset = () => {
    if (!settings) return;
    const updated = { ...settings.processes };

    if (updated.lesson_planning) {
      updated.lesson_planning = {
        ...updated.lesson_planning,
        provider: 'openrouter-free',
        model: 'nvidia/nemotron-3.5-super-vl:free',
        reasoning_effort: 'high',
      };
    }
    if (updated.frame_review) {
      updated.frame_review = {
        ...updated.frame_review,
        provider: 'openrouter-free',
        model: 'nvidia/nemotron-3.5-super-vl:free',
        reasoning_effort: 'high',
      };
    }
    if (updated.quiz_generation) {
      updated.quiz_generation = {
        ...updated.quiz_generation,
        provider: 'openrouter-free',
        model: 'nvidia/nemotron-3.5-super-vl:free',
        reasoning_effort: 'high',
      };
    }
    if (updated.quiz_verification) {
      updated.quiz_verification = {
        ...updated.quiz_verification,
        provider: 'openrouter-free',
        model: 'nvidia/nemotron-3.5-super-vl:free',
        reasoning_effort: 'none',
      };
    }
    if (updated.tts) {
      updated.tts = {
        ...updated.tts,
        provider: 'openrouter',
        model: 'fish-audio/s2.1-pro-free:free',
        voice: '33a2191b8fda440cae962137e9793985',
      };
    }
    if (updated.stt) {
      updated.stt = {
        ...updated.stt,
        provider: 'openrouter',
        engine: 'whisper',
        model: 'fish-audio/transcribe-1',
      };
    }

    setSettings({
      ...settings,
      processes: updated,
    });
    setSuccessMsg('🆓 Applied 100% Free OpenRouter Preset across all 6 processes!');
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

  const getProcessThemeClass = (id: string) => {
    switch (id) {
      case 'lesson_planning':
        return 'theme-amber';
      case 'frame_review':
        return 'theme-blue';
      case 'quiz_generation':
        return 'theme-emerald';
      case 'quiz_verification':
        return 'theme-yellow';
      case 'tts':
        return 'theme-purple';
      case 'stt':
        return 'theme-cyan';
      default:
        return 'theme-slate';
    }
  };

  const renderProcessIcon = (id: string) => {
    switch (id) {
      case 'lesson_planning':
        return <Layers size={18} className="icon-amber" />;
      case 'frame_review':
        return <Eye size={18} className="icon-blue" />;
      case 'quiz_generation':
        return <Sparkles size={18} className="icon-emerald" />;
      case 'quiz_verification':
        return <Zap size={18} className="icon-yellow" />;
      case 'tts':
        return <Volume2 size={18} className="icon-purple" />;
      case 'stt':
        return <Mic size={18} className="icon-cyan" />;
      default:
        return <Cpu size={18} className="icon-slate" />;
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
                Settings
              </h2>
              <p className="settings-modal-subtitle">
                Personalize your workspace and configure APIs, models, and narration.
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

        <div className="settings-modal-body">
        <ThemeSettings />
        {/* Presets scroll with the settings, leaving the controls usable on short screens. */}
        <div className="settings-preset-banner">
          <div className="settings-preset-info">
            <div className="settings-preset-badge">⚡ Quick Presets</div>
            <div className="settings-preset-desc">
              Choose your setup in one click: <strong>100% Free OpenRouter</strong> (zero-config, no card) or{' '}
              <strong>OpenCode Go</strong> ($10/mo = $80+ compute with Muse Spark & DeepSeek v4.1).
            </div>
          </div>
          <div className="settings-preset-actions">
            <button
              type="button"
              className="settings-preset-btn-free"
              onClick={applyOpenRouterFreePreset}
              title="Configure all 6 processes using 100% free OpenRouter models (Zero-Config)"
            >
              <Gift size={14} />
              <span>🆓 OpenRouter Free</span>
            </button>
            <button
              type="button"
              className="settings-preset-apply-btn"
              onClick={applyAllRecommendations}
              title="Populate all processes with OpenCode Go recommended models (Muse Spark + Sub-Second Recall)"
            >
              <Zap size={14} />
              <span>⭐ OpenCode Go ($10)</span>
            </button>
          </div>
        </div>

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

              {/* Beginner Guide Card: Free & Cheap Models Breakdown */}
              <section className="settings-guide-card" aria-label="Free and Cheap Models Guide">
                <div className="settings-guide-header" onClick={() => setShowGuide(!showGuide)}>
                  <div className="settings-guide-title-box">
                    <span className="settings-guide-badge">💡 Beginner Guide</span>
                    <h3 className="settings-guide-title">
                      How to Get AI Models 100% Free or Ultra-Cheap ($10)
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="settings-guide-toggle-btn"
                    onClick={e => {
                      e.stopPropagation();
                      setShowGuide(!showGuide);
                    }}
                    aria-label={showGuide ? 'Collapse guide' : 'Expand guide'}
                  >
                    <span>{showGuide ? 'Hide Guide' : 'Show Guide'}</span>
                    {showGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
                <p className="settings-guide-subtitle">
                  Recommended capable models: <strong>DeepSeek v4.1 Flash</strong>,{' '}
                  <strong>Muse Spark 1.3 Contributor</strong>, and <strong>Qwen 3.8 Flash</strong>.
                </p>

                {showGuide && (
                  <div className="settings-guide-grid">
                    {/* Option 1: 100% Free OpenRouter */}
                    <div className="settings-guide-col col-free">
                      <div>
                        <div className="settings-guide-col-header">
                          <span className="settings-guide-price-badge badge-price-free">100% Free</span>
                          <Gift size={16} className="text-emerald-400" />
                        </div>
                        <h4 className="settings-guide-col-title">OpenRouter Free Tier</h4>
                        <div className="settings-guide-models-list">
                          <code>nvidia/nemotron-3.5-super-vl:free</code> · <code>llama-3.3-70b-instruct:free</code> · Fish Audio
                        </div>
                        <p className="settings-guide-text">
                          <strong>No credit card required</strong>: Sign up at openrouter.ai and generate a free API key in seconds.
                          Powers sub-second typed quiz evaluations (&lt;800ms), visual frame reviews, and neural speech with <strong>zero monthly cost</strong>.
                        </p>
                      </div>
                      <div className="settings-guide-col-footer">
                        <button
                          type="button"
                          className="settings-guide-action-btn btn-free-action"
                          onClick={applyOpenRouterFreePreset}
                          title="Apply OpenRouter Free across all 6 processes"
                        >
                          <Zap size={13} />
                          <span>Apply Free Preset</span>
                        </button>
                      </div>
                    </div>

                    {/* Option 2: OpenCode Go */}
                    <div className="settings-guide-col col-opencode">
                      <div>
                        <div className="settings-guide-col-header">
                          <span className="settings-guide-price-badge badge-price-subsidized">$10/mo Subsidized</span>
                          <Sparkles size={16} className="text-amber-400" />
                        </div>
                        <h4 className="settings-guide-col-title">OpenCode Go Compute ($10 = $80+)</h4>
                        <div className="settings-guide-models-list">
                          <code>muse-spark-1.3-contributor</code> · <code>deepseek-v4.1-flash</code>
                        </div>
                        <p className="settings-guide-text">
                          <strong>Heavily subsidized quota</strong>: A $10/mo OpenCode Go plan unlocks token quotas equivalent to{' '}
                          <strong>$80+</strong> of DeepSeek v4.1 and <strong>$60+</strong> of Muse Spark 1.3 Contributor.
                          Enough to generate <strong>50+ visual lessons and quizzes every single day</strong> for a month without running out.
                          Muse Spark 1.3 Contributor provides top-tier SVG scene structure and distractor quality.
                        </p>
                      </div>
                      <div className="settings-guide-col-footer">
                        <button
                          type="button"
                          className="settings-guide-action-btn btn-go-action"
                          onClick={applyAllRecommendations}
                          title="Apply OpenCode Go recommended configuration"
                        >
                          <Sparkles size={13} />
                          <span>Apply Go Preset</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* API Credentials Card */}
              {settings?.api_keys && (
                <section className="settings-section-card theme-copper" aria-label="API Credentials">
                  <div className="settings-card-header">
                    <div className="settings-card-title-group">
                      <div className="settings-proc-icon-wrap icon-copper-bg">
                        <Key size={18} className="icon-copper" />
                      </div>
                      <div>
                        <h3 className="settings-card-title">API Keys & Authentication</h3>
                        <p className="settings-card-desc">
                          Manage OpenRouter and OpenCode credentials. Compatible with OpenCode’s API and model ecosystem.
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
                        Saved in: <code>{settings.api_keys.openrouter.source || 'secrets.toml'}</code> (
                        <code>{settings.api_keys.openrouter.masked || 'None'}</code>)
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
                        {settings.api_keys.opencode_go.configured ? (
                          <>
                            Saved in: <code>{settings.api_keys.opencode_go.source || 'secrets.toml'}</code> (
                            <code>{settings.api_keys.opencode_go.masked || '••••'}</code>)
                          </>
                        ) : (
                          <>Status: <code>Unconfigured</code></>
                        )}
                      </div>
                      <div className="settings-key-input-row">
                        <input
                          type={showOcKey ? 'text' : 'password'}
                          placeholder="Update OPENCODE_API_KEY (oc_sk_... or custom key)"
                          value={opencodeKeyInput}
                          onChange={e => setOpencodeKeyInput(e.target.value)}
                          className="settings-input"
                        />
                        <button
                          type="button"
                          className="settings-input-toggle-btn"
                          onClick={() => setShowOcKey(!showOcKey)}
                          title={showOcKey ? 'Hide key' : 'Show key'}
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                      <p className="settings-key-hint">
                        Powers <code>muse-spark-1.3-contributor</code> for structured visual scenes and quizzes.
                      </p>
                    </div>

                    {/* Local CLI Runner (only shown if detected on user's machine) */}
                    {settings.api_keys.antigravity?.available && (
                      <div className="settings-key-item">
                        <div className="settings-key-header">
                          <span className="settings-key-name">Local Runner (CLI)</span>
                          <span className="settings-status-badge badge-connected">
                            <CheckCircle2 size={12} /> Detected
                          </span>
                        </div>
                        <div className="settings-key-meta">
                          Path: <code>{settings.api_keys.antigravity.path}</code>
                        </div>
                        <p className="settings-key-hint">
                          Local CLI execution runner detected on system PATH.
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Process Cards - Rich Colorful Visual Cards with Provider-Dependent Models */}
              {settings &&
                Object.keys(settings.processes).map(procId => {
                  const proc = settings.processes[procId];
                  const rec = proc.recommended;
                  const themeClass = getProcessThemeClass(proc.id);

                  // AI models strictly depending on selected Provider
                  const providerModels = proc.options?.provider_models?.[proc.provider] || proc.options?.models || [];
                  const providerEngines = proc.options?.provider_engines?.[proc.provider] || proc.options?.engines || [];
                  const isCustom = customModelMode[proc.id] || false;

                  const isRecProvider = proc.provider === rec.provider;
                  const isRecModel = proc.model === rec.model;
                  const isRecEffort = !rec.reasoning_effort || proc.reasoning_effort === rec.reasoning_effort;
                  const allRec = isRecProvider && isRecModel && isRecEffort;

                  return (
                    <section
                      key={proc.id}
                      className={`settings-section-card ${themeClass}`}
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
                          {!allRec && (
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

                      {/* Card Controls Grid: Provider -> Dependent AI Models -> Thinking */}
                      <div className="settings-proc-controls-grid">
                        {/* 1. Provider Selection (Controls which models appear) */}
                        {proc.options?.providers && (
                          <div className="settings-control-group">
                            <label className="settings-label">
                              <span>1. Provider</span>
                              {rec.provider && (
                                <span className="settings-rec-tag">Recommended: {rec.provider}</span>
                              )}
                            </label>
                            <select
                              value={proc.provider}
                              onChange={e => handleProviderChange(proc.id, e.target.value)}
                              className="settings-select"
                            >
                              {proc.options.providers.map(prov => (
                                <option key={prov} value={prov}>
                                  {prov} {prov === rec.provider ? '★ (Recommended)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* 2. AI Model Selection (Dependent on chosen Provider) */}
                        <div className="settings-control-group">
                          <div className="settings-label">
                            <div className="flex items-center gap-2">
                              <span>2. AI Model ({proc.provider})</span>
                              <button
                                type="button"
                                className="settings-custom-toggle"
                                onClick={() =>
                                  setCustomModelMode(prev => ({
                                    ...prev,
                                    [proc.id]: !prev[proc.id],
                                  }))
                                }
                                title={isCustom ? 'Switch to model list' : 'Type custom model string'}
                              >
                                <Edit3 size={11} />
                                <span>{isCustom ? 'Pick from List' : 'Custom Model'}</span>
                              </button>
                            </div>
                            {rec.model && (
                              <span className="settings-rec-tag">
                                Recommended: {rec.model.split('/').pop()}
                              </span>
                            )}
                          </div>

                          {isCustom ? (
                            <input
                              type="text"
                              value={proc.model}
                              onChange={e => updateProcessField(proc.id, 'model', e.target.value)}
                              placeholder={`Enter custom model for ${proc.provider}`}
                              className="settings-input"
                            />
                          ) : (
                            <select
                              value={proc.model}
                              onChange={e => updateProcessField(proc.id, 'model', e.target.value)}
                              className="settings-select"
                            >
                              {providerModels.map(m => (
                                <option key={m.value} value={m.value}>
                                  {m.label} {m.badge ? `(${m.badge})` : ''}
                                </option>
                              ))}
                              {/* If current model is custom or not in list, keep it visible */}
                              {!providerModels.some(m => m.value === proc.model) && (
                                <option value={proc.model}>{proc.model} (Custom / Active)</option>
                              )}
                            </select>
                          )}
                        </div>

                        {/* 3. Thinking / Reasoning Effort (for LLM processes) */}
                        {proc.options?.reasoning && (
                          <div className="settings-control-group settings-reasoning-group">
                            <label className="settings-label">
                              <span>3. Thinking / Reasoning Effort</span>
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
                        {proc.id === 'tts' && proc.provider === 'openrouter' && (
                          <div className="settings-control-group">
                            <label className="settings-label">
                              <span>Fish Audio Voice ID</span>
                              <span className="settings-rec-tag">Default Natural Voice</span>
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

                        {/* STT Engine Specific Fields (Dependent on Provider) */}
                        {proc.id === 'stt' && providerEngines.length > 0 && (
                          <div className="settings-control-group">
                            <label className="settings-label">
                              <span>Recognition Engine ({proc.provider})</span>
                              <span className="settings-rec-tag">Recommended: Whisper</span>
                            </label>
                            <select
                              value={proc.engine || 'whisper'}
                              onChange={e => updateProcessField(proc.id, 'engine', e.target.value)}
                              className="settings-select"
                            >
                              {providerEngines.map(eng => (
                                <option key={eng.value} value={eng.value}>
                                  {eng.label} {eng.badge ? `(${eng.badge})` : ''}
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
              <span className="text-slate-400">Settings are saved on this device</span>
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
              <span>{saving ? 'Saving…' : 'Save settings'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default SettingsApisModal;
