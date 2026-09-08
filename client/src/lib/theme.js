// Light / dark theme. The palette lives in CSS custom properties; the
// only thing JS does is put a class on <body> and remember the choice.
const KEY = 'tell.theme';
export const THEMES = ['light', 'dark'];

export function normalizeTheme(v) {
  return THEMES.indexOf(v) !== -1 ? v : 'light';
}

export function nextTheme(v) {
  return THEMES[(THEMES.indexOf(normalizeTheme(v)) + 1) % THEMES.length];
}

export function loadTheme() {
  try { return normalizeTheme(localStorage.getItem(KEY)); } catch (_) { return 'light'; }
}

export function saveTheme(v) {
  try { localStorage.setItem(KEY, normalizeTheme(v)); } catch (_) {}
}

export function applyTheme(v) {
  const t = normalizeTheme(v);
  if (typeof document === 'undefined' || !document.body) return t;
  if (t === 'dark') document.body.classList.add('dark');
  else document.body.classList.remove('dark');
  return t;
}
