import { useEffect, useRef, useCallback } from 'react';

/**
 * Reconnecting WebSocket hook. Auto-reconnects with exponential backoff
 * on disconnect. Provides a lightweight abstraction over raw WS connections.
 *
 * @param url - The WebSocket URL (e.g., `ws://host/ws/projects/123`)
 * @param onMessage - Callback for incoming messages
 * @param enabled - Whether the connection should be active
 */
export function useReconnectingWS(
  url: string | null,
  onMessage: ((data: string) => void) | null,
  enabled = true,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!url || !enabled) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const fullUrl = url.startsWith('ws') ? url : `${protocol}//${window.location.host}${url}`;
    const ws = new WebSocket(fullUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      onMessageRef.current?.(event.data);
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (!enabled) return;
      // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
      const delay = Math.min(1000 * 2 ** attemptRef.current, 30_000);
      attemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url, enabled]);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
      }
    };
  }, [connect, enabled]);
}

/**
 * Lightweight sessionStorage cache for arbitrary data that should survive
 * page reloads but not persist permanently. Auto-serializes to JSON.
 */
export const sessionCache = {
  set<T>(key: string, value: T): void {
    try {
      sessionStorage.setItem(`ee:${key}`, JSON.stringify(value));
    } catch { /* quota exceeded — ignore */ }
  },

  get<T>(key: string): T | null {
    try {
      const raw = sessionStorage.getItem(`ee:${key}`);
      return raw ? JSON.parse(raw) as T : null;
    } catch {
      return null;
    }
  },

  remove(key: string): void {
    try { sessionStorage.removeItem(`ee:${key}`); } catch { /* ignore */ }
  },
};
