import Editor from '@monaco-editor/react';
import { useStore } from '../../models/store';

export function STCodeView() {
  const { project } = useStore();

  const modules = project?.codeModules ?? [];
  if (!modules.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        No ST code generated. Run code generation first.
      </div>
    );
  }

  const combinedCode = modules
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => `// ${m.moduleType} — ${m.name}\n${m.code}`)
    .join('\n\n');

  return (
    <div className="flex h-full">
      <div className="w-48 border-r border-gray-200 p-2 overflow-y-auto">
        <h3 className="text-xs font-semibold text-gray-500 mb-2">MODULES</h3>
        {modules.map((m) => (
          <div key={m.id} className="text-xs py-1 px-2 rounded hover:bg-gray-100 cursor-pointer">
            <span className="font-mono text-blue-600">{m.moduleType}</span> {m.name}
          </div>
        ))}
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage="pascal"
          value={combinedCode}
          theme="vs-light"
          options={{
            readOnly: false,
            fontSize: 13,
            minimap: { enabled: false },
            wordWrap: 'on',
          }}
        />
      </div>
    </div>
  );
}
