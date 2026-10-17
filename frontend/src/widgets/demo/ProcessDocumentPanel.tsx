import type { FormEvent } from 'react';
import { FileText, RotateCcw } from 'lucide-react';
import type { ConsumeRequest } from '@/models/consumption';
import { DOCUMENT_TYPES } from '@/models/consumption';
import type { UserWithQuota } from '@/models/user';
import { describeError } from '@/services/api/apiErrors';
import { cn } from '@/utils/formatUtils';
import { Button } from '@/widgets/ui/Button';
import { Field, Input, Select } from '@/widgets/ui/Field';

interface ProcessDocumentPanelProps {
  users: UserWithQuota[];
  userId: string;
  onUserChange: (userId: string) => void;
  units: string;
  onUnitsChange: (units: string) => void;
  onProcess: () => void;
  onRetry: () => void;
  lastRequest: ConsumeRequest | null;
  pending: boolean;
  error: unknown;
}

/**
 * The simulated client application. Before "processing" a document it asks the service to consume
 * units for the selected user; it does not know anything about plans or limits.
 */
export function ProcessDocumentPanel({ users, userId, onUserChange, units, onUnitsChange, onProcess, onRetry, lastRequest, pending, error }: ProcessDocumentPanelProps) {
  const parsedUnits = Number(units);
  const unitsValid = Number.isInteger(parsedUnits) && parsedUnits >= 1;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (unitsValid && userId) onProcess();
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="User (on behalf of)">
        {(props) => (
          <Select {...props} value={userId} onChange={(event) => onUserChange(event.target.value)}>
            {users.map((user) => (
              <option key={user.id} value={user.externalUserId}>
                {user.externalUserId}
                {user.displayName ? ` — ${user.displayName}` : ''} · {user.quota.planName}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-slate-700">Document type</legend>
        <div className="grid grid-cols-2 gap-2">
          {DOCUMENT_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              aria-pressed={parsedUnits === type.units}
              onClick={() => onUnitsChange(String(type.units))}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm',
                parsedUnits === type.units ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 bg-surface hover:bg-slate-50',
              )}
            >
              <FileText className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{type.label}</span>
                <span className="text-xs text-slate-500">{type.units} units</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Units" error={!unitsValid ? 'Units must be a positive whole number.' : undefined}>
        {(props) => <Input {...props} type="number" min={1} step={1} value={units} onChange={(event) => onUnitsChange(event.target.value)} />}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending} disabled={!unitsValid || !userId}>
          <FileText className="size-4" aria-hidden="true" /> Process document
        </Button>
        <Button variant="outline" onClick={onRetry} disabled={!lastRequest || pending} title="Re-send the last request with the same requestId">
          <RotateCcw className="size-4" aria-hidden="true" /> Retry same request
        </Button>
      </div>
      {lastRequest && (
        <p className="break-all font-mono text-[11px] text-slate-500">
          Last request: POST /usage/consume {JSON.stringify(lastRequest)}
        </p>
      )}
      {Boolean(error) && (
        <p role="alert" className="text-sm text-rose-600">
          {describeError(error).title}: {describeError(error).message}
        </p>
      )}
    </form>
  );
}
