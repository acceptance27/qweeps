import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Palette } from 'lucide-react';
import { THEMES, THEME_CHANGED_EVENT, activeTheme, applyTheme } from './themes';

export default function ThemeSettings() {
  const [selected, setSelected] = useState(() => activeTheme().id);
  useEffect(() => {
    const sync = () => setSelected(activeTheme().id);
    window.addEventListener(THEME_CHANGED_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGED_EVENT, sync);
  }, []);
  return <section className="theme-settings" aria-labelledby="appearance-title">
    <div className="theme-settings-heading"><Palette size={19} aria-hidden="true" /><div>
      <h3 id="appearance-title">Appearance</h3>
      <p>Choose your workspace. Changes apply instantly and are saved in this browser.</p>
    </div><span className="theme-current">{THEMES.find(t => t.id === selected)?.name}</span></div>
    <div className="theme-options" role="radiogroup" aria-label="Workspace theme">
      {THEMES.map(theme => <label key={theme.id} className="theme-option" data-selected={selected === theme.id}
        style={Object.fromEntries(Object.entries(theme.colors).map(([k, v]) => ['--preview-' + k, v])) as CSSProperties}>
        <input type="radio" name="workspace-theme" value={theme.id} checked={selected === theme.id}
          onChange={() => applyTheme(theme.id)} aria-describedby={'theme-description-' + theme.id} />
        <span className="theme-preview" aria-hidden="true">
          <span className="theme-preview-top"><i /><i /><i /></span>
          <span className="theme-preview-content"><span className="theme-preview-sidebar"><i /><i /><i /></span>
            <span className="theme-preview-page"><b>Aa</b><i /><i /><em /></span></span>
        </span>
        <span className="theme-option-name">{theme.name}<Check size={15} aria-hidden="true" /></span>
        <span className="theme-option-description" id={'theme-description-' + theme.id}>{theme.description}</span>
      </label>)}
    </div>
  </section>;
}
