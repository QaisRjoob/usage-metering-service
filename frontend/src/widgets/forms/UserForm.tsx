import { useState, type FormEvent } from 'react';
import type { Plan } from '@/models/plan';
import { PREDEFINED_PLAN_IDS } from '@/models/plan';
import type { CreateUserRequest } from '@/models/user';
import { createUserSchema } from '@/models/user';
import { describeError, fieldErrorsFrom } from '@/services/api/apiErrors';
import { formatUnits } from '@/utils/numberUtils';
import { optionalText, validateWith, type FieldErrors } from '@/utils/validationUtils';
import { Button } from '@/widgets/ui/Button';
import { Field, Input, Select } from '@/widgets/ui/Field';

interface UserFormProps {
  plans: Plan[];
  submitting: boolean;
  error: unknown;
  onSubmit: (request: CreateUserRequest) => void;
  onCancel: () => void;
}

export function UserForm({ plans, submitting, error, onSubmit, onCancel }: UserFormProps) {
  const userPlans = plans.filter((plan) => plan.scope === 'user');
  const [externalUserId, setExternalUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [planId, setPlanId] = useState<string>(PREDEFINED_PLAN_IDS.basic);
  const [errors, setErrors] = useState<FieldErrors>({});
  const serverErrors = fieldErrorsFrom(error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateWith(createUserSchema, { externalUserId, displayName: optionalText(displayName), planId });
    if (!result.success) return setErrors(result.errors);
    setErrors({});
    onSubmit(result.data);
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="User id" hint="Your application's identifier for this user (unique within the account)." error={errors.externalUserId ?? serverErrors.externalUserId}>
        {(props) => <Input {...props} value={externalUserId} onChange={(event) => setExternalUserId(event.target.value)} maxLength={128} autoFocus />}
      </Field>
      <Field label="Display name (optional)" error={errors.displayName}>
        {(props) => <Input {...props} value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} />}
      </Field>
      <Field label="User plan" hint="Defaults to Basic.">
        {(props) => (
          <Select {...props} value={planId} onChange={(event) => setPlanId(event.target.value)}>
            {userPlans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} — {formatUnits(plan.currentVersion.monthlyAllowance)}/month, {formatUnits(plan.currentVersion.maxUnitsPerRequest)}/request
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
          Register user
        </Button>
      </div>
    </form>
  );
}
