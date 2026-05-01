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

      <div className="flex gap-2 px-4 py-2 bg-white border-b border-gray-200">
        {(['diagram', 'bom', 'code'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveCanvasTab(tab)}
            className={`px-3 py-1 text-sm rounded ${
              activeCanvasTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
