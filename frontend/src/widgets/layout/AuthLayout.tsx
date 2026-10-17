import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BarChart3, Gauge, Layers, ShieldCheck } from 'lucide-react';
import { routePaths } from '@/routing/routePaths';
import { isMockMode } from '@/services/api/apiConfig';
import { Badge } from '@/widgets/ui/Badge';
import { ThemeToggle } from '@/widgets/ui/ThemeToggle';

const features = [
  { icon: Layers, title: 'Two-level quotas', text: 'Every request must fit both the user’s plan and the company’s shared plan.' },
  { icon: ShieldCheck, title: 'Exactly-once metering', text: 'Idempotent requests: a retry never consumes units twice.' },
  { icon: Gauge, title: 'Live usage insight', text: 'Utilization, rejections and trends per company and per user.' },
];

function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link to={routePaths.login} className="flex items-center gap-2.5">
      <span className={inverted ? 'flex size-9 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/25' : 'flex size-9 items-center justify-center rounded-xl bg-solid-brand text-white'}>
        <BarChart3 className="size-5" aria-hidden="true" />
      </span>
      <span className={inverted ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-slate-900'}>Usage Metering</span>
    </Link>
  );
}

/**
 * Public pages (sign in, request access, request status): a brand panel on large screens and the
 * page content in a centered column, with the theme switch always at hand.
 */
export function AuthLayout({ title, subtitle, children, footer, wide = false }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Fixed colours: the brand panel looks the same in both themes. */}
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-[linear-gradient(140deg,#4f46e5_0%,#3730a3_55%,#1e1b4b_100%)] p-10 text-white lg:flex">
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-[#818cf8]/20 blur-3xl" />
        <Logo inverted />
        <div className="relative space-y-8">
          <div>
            <h2 className="text-3xl leading-tight font-semibold tracking-tight">Meter usage. Enforce quotas. Stay in control.</h2>
            <p className="mt-3 max-w-sm text-sm text-white/75">One service for every company you serve, with fair shared limits and a clear record of each request.</p>
          </div>
          <ul className="space-y-5">
            {features.map((feature) => (
              <li key={feature.title} className="flex gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <feature.icon className="size-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{feature.title}</span>
                  <span className="block text-xs text-white/70">{feature.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/55">Usage Metering &amp; Quota Service</p>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <span className="lg:invisible">
            <Logo />
          </span>
          <div className="flex items-center gap-2">
            {isMockMode && <Badge tone="warning">MOCK DATA</Badge>}
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-1 items-start justify-center px-5 pt-4 pb-12 sm:items-center sm:px-8">
          <div className={wide ? 'w-full max-w-xl' : 'w-full max-w-md'}>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
              {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
            </div>
            {children}
            {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
