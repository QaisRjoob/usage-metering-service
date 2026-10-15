import { useState, type FormEvent } from 'react';
import type { CreatePlanRequest, Plan, PlanScope, UpdatePlanRequest } from '@/models/plan';
import { createPlanSchema, updatePlanSchema } from '@/models/plan';
import type { QuotaSnapshot } from '@/models/quota';
import { describeError, fieldErrorsFrom } from '@/services/api/apiErrors';
import { formatUnits } from '@/utils/numberUtils';
import { optionalText, validateWith, type FieldErrors } from '@/utils/validationUtils';
import { ConfirmDialog } from '@/widgets/common/ConfirmDialog';
import { Button } from '@/widgets/ui/Button';
import { Field, Input, Select, Textarea } from '@/widgets/ui/Field';
import { QuotaForm, type QuotaDraft } from './QuotaForm';

interface PlanFormProps {
  /** Present when editing; absent when creating. */
  plan?: Plan;
  /** The connected account's quota, used to warn about reductions below current usage. */
  accountQuota: QuotaSnapshot | null;
  submitting: boolean;
  error: unknown;
  onCreate: (request: CreatePlanRequest) => void;
  onUpdate: (request: UpdatePlanRequest) => void;
  onCancel: () => void;
}

export function PlanForm({ plan, accountQuota, submitting, error, onCreate, onUpdate, onCancel }: PlanFormProps) {
  const [name, setName] = useState(plan?.name ?? '');
  const [description, setDescription] = useState(plan?.description ?? '');
  const [scope, setScope] = useState<PlanScope>(plan?.scope ?? 'user');
  const [limits, setLimits] = useState<QuotaDraft>({
    monthlyAllowance: plan ? String(plan.currentVersion.monthlyAllowance) : '',
    maxUnitsPerRequest: plan ? String(plan.currentVersion.maxUnitsPerRequest) : '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pendingUpdate, setPendingUpdate] = useState<UpdatePlanRequest | null>(null);
  const serverErrors = fieldErrorsFrom(error);

  const parsedLimits = {
    monthlyAllowance: limits.monthlyAllowance.trim() === '' ? Number.NaN : Number(limits.monthlyAllowance),
    maxUnitsPerRequest: limits.maxUnitsPerRequest.trim() === '' ? Number.NaN : Number(limits.maxUnitsPerRequest),
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!plan) {
      const result = validateWith(createPlanSchema, { name, description: optionalText(description), scope, ...parsedLimits });
      if (!result.success) return setErrors(result.errors);
      setErrors({});
      return onCreate(result.data);
    }
    const draft: UpdatePlanRequest = {
      name: name !== plan.name ? name : undefined,
      description: description !== (plan.description ?? '') ? optionalText(description) ?? null : undefined,
      monthlyAllowance: parsedLimits.monthlyAllowance !== plan.currentVersion.monthlyAllowance ? parsedLimits.monthlyAllowance : undefined,
      maxUnitsPerRequest: parsedLimits.maxUnitsPerRequest !== plan.currentVersion.maxUnitsPerRequest ? parsedLimits.maxUnitsPerRequest : undefined,
    };
    const result = validateWith(updatePlanSchema, draft);
    if (!result.success) return setErrors(result.errors);
    setErrors({});
    // A reduction is impactful: ask for confirmation first.
    if (result.data.monthlyAllowance !== undefined && result.data.monthlyAllowance < plan.currentVersion.monthlyAllowance) {
      return setPendingUpdate(result.data);
    }
    onUpdate(result.data);
  };

  const reductionBelowAccountUsage =
    pendingUpdate?.monthlyAllowance !== undefined && plan?.scope === 'account' && accountQuota?.planId === plan.id && accountQuota.consumed > pendingUpdate.monthlyAllowance;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Name" error={errors.name ?? serverErrors.name}>
        {(props) => <Input {...props} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus />}
      </Field>
      <Field label="Description (optional)" error={errors.description}>
        {(props) => <Textarea {...props} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />}
      </Field>
      <Field label="Scope" hint={plan ? 'Scope cannot change after creation.' : 'Account plans are shared by all users; user plans are individual.'}>
        {(props) => (
          <Select {...props} value={scope} onChange={(event) => setScope(event.target.value as PlanScope)} disabled={Boolean(plan)}>
            <option value="user">User plan (individual limits)</option>
            <option value="account">Account plan (shared limits)</option>
          </Select>
        )}
      </Field>
      <QuotaForm value={limits} onChange={setLimits} errors={{ ...serverErrors, ...errors }} />
      {plan && <p className="text-xs text-slate-500">Changing a limit creates version {plan.currentVersion.version + 1}. New requests use it immediately; past records keep the version that governed them.</p>}
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
          {plan ? 'Save changes' : 'Create plan'}
        </Button>
      </div>

      <ConfirmDialog
        open={pendingUpdate !== null}
        title="Reduce monthly allowance?"
        tone="danger"
        confirmLabel="Reduce allowance"
        loading={submitting}
        onCancel={() => setPendingUpdate(null)}
        onConfirm={() => {
          if (pendingUpdate) onUpdate(pendingUpdate);
          setPendingUpdate(null);
        }}
        description={
          <div className="space-y-2">
            <p>
              The monthly allowance goes from {formatUnits(plan?.currentVersion.monthlyAllowance)} to {formatUnits(pendingUpdate?.monthlyAllowance)} for every account or user on this plan.
            </p>
            <p>Anyone who already consumed more this month will show 0 remaining and be rejected until the allowance increases or a new month starts. Consumed units are never removed.</p>
            {reductionBelowAccountUsage && (
              <p className="font-medium text-rose-700">Your account already consumed {formatUnits(accountQuota?.consumed)} units this month, so it will be over its allowance.</p>
            )}
          </div>
        }
      />
    </form>
  );
}
