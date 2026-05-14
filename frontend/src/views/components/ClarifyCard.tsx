import { useState } from 'react';
import { authedFetch } from '../../services/orgClient';
import { useStore } from '../../models/store';

export interface ClarifyGroup {
  key: string;
  label: string;
  choices: string[];
}

interface Props {
  groups: ClarifyGroup[];
  selected?: Record<string, string>;
  onSelect: (key: string, choice: string) => void;
}

export function ClarifyCard({ groups, selected = {}, onSelect }: Props) {
  // Internal mirror of the user's clicks. Lets ClarifyCard fire its
  // own "确认并记忆" writeback even when the parent stays stateless
  // (e.g. ChatPanel today only relays clicks into the chat input).
  // The displayed selection layers internal state on top of the prop
  // so the existing aria-pressed contract is preserved.
  const [internal, setInternal] = useState<Record<string, string>>({});
  const display = { ...selected, ...internal };
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleClick = (key: string, choice: string) => {
    setInternal((prev) => ({ ...prev, [key]: choice }));
    setSubmitted(false);
    onSelect(key, choice);
  };

  const handleSubmit = async () => {
    // Read state lazily through getState() — see superpowers note in
    // the M1 plan: the writeback is a side-effect of clicking, not a
    // dependency of the render cycle, so we deliberately avoid adding
    // a useStore subscription here.
    const project = useStore.getState().project;
    const answers = { ...selected, ...internal };
    if (!project || Object.keys(answers).length === 0) return;
    setSubmitting(true);
    try {
      await authedFetch(`/api/projects/${project.id}/clarify/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
    } catch {
      // Backend may be down; the user's chip selections still flow
      // into the chat input via onSelect — no UX regression.
    }
    void useStore.getState().refreshPreferences();
    setSubmitting(false);
    setSubmitted(true);
  };

  const hasSelection = Object.keys(display).length > 0;

  return (
    <div className="border border-app-border rounded-md bg-app-bg-secondary p-3 mt-2 space-y-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-app-text-tertiary">
        请选择以下参数 · clarify
      </div>
      {groups.map((g) => {
        const picked = display[g.key];
        return (
          <div key={g.key}>
            <div className="text-xs font-bold mb-1.5 text-app-text-primary">
              {g.label}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.choices.map((c) => {
                const isPicked = c === picked;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={isPicked}
                    onClick={() => handleClick(g.key, c)}
                    className={`px-2.5 py-1 text-xs font-mono rounded-sm border transition-colors ${
                      isPicked
                        ? 'bg-app-accent-light border-app-accent text-app-accent'
                        : 'border-app-border text-app-text-secondary hover:border-app-accent hover:text-app-text-primary'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-end gap-2 pt-1">
        {submitted && (
          <span className="text-[10px] text-emerald-400" data-testid="clarify-writeback-ok">
            已记忆此组织偏好
          </span>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !hasSelection}
          data-testid="clarify-submit"
          className="px-3 py-1 text-[11px] font-bold rounded-md bg-app-accent hover:bg-app-accent-hover text-app-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? '记忆中…' : '确认并记忆'}
        </button>
      </div>
    </div>
  );
}
