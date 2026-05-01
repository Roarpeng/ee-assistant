import { useStore } from '../models/store';
import type { ProgressInfo } from '../models/store';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;

  connect(projectId: string) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;

    this.ws = new WebSocket(`${protocol}//${host}/ws/projects/${projectId}`);

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ProgressInfo;
        useStore.getState().updateProgress(data);
      } catch {}
    };

    this.ws.onclose = () => {
      this.reconnectTimer = window.setTimeout(() => this.connect(projectId), 3000);
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const wsClient = new WebSocketClient();
