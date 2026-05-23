import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// ─── 全局错误捕获与上报 ───
const reportError = (error: string, stack?: string) => {
  fetch('/api/debug/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error, stack }),
  }).catch(() => {});
};

window.addEventListener('error', (event) => {
  const msg = event.message || (event.error && event.error.message) || 'Unknown error';
  const stack = event.error ? event.error.stack : '';
  reportError(msg, stack);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : '';
  reportError(`Unhandled Rejection: ${msg}`, stack);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);

