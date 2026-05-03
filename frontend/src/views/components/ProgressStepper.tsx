import { useStore } from '../../models/store';

const steps: { stage: string; label: string }[] = [
  { stage: 'idle', label: 'Start' },
  { stage: 'analyzing', label: 'Requirements' },
  { stage: 'selecting', label: 'Selection' },
  { stage: 'generating_schematic', label: 'Schematic' },
  { stage: 'generating_code', label: 'ST Code' },
  { stage: 'done', label: 'Done' },
];

export function ProgressStepper() {
  const { stage } = useStore();
  const currentIdx = steps.findIndex((s) => s.stage === stage);

  return (
    <div className="flex items-center gap-1 px-4 py-2">
      {steps.map((s, i) => (
        <div key={s.stage} className="flex items-center gap-1">
          <div className={`w-2.5 h-2.5 rounded-full ${
            i < currentIdx ? 'bg-[var(--color-success)]' : i === currentIdx && stage !== 'done' ? 'bg-[var(--color-accent)] animate-pulse' : i === currentIdx ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]'
          }`} />
          <span className={`text-[10px] ${i <= currentIdx ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'}`}>
            {s.label}
          </span>
          {i < steps.length - 1 && <div className={`h-0.5 flex-1 rounded ${i < currentIdx ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]'}`} />}
        </div>
      ))}
    </div>
  );
}
