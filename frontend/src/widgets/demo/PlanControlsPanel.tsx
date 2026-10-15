import { useState, type FormEvent } from 'react';
import type { CurrentAccountResponse } from '@/models/account';
import type { Plan } from '@/models/plan';
import type { UserWithQuota } from '@/models/user';
import { describeError } from '@/services/api/apiErrors';
import { formatUnits } from '@/utils/numberUtils';
import { Button } from '@/widgets/ui/Button';
import { Field, Input, Select } from '@/widgets/ui/Field';

interface MutationLike<TVariables> {
  mutate: (variables: TVariables) => void;
  isPending: boolean;
  isSuccess: boolean;
  error: unknown;
}

interface PlanControlsPanelProps {
  users: UserWithQuota[];
  plans: Plan[];
  currentAccount: CurrentAccountResponse | null;
  assignUserPlan: MutationLike<{ userId: string; planId: string }>;
  updatePlan: MutationLike<{ planId: string; request: { monthlyAllowance: number } }>;
}

/**
 * Stands in for "another tab": the account's own configuration calls (assign plan / edit plan).
 * The client panel next to it is not touched - only the outcome of its next request changes.
 */
export function PlanControlsPanel({ users, plans, currentAccount, assignUserPlan, updatePlan }: PlanControlsPanelProps) {
  const userPlans = plans.filter((plan) => plan.scope === 'user');
  const [userId, setUserId] = useState('');
  const [planId, setPlanId] = useState('');
  const targetUser = users.find((user) => user.externalUserId === (userId || users[0]?.externalUserId));
  const effectivePlanId = planId || userPlans.find((plan) => plan.id !== targetUser?.quota.planId)?.id || '';

  const accountPlan = currentAccount?.plan;
  const [allowance, setAllowance] = useState('');
  const allowanceValue = Number(allowance);
  const allowanceValid = allowance.trim() !== '' && Number.isInteger(allowanceValue) && allowanceValue >= 0;

  const switchPlan = (event: FormEvent) => {
    event.preventDefault();
    if (targetUser && effectivePlanId) assignUserPlan.mutate({ userId: targetUser.externalUserId, planId: effectivePlanId });
  };
  const editAllowance = (event: FormEvent) => {
    event.preventDefault();
    if (accountPlan && !accountPlan.isPredefined && allowanceValid) updatePlan.mutate({ planId: accountPlan.id, request: { monthlyAllowance: allowanceValue } });
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form onSubmit={switchPlan} className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Switch a user&apos;s plan</h3>
        <Field label="User">
          {(props) => (
            <Select {...props} value={targetUser?.externalUserId ?? ''} onChange={(event) => setUserId(event.target.value)}>
              {users.map((user) => (
                <option key={user.id} value={user.externalUserId}>
                  {user.externalUserId} · now {user.quota.planName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="New user plan">
          {(props) => (
            <Select {...props} value={effectivePlanId} onChange={(event) => setPlanId(event.target.value)}>
              {userPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} — {formatUnits(plan.currentVersion.monthlyAllowance)}/month, {formatUnits(plan.currentVersion.maxUnitsPerRequest)}/request
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="submit" variant="secondary" size="sm" loading={assignUserPlan.isPending} disabled={!targetUser || !effectivePlanId || effectivePlanId === targetUser.quota.planId}>
          Switch plan
        </Button>
        {assignUserPlan.isSuccess && <p className="text-xs text-emerald-700">Plan switched. Consumed units were kept; the next request uses the new limits.</p>}
        {Boolean(assignUserPlan.error) && <p role="alert" className="text-xs text-rose-600">{describeError(assignUserPlan.error).message}</p>}
      </form>

      <form onSubmit={editAllowance} className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Edit the shared account plan</h3>
        {!accountPlan ? (
          <p className="text-xs text-slate-500">Loading account plan…</p>
        ) : accountPlan.isPredefined ? (
          <p className="text-xs text-slate-500">
            This account is on the predefined <strong>{accountPlan.name}</strong> plan, which is read-only. Create a custom account plan on the Plans page to edit limits.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              <strong>{accountPlan.name}</strong> v{accountPlan.currentVersion.version}: {formatUnits(accountPlan.currentVersion.monthlyAllowance)} units/month,{' '}
              {formatUnits(accountPlan.currentVersion.maxUnitsPerRequest)}/request. Saving creates a new version.
            </p>
            <Field label="New monthly allowance" error={allowance && !allowanceValid ? 'Enter a whole number ≥ 0.' : undefined}>
              {(props) => <Input {...props} type="number" min={0} step={1} placeholder={String(accountPlan.currentVersion.monthlyAllowance * 10)} value={allowance} onChange={(event) => setAllowance(event.target.value)} />}
            </Field>
            <Button type="submit" variant="secondary" size="sm" loading={updatePlan.isPending} disabled={!allowanceValid}>
              Save allowance
            </Button>
            {updatePlan.isSuccess && <p className="text-xs text-emerald-700">Saved as a new plan version. It applies to the next request.</p>}
            {Boolean(updatePlan.error) && <p role="alert" className="text-xs text-rose-600">{describeError(updatePlan.error).message}</p>}
          </>
        )}
      </form>
    </div>
  );
}
