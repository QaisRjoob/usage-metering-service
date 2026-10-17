import { createContext, useContext } from 'react';

export type Theme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}

/** Colours for recharts (SVG attributes cannot read the CSS palette variables). */
export function useChartTheme() {
  const { theme } = useTheme();
  return theme === 'dark'
    ? { grid: '#1f2a40', axis: '#94a3b8', label: '#cbd5e1', tooltip: { fontSize: 12, borderRadius: 8, background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' } }
    : { grid: '#e2e8f0', axis: '#64748b', label: '#334155', tooltip: { fontSize: 12, borderRadius: 8, background: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a' } };
}
