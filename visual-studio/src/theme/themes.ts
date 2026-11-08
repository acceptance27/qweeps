export const THEME_STORAGE_KEY = 'qweeps.theme';
export const THEME_CHANGED_EVENT = 'qweeps-theme-changed';

type ThemeColors = { bg: string; panel: string; raised: string; input: string; line: string; strong: string; text: string; muted: string; accent: string; primary: string; onAccent: string; soft: string };
export type Theme = { id: string; name: string; description: string; colors: ThemeColors; display: string; font: string; scenery: boolean };
const sans = "'Plus Jakarta Sans', system-ui, sans-serif";
const inter = "'Inter', system-ui, sans-serif";

export const THEMES: readonly Theme[] = [
  { id: 'forest', name: 'Pixel Forest', description: 'Pixel lettering, warm gold, and a quiet forest.', scenery: true, font: sans, display: 'QweepsDisplay, Georgia, serif',
    colors: { bg: '#101c20', panel: '#1a2d29', raised: '#2a4238', input: '#101f20', line: '#526b59', strong: '#82977f', text: '#eef3e8', muted: '#bbcec1', accent: '#e6c68a', primary: '#e6c68a', onAccent: '#1b2b22', soft: '#3d4431' } },
  { id: 'architecture', name: 'Architecture', description: 'Graphite panels and blue accents from the architecture workspace.', scenery: false, font: inter, display: inter,
    colors: { bg: '#1e1f22', panel: '#25272b', raised: '#2b2d30', input: '#1e1f22', line: '#393b40', strong: '#62666f', text: '#dfe1e5', muted: '#bcbec4', accent: '#8ab4ff', primary: '#306ddd', onAccent: '#ffffff', soft: '#2e436e' } },
  { id: 'midnight', name: 'Midnight', description: 'Deep navy with crisp cyan highlights.', scenery: false, font: inter, display: inter,
    colors: { bg: '#0b1220', panel: '#121e30', raised: '#1b2b40', input: '#0d1727', line: '#304158', strong: '#60758e', text: '#edf4fc', muted: '#b4c5d9', accent: '#77d7ed', primary: '#77d7ed', onAccent: '#0a2330', soft: '#1b3c4c' } },
  { id: 'amethyst', name: 'Amethyst', description: 'Soft charcoal, lavender, and a little warmth.', scenery: false, font: sans, display: sans,
    colors: { bg: '#191621', panel: '#24202e', raised: '#312b3d', input: '#1c1826', line: '#4b405b', strong: '#887896', text: '#f1edf6', muted: '#cdc0d9', accent: '#cfb0f5', primary: '#cfb0f5', onAccent: '#2b193f', soft: '#483554' } },
];

export function resolveTheme(id: unknown): Theme {
  return THEMES.find(theme => theme.id === id) || THEMES[0];
}

export function activeTheme(): Theme {
  return resolveTheme(document.documentElement.dataset.theme);
}

/** Apply before React renders, so navigation and reloads do not flash another palette. */
export function applyTheme(id: unknown, persist = true): Theme {
  const theme = resolveTheme(id);
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty('--q-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), value);
  }
  root.style.setProperty('--q-font', theme.font);
  root.style.setProperty('--q-display', theme.display);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.colors.bg);
  if (persist) {
    try { localStorage.setItem(THEME_STORAGE_KEY, theme.id); } catch { /* Private browsing can disable storage; the preview still works. */ }
  }
  window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
  return theme;
}

export function initializeTheme() {
  let saved: string | null = null;
  try { saved = localStorage.getItem(THEME_STORAGE_KEY); } catch { /* Use the default. */ }
  applyTheme(saved, false);
  window.addEventListener('storage', event => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) applyTheme(event.newValue, false);
  });
}
