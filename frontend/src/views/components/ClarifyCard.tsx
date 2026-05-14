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
  return (
    <div className="border border-app-border rounded-md bg-app-bg-secondary p-3 mt-2 space-y-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-app-text-tertiary">
        请选择以下参数 · clarify
      </div>
      {groups.map((g) => {
        const picked = selected[g.key];
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
                    onClick={() => onSelect(g.key, c)}
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
    </div>
  );
}
