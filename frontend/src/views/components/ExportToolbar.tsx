import { useStore } from '../../models/store';
import { exportService } from '../../services/export';

export function ExportToolbar() {
  const { project, activeCanvasTab } = useStore();

  const handleExport = (format: 'svg' | 'excel' | 'pdf' | 'print') => {
    if (!project) return;
    exportService.export(project, format, activeCanvasTab);
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
      <span className="text-xs text-gray-400 mr-2">Export:</span>
      <button onClick={() => handleExport('svg')} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">SVG</button>
      <button onClick={() => handleExport('excel')} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">Excel</button>
      <button onClick={() => handleExport('pdf')} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">PDF</button>
      <button onClick={() => handleExport('print')} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">Print</button>
    </div>
  );
}
