import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2, Send } from 'lucide-react';
import { PREDEFINED_PLAN_IDS, submitSignupRequestSchema, type SubmitSignupRequest, type SubmitSignupResponse } from '@/contracts';
import { useServices } from '@/providers/ServicesProvider';
import { routePaths } from '@/routing/routePaths';
import { ApiError, describeError } from '@/services/api/apiErrors';
import { cn } from '@/utils/formatUtils';
import { signupSession } from '@/utils/signupSession';
import { AuthLayout } from '@/widgets/layout/AuthLayout';
import { Button } from '@/widgets/ui/Button';
import { Card } from '@/widgets/ui/Card';
import { CopyField } from '@/widgets/ui/CopyField';
import { Field, Input, Textarea } from '@/widgets/ui/Field';

const PLAN_CHOICES = [
  { id: PREDEFINED_PLAN_IDS.starter, name: 'Starter', text: 'A shared monthly pool for small teams.' },
  { id: PREDEFINED_PLAN_IDS.pro, name: 'Pro', text: 'Higher limits for high-volume applications.' },
];

type FormState = { companyName: string; contactName: string; contactEmail: string; planId: string; useCase: string };

/** Public: a company asks for an account. The operator approves or denies the request. */
export default function SignupView() {
  const { signup } = useServices();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>({ companyName: '', contactName: '', contactEmail: '', planId: PREDEFINED_PLAN_IDS.starter, useCase: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const submit = useMutation({
    mutationFn: (request: SubmitSignupRequest) => signup.submit(request),
    onSuccess: (result) => signupSession.save({ requestId: result.requestId, claimCode: result.claimCode }),
  });

  const set = (key: keyof FormState, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
    if (submit.isError) submit.reset();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = submitSignupRequestSchema.safeParse({ ...form, useCase: form.useCase || undefined });
    if (!parsed.success) {
      const next: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof FormState] ??= issue.message;
      setErrors(next);
      return;
    }
    submit.mutate(parsed.data);
  };

  if (submit.data) return <Submitted result={submit.data} onCheck={() => navigate(routePaths.signupStatus)} />;

  // Server-side field errors (400) are shown under their fields; anything else above the button.
  const serverError = submit.error ? describeError(submit.error) : null;
  const fieldErrors = submit.error instanceof ApiError && Array.isArray(submit.error.details) ? (submit.error.details as { path: string; message: string }[]) : [];
  const errorOf = (key: keyof FormState) => errors[key] ?? fieldErrors.find((issue) => issue.path === key)?.message;

  return (
    <AuthLayout
      wide
      title="Request access"
      subtitle="Tell us about your company. An operator reviews every request; once approved you collect your API key here."
      footer={
        <span>
          Already have a key?{' '}
          <Link to={routePaths.login} className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>{' '}
          ·{' '}
          <Link to={routePaths.signupStatus} className="font-medium text-brand-700 hover:underline">
            Check a request
          </Link>
        </span>
      }
    >
      <Card className="p-6 shadow-sm">
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <Field label="Company name" error={errorOf('companyName')}>
            {(props) => <Input {...props} autoComplete="organization" placeholder="Acme Legal" value={form.companyName} onChange={(event) => set('companyName', event.target.value)} autoFocus />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Your name" error={errorOf('contactName')}>
              {(props) => <Input {...props} autoComplete="name" placeholder="Dana Lee" value={form.contactName} onChange={(event) => set('contactName', event.target.value)} />}
            </Field>
            <Field label="Work email" error={errorOf('contactEmail')}>
              {(props) => <Input {...props} type="email" autoComplete="email" placeholder="dana@acme.com" value={form.contactEmail} onChange={(event) => set('contactEmail', event.target.value)} />}
            </Field>
          </div>

          <fieldset>
            <legend className="mb-1.5 block text-xs font-medium text-slate-700">Plan</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {PLAN_CHOICES.map((plan) => {
                const selected = form.planId === plan.id;
                return (
                  <label
                    key={plan.id}
                    className={cn(
                      'flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors',
                      selected ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <input type="radio" name="plan" value={plan.id} checked={selected} onChange={() => set('planId', plan.id)} className="mt-0.5 accent-[#4f46e5]" />
                    <span>
                      <span className="block text-sm font-medium text-slate-900">{plan.name}</span>
                      <span className="block text-xs text-slate-500">{plan.text}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">The operator can adjust the plan when approving.</p>
          </fieldset>

          <Field label="What will you use it for? (optional)" error={errorOf('useCase')}>
            {(props) => <Textarea {...props} rows={3} maxLength={1000} placeholder="e.g. OCR for contracts, about 40 users" value={form.useCase} onChange={(event) => set('useCase', event.target.value)} />}
          </Field>

          {serverError && fieldErrors.length === 0 && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {serverError.message}
            </p>
          )}

          <Button type="submit" className="h-11 w-full" loading={submit.isPending}>
            <Send className="size-4" aria-hidden="true" /> Send request
          </Button>
        </form>
      </Card>
    </AuthLayout>
  );
}

function Submitted({ result, onCheck }: { result: SubmitSignupResponse; onCheck: () => void }) {
  return (
    <AuthLayout wide title="Request sent" subtitle="An operator will review it. Keep the two values below: you need both to follow the request and to collect your API key.">
      <Card className="space-y-5 p-6 shadow-sm">
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          Your request is waiting for review.
        </div>
        <CopyField label="Request ID" value={result.requestId} />
        <CopyField label="Claim code" value={result.claimCode} secret />
        <p className="flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          The claim code is shown only once and works like a password. Store it somewhere safe.
        </p>
        <Button className="h-11 w-full" onClick={onCheck}>
          Check my request <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </Card>
    </AuthLayout>
  );
}
