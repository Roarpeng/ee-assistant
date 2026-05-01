import { useState, DragEvent } from 'react';

export function FileDropZone({ onFiles }: { onFiles: (files: FileList) => void }) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-lg p-4 text-center text-sm transition-colors ${
        dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
      }`}
    >
      {dragging ? 'Drop files here' : 'Drag & drop PDFs here'}
    </div>
  );
}
