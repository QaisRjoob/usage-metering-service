import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/utils/formatUtils';

/** A value shown in monospace with a copy button (request ids, claim codes, API keys). */
export function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-slate-600">{label}</span>
      <div className={cn('flex items-center gap-2 rounded-lg border p-1.5 pl-3', secret ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50')}>
        <code className="min-w-0 flex-1 font-mono text-xs break-all text-slate-800" aria-label={label}>
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-surface px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          {copied ? <Check className="size-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
