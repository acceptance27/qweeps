import React from 'react';
import {ArrowLeft, RefreshCw, X} from 'lucide-react';
import PixelQ from '../components/PixelQ';

type Props = {
  stage: string;
  error?: string;
  canResume?: boolean;
  onCancel: () => void;
  onRetry?: () => void;
};

/** The preparation shell shares the workspace's pixel framing and reading font. */
export default function PreparationCard({stage, error, canResume, onCancel, onRetry}: Props) {
  return (
    <section className="live-preparation-card" data-state={error ? 'error' : 'working'} aria-labelledby="preparation-title">
      <header className="live-preparation-brand">
        <PixelQ />
        <div><strong>QWEEPS</strong><span>LESSON PREPARATION</span></div>
        <span className="live-preparation-signal" aria-hidden="true" />
      </header>
      <div className="live-preparation-content">
        <h2 id="preparation-title">{error ? 'Preparation stopped' : 'Building your explanation'}</h2>
        <div className="live-preparation-step">
          <span>{error ? 'Needs attention' : 'Current step'}</span>
          <p role={error ? 'alert' : 'status'}>{error || stage}</p>
        </div>
        {!error && (
          <div className="live-preparation-pixels" role="progressbar" aria-label="Lesson preparation in progress" aria-valuetext={stage}>
            {Array.from({length: 12}, (_, i) => <i key={i} style={{animationDelay: `${i * 90}ms`}} aria-hidden="true" />)}
          </div>
        )}
      </div>
      <footer className="live-preparation-actions">
        {!error && <span>Your lesson opens automatically.</span>}
        <div>
          {error && onRetry && <button type="button" className="live-preparation-retry" onClick={onRetry}>
            <RefreshCw size={15} aria-hidden="true" />{canResume ? 'Resume preparation' : 'Try again'}
          </button>}
          <button type="button" onClick={onCancel}>
            {error ? <ArrowLeft size={15} aria-hidden="true" /> : <X size={15} aria-hidden="true" />}
            {error ? 'Return' : 'Cancel preparation'}
          </button>
        </div>
      </footer>
    </section>
  );
}
