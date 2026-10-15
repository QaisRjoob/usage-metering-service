import { NavLink } from 'react-router';
import { Bot, Building2, FileClock, Gauge, LayoutDashboard, Layers, PlayCircle, type LucideIcon } from 'lucide-react';
import { routePaths } from '@/routing/routePaths';
import { cn } from '@/utils/formatUtils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  scope: 'Operator' | 'Account' | 'Either';
}

const sections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Operator',
    items: [
      { to: routePaths.dashboard, label: 'Dashboard', icon: LayoutDashboard, scope: 'Operator' },
      { to: routePaths.accounts, label: 'Accounts', icon: Building2, scope: 'Operator' },
    ],
  },
  {
    title: 'Account',
    items: [
      { to: routePaths.plans, label: 'Plans', icon: Layers, scope: 'Account' },
      { to: routePaths.quotas, label: 'Quotas', icon: Gauge, scope: 'Account' },
      { to: routePaths.clientDemo, label: 'Client Demo', icon: PlayCircle, scope: 'Account' },
    ],
  },
  {
    title: 'Insights',
    items: [
      { to: routePaths.usage, label: 'Usage history', icon: FileClock, scope: 'Either' },
      { to: routePaths.aiAdvisor, label: 'AI Advisor', icon: Bot, scope: 'Either' },
    ],
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
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
                  end={item.to === routePaths.dashboard}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                    )
                  }
                >
                  <item.icon className="size-4" aria-hidden="true" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
