import { useSyncExternalStore } from 'react';

// iOS system colours: [light, dark]
export const COLORS = {
  blue: ['#007AFF', '#0A84FF'],
  indigo: ['#5856D6', '#5E5CE6'],
  purple: ['#AF52DE', '#BF5AF2'],
  pink: ['#FF2D55', '#FF375F'],
  red: ['#FF3B30', '#FF453A'],
  orange: ['#FF9500', '#FF9F0A'],
  green: ['#34C759', '#30D158'],
  mint: ['#00C7BE', '#63E6E2'],
  teal: ['#30B0C7', '#40C8E0'],
  cyan: ['#32ADE6', '#64D2FF'],
  brown: ['#A2845E', '#AC8E68'],
  graphite: ['#8E8E93', '#98989D'],
};

export const colorOf = (name, dark) => (COLORS[name] || COLORS.blue)[dark ? 1 : 0];

const mq = matchMedia('(prefers-color-scheme: dark)');
let current = { theme: localStorage.getItem('wl-theme') || 'system', accent: 'blue' };
const listeners = new Set();

export function applyTheme(settings = current) {
  current = { theme: settings.theme || 'system', accent: settings.accent || 'blue' };
  const dark = current.theme === 'dark' || (current.theme === 'system' && mq.matches);
  const root = document.documentElement;
  const changed = root.dataset.theme !== (dark ? 'dark' : 'light');
  root.dataset.theme = dark ? 'dark' : 'light';
  const accent = colorOf(current.accent, dark);
  root.style.setProperty('--accent', accent);
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', dark ? '#000000' : '#F2F2F7');
  try {
    localStorage.setItem('wl-theme', current.theme);
    localStorage.setItem('wl-accent', accent);
  } catch {
    /* storage unavailable */
  }
  if (changed) listeners.forEach((l) => l());
}

mq.addEventListener('change', () => applyTheme());

const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));
export const useDark = () => useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme === 'dark');
