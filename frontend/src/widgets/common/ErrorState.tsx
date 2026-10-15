import { AlertTriangle } from 'lucide-react';
import { describeError } from '@/services/api/apiErrors';
import { Button } from '@/widgets/ui/Button';
import { cn } from '@/utils/formatUtils';

export function ErrorState({ error, onRetry, className, compact = false }: { error: unknown; onRetry?: () => void; className?: string; compact?: boolean }) {
  const { title, message, retryable, requestId } = describeError(error);
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50/60 text-center', compact ? 'p-4' : 'p-8', className)}>
      <AlertTriangle className="size-6 text-rose-500" aria-hidden="true" />
      <p className="mt-2 text-sm font-semibold text-rose-800">{title}</p>
      <p className="mt-1 max-w-md text-sm text-rose-700">{message}</p>
      {requestId && <p className="mt-1 font-mono text-[11px] text-rose-500">Request ID: {requestId}</p>}
      {onRetry && retryable && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
