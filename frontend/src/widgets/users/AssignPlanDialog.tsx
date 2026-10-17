import { useState, type FormEvent } from 'react';
import type { Plan, PlanScope } from '@/models/plan';
import type { QuotaSnapshot } from '@/models/quota';
import { describeError } from '@/services/api/apiErrors';
import { formatUnits } from '@/utils/numberUtils';
import { Button } from '@/widgets/ui/Button';
import { Dialog } from '@/widgets/ui/Dialog';
import { Field, Select } from '@/widgets/ui/Field';

interface AssignPlanDialogProps {
  open: boolean;
  onClose: () => void;
  /** Who receives the plan, e.g. 'user "ahmad"' or 'the account'. */
  subjectLabel: string;
  scope: PlanScope;
  plans: Plan[];
  current: QuotaSnapshot;
  submitting: boolean;
  error: unknown;
  onAssign: (planId: string) => void;
}

/** Switches a plan. Consumed units are kept; only the limits change for new requests. */
export function AssignPlanDialog({ open, onClose, subjectLabel, scope, plans, current, submitting, error, onAssign }: AssignPlanDialogProps) {
  const options = plans.filter((plan) => plan.scope === scope);
  const [planId, setPlanId] = useState(current.planId);
  const selected = options.find((plan) => plan.id === planId);
  const willBeOver = selected ? current.consumed > selected.currentVersion.monthlyAllowance : false;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (planId && planId !== current.planId) onAssign(planId);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Change plan for ${subjectLabel}`}
      description={`Only ${scope} plans can be assigned here. Units already consumed this month are kept; the new limits apply to the next request.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="assign-plan-form" loading={submitting} disabled={!planId || planId === current.planId}>
            Switch plan
          </Button>
        </>
      }
    >
      <form id="assign-plan-form" onSubmit={submit} className="space-y-4">
        <Field label={`${scope === 'account' ? 'Account' : 'User'} plan`}>
          {(props) => (
            <Select {...props} value={planId} onChange={(event) => setPlanId(event.target.value)}>
              {options.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} {plan.isPredefined ? '(predefined)' : '(custom)'} — {formatUnits(plan.currentVersion.monthlyAllowance)}/month, {formatUnits(plan.currentVersion.maxUnitsPerRequest)}/request
                </option>
              ))}
            </Select>
          )}
        </Field>
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          Currently on <strong>{current.planName}</strong> with {formatUnits(current.consumed)} units consumed this month.
        </p>
        {willBeOver && (
          <p role="alert" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            {formatUnits(current.consumed)} units are already consumed, which exceeds the new plan&apos;s monthly allowance. Remaining will show 0 and further requests are rejected at this level until the
            allowance increases or a new month starts.
          </p>
        )}
        {Boolean(error) && (
          <p role="alert" className="text-sm text-rose-600">
            {describeError(error).message}
          </p>
        )}
      </form>
    </Dialog>
  );
}
