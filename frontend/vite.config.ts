import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8000', '/ws': { target: 'ws://localhost:8000', ws: true } } },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-mermaid': ['mermaid'],
          'vendor-monaco': ['@monaco-editor/react'],
          'vendor-reactflow': ['reactflow'],
          'vendor-mui': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          'vendor-crdt': ['yjs', 'y-webrtc'],
          'vendor-file': ['xlsx', 'jszip', 'file-saver'],
        },
      },
    },
  },
});
