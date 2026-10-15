import type { FieldErrors } from '@/utils/validationUtils';
import { Field, Input } from '@/widgets/ui/Field';

/** Text drafts so the inputs can be empty while editing; parsed and validated on submit. */
export interface QuotaDraft {
  monthlyAllowance: string;
  maxUnitsPerRequest: string;
}

/** The two rule types every plan defines. */
export function QuotaForm({ value, onChange, errors }: { value: QuotaDraft; onChange: (next: QuotaDraft) => void; errors: FieldErrors }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Monthly allowance (units)" hint="Total units per UTC calendar month. 0 blocks all usage." error={errors.monthlyAllowance}>
        {(props) => (
          <Input
            {...props}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={value.monthlyAllowance}
            onChange={(event) => onChange({ ...value, monthlyAllowance: event.target.value })}
          />
        )}
      </Field>
      <Field label="Max units per request" hint="Largest amount a single request may consume." error={errors.maxUnitsPerRequest}>
        {(props) => (
          <Input
            {...props}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={value.maxUnitsPerRequest}
            onChange={(event) => onChange({ ...value, maxUnitsPerRequest: event.target.value })}
          />
        )}
      </Field>
    </div>
  );
}
