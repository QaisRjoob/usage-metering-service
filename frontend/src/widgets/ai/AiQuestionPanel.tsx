import type { FormEvent } from 'react';
import { Send } from 'lucide-react';
import { AI_QUESTION_MAX_LENGTH } from '@/models/ai-advisor';
import { Button } from '@/widgets/ui/Button';
import { Field, Textarea } from '@/widgets/ui/Field';

interface AiQuestionPanelProps {
  question: string;
  onChange: (question: string) => void;
  onSubmit: () => void;
  pending: boolean;
  error: string | null;
}

export function AiQuestionPanel({ question, onChange, onSubmit, pending, error }: AiQuestionPanelProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Your question" error={error ?? undefined} hint={`${question.length}/${AI_QUESTION_MAX_LENGTH} characters`}>
        {(props) => (
          <Textarea
            {...props}
            rows={3}
            maxLength={AI_QUESTION_MAX_LENGTH}
            value={question}
            onChange={(event) => onChange(event.target.value)}
            placeholder="e.g. Which users are closest to their individual limits?"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onSubmit();
            }}
          />
        )}
      </Field>
      <Button type="submit" loading={pending}>
        <Send className="size-4" aria-hidden="true" /> Ask
      </Button>
    </form>
  );
}
