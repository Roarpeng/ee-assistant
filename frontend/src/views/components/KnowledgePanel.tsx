import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { FileDropZone } from './FileDropZone';

interface DocInfo {
  id: string;
  filename: string;
  manufacturer: string;
  categoryTags: string[];
  chunkCount: number;
}

export function KnowledgePanel() {
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [manufacturer, setManufacturer] = useState('');
  const [tags, setTags] = useState('');

  const loadDocs = async () => {
    try {
      const data = await api.listKnowledgeDocs();
      setDocs(data);
    } catch {}
  };

  useEffect(() => { loadDocs(); }, []);

  const handleUpload = async (files: FileList) => {
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      form.append('manufacturer', manufacturer || 'Unknown');
      form.append('category_tags', JSON.stringify(tags.split(',').map((t) => t.trim()).filter(Boolean)));
      try {
        await api.uploadKnowledgeDoc(form);
        await loadDocs();
      } catch (err) {
        console.error('Upload failed', err);
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteKnowledgeDoc(id);
      await loadDocs();
    } catch {}
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-semibold">Knowledge Base</h2>

      <div className="space-y-2">
        <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Manufacturer (e.g. Siemens)"
          value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
        <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Tags: Circuit_Breaker, Contactor"
          value={tags} onChange={(e) => setTags(e.target.value)} />
        <FileDropZone onFiles={handleUpload} />
      </div>

      <div className="space-y-2">
        {docs.map((d) => (
          <div key={d.id} className="flex items-center justify-between border rounded p-2 text-sm">
            <div>
              <div className="font-medium">{d.filename}</div>
              <div className="text-xs text-gray-400">{d.manufacturer} &middot; {d.chunkCount} chunks</div>
            </div>
            <button onClick={() => handleDelete(d.id)} className="text-red-500 text-xs hover:underline">Del</button>
          </div>
        ))}
      </div>
    </div>
  );
}
