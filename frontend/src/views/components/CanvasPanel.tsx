import { useStore } from '../../models/store';
import { ExportToolbar } from './ExportToolbar';
import { FrameworkDiagram } from './FrameworkDiagram';
import { BOMTable } from './BOMTable';
import { STCodeView } from './STCodeView';

export function CanvasPanel() {
  const { project, activeCanvasTab, setActiveCanvasTab } = useStore();

  return (
    <div className="flex flex-col h-full">
      <ExportToolbar />

      <div className="flex gap-0 px-4 py-0 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
        {(['diagram', 'bom', 'code'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveCanvasTab(tab)}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeCanvasTab === tab
                ? 'border-[var(--color-accent)] text-[var(--color-text-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {tab === 'diagram' ? 'Schematic' : tab === 'bom' ? 'BOM' : 'ST Code'}
          </button>
        ))}
      </div>

      <div className="flex-1 canvas-content overflow-hidden">
        {activeCanvasTab === 'diagram' && (
          <FrameworkDiagram code={project?.schematic?.mermaidCode ?? null} />
        )}
        {activeCanvasTab === 'bom' && (
          <BOMTable items={project?.bomItems ?? []} />
        )}
        {activeCanvasTab === 'code' && <STCodeView />}
      </div>
    </div>
  );
}
