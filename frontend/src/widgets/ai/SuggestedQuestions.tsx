import { Sparkles } from 'lucide-react';
import { SUGGESTED_QUESTIONS } from '@/models/ai-advisor';

export function SuggestedQuestions({ onPick, disabled }: { onPick: (question: string) => void; disabled: boolean }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-500">Suggested questions</p>
      <ul className="flex flex-wrap gap-2">
        {SUGGESTED_QUESTIONS.map((question) => (
          <li key={question}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(question)}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
            >
              <Sparkles className="size-3 text-brand-500" aria-hidden="true" />
              {question}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
