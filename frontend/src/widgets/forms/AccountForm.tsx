import { useState, type FormEvent } from 'react';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import type { CreateAccountRequest, CreateAccountResponse } from '@/models/account';
import { createAccountSchema } from '@/models/account';
import { PREDEFINED_PLAN_IDS } from '@/models/plan';
import { describeError, fieldErrorsFrom } from '@/services/api/apiErrors';
import { validateWith, type FieldErrors } from '@/utils/validationUtils';
import { Button } from '@/widgets/ui/Button';
import { Field, Input, Select } from '@/widgets/ui/Field';

/** Predefined account plans. Their ids are fixed by the seed (same ids in mock and API). */
const ACCOUNT_PLAN_OPTIONS = [
  { id: PREDEFINED_PLAN_IDS.starter, label: 'Starter — 10,000 units/month, 100/request' },
  { id: PREDEFINED_PLAN_IDS.pro, label: 'Pro — 100,000 units/month, 500/request' },
];

interface AccountFormProps {
  onSubmit: (request: CreateAccountRequest) => void;
  submitting: boolean;
  error: unknown;
  onCancel: () => void;
}

export function AccountForm({ onSubmit, submitting, error, onCancel }: AccountFormProps) {
  const [name, setName] = useState('');
  const [planId, setPlanId] = useState<string>(PREDEFINED_PLAN_IDS.starter);
  const [errors, setErrors] = useState<FieldErrors>({});
  const serverErrors = fieldErrorsFrom(error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateWith(createAccountSchema, { name, planId });
    if (!result.success) return setErrors(result.errors);
    setErrors({});
    onSubmit(result.data);
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Account name" error={errors.name ?? serverErrors.name} hint="The calling application or company.">
        {(props) => <Input {...props} value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoFocus />}
      </Field>
      <Field label="Account plan" hint="New accounts start on a predefined plan. Custom plans are created by the account itself.">
        {(props) => (
          <Select {...props} value={planId} onChange={(event) => setPlanId(event.target.value)}>
            {ACCOUNT_PLAN_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {Boolean(error) && Object.keys(serverErrors).length === 0 && (
        <p role="alert" className="text-sm text-rose-600">
          {describeError(error).message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          Create account
        </Button>
      </div>
    </form>
  );
}

/** Shows the raw API key exactly once, with a copy button and a clear warning. */
export function IssuedApiKey({ result, onDone }: { result: CreateAccountResponse; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.apiKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Account <strong>{result.account.name}</strong> was created on the <strong>{result.account.quota.planName}</strong> plan.
      </p>
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>Copy this API key now and give it to the company. It is stored only as a hash and cannot be shown again. The company signs in to its own portal with it.</p>
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-emerald-300" aria-label="Issued API key">
          {result.apiKey}
        </code>
        <Button variant="outline" size="sm" onClick={copy} aria-label="Copy API key">
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onDone}>I have stored the key</Button>
      </div>
    </div>
  );
}
