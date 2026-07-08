import type { VeloSyncSpeedMessage } from "../types";

export type SpeedCallback = (speedKmh: number) => void;

export class VeloSyncWsConnector {
  private ws: WebSocket | null = null;
  private callback: SpeedCallback | null = null;
  private url: string = "";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  setCallback(cb: SpeedCallback): void {
    this.callback = cb;
  }

  connect(url: string): void {
    this.intentionalClose = false;
    this.url = url;
    this.connectInternal();
  }

  private connectInternal(): void {
    if (!this.url) return;

    const fullUrl = this.url.endsWith("/ws/speed")
      ? this.url
      : `${this.url.replace(/\/+$/, "")}/ws/speed`;

    try {
      this.ws = new WebSocket(fullUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as VeloSyncSpeedMessage;
        if (msg.type === "speed" && msg.version === 1) {
          this.callback?.(msg.speedKmh);
        }
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror, reconnect handled there
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= 5) return;
    const delay = 2000 * (this.reconnectAttempt + 1);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      if (!this.intentionalClose) {
        this.connectInternal();
      }
    }, delay);
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect firing
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const velosyncWsConnector = new VeloSyncWsConnector();
