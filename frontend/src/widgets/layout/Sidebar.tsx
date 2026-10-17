import { NavLink } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/formatUtils';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Match only the exact path (for section roots like /admin). */
  end?: boolean;
  /** A count shown next to the label (e.g. requests waiting for a decision); hidden when 0. */
  badge?: number;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export function Sidebar({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-6 px-3 py-4">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{section.title}</p>
          <ul className="mt-2 space-y-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                    )
                  }
                >
                  <item.icon className="size-4" aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge ? (
                    <span className="rounded-full bg-solid-brand px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white tabular-nums" aria-label={`${item.badge} waiting`}>
                      {item.badge}
                    </span>
                  ) : null}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
