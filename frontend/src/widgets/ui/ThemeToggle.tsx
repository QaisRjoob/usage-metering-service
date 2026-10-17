import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/providers/themeContext';
import { cn } from '@/utils/formatUtils';

/** Switches between light and dark; the choice is remembered in this browser. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-surface text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900',
        className,
      )}
    >
      {dark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </button>
  );
}
