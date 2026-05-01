import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default' });

export function FrameworkDiagram({ code }: { code: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!code || !containerRef.current) return;
    const id = 'mermaid-' + Math.random().toString(36).slice(2);
    containerRef.current.innerHTML = '';

    mermaid.render(id, code).then(({ svg }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = svg;
      }
    }).catch((err) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = `<p class="text-red-500 text-sm">Diagram render error: ${err.message}</p>`;
      }
    });
  }, [code]);

  if (!code) {
    return <div className="flex items-center justify-center h-full text-gray-400">No schematic data. Run selection first.</div>;
  }

  return (
    <div className="w-full h-full overflow-auto p-4 bg-white rounded-lg">
      <div ref={containerRef} className="flex justify-center" />
    </div>
  );
}
