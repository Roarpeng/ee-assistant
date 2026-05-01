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
            i < currentIdx ? 'bg-green-500' : i === currentIdx && stage !== 'done' ? 'bg-blue-500 animate-pulse' : i === currentIdx ? 'bg-green-500' : 'bg-gray-300'
          }`} />
          <span className={`text-[10px] ${i <= currentIdx ? 'text-gray-700' : 'text-gray-300'}`}>
            {s.label}
          </span>
          {i < steps.length - 1 && <div className={`w-4 h-px ${i < currentIdx ? 'bg-green-500' : 'bg-gray-300'}`} />}
        </div>
      ))}
    </div>
  );
}
