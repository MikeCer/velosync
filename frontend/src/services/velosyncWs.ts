import type {
  VeloSyncConfigResponse,
  VeloSyncHardwareConfig,
  VeloSyncSpeedMessage,
} from "../types";

export type SpeedCallback = (speedKmh: number) => void;
export type ConfigCallback = (config: VeloSyncHardwareConfig) => void;
export type ConnectionCallback = (connected: boolean) => void;

interface PendingConfigRequest {
  resolve: (config: VeloSyncHardwareConfig) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class VeloSyncWsConnector {
  private ws: WebSocket | null = null;
  private callback: SpeedCallback | null = null;
  private speedListeners = new Set<SpeedCallback>();
  private configCallback: ConfigCallback | null = null;
  private connectionCallback: ConnectionCallback | null = null;
  private latestConfig: VeloSyncHardwareConfig | null = null;
  private pendingConfigRequests = new Map<string, PendingConfigRequest>();
  private url: string = "";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private requestSequence = 0;

  setCallback(cb: SpeedCallback): void {
    this.callback = cb;
  }

  subscribeSpeed(cb: SpeedCallback): () => void {
    this.speedListeners.add(cb);
    return () => this.speedListeners.delete(cb);
  }

  setConfigCallback(cb: ConfigCallback | null): void {
    this.configCallback = cb;
    if (cb && this.latestConfig) {
      cb(this.latestConfig);
    }
  }

  setConnectionCallback(cb: ConnectionCallback | null): void {
    this.connectionCallback = cb;
    cb?.(this.isConnected());
  }

  connect(url: string): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.disconnectSocket();
    this.intentionalClose = false;
    this.reconnectAttempt = 0;
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
      this.connectionCallback?.(true);
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as VeloSyncSpeedMessage | VeloSyncConfigResponse;
        if (msg.type === "speed" && msg.version === 1) {
          this.callback?.(msg.speedKmh);
          for (const listener of this.speedListeners) {
            listener(msg.speedKmh);
          }
          this.publishConfig({
            wheelCircumferenceM: msg.wheelCircumferenceM,
            magnetsPerRev: msg.magnetsPerRev,
          });
        } else if (msg.type === "configResult" && msg.version === 1) {
          this.handleConfigResult(msg);
        }
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.latestConfig = null;
      this.connectionCallback?.(false);
      this.rejectPendingConfigRequests("VeloSync HW disconnected before saving the configuration.");
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

  updateConfig(config: VeloSyncHardwareConfig): Promise<VeloSyncHardwareConfig> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("VeloSync HW is not connected."));
    }

    const requestId = `${Date.now()}-${++this.requestSequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingConfigRequests.delete(requestId);
        reject(new Error("VeloSync HW did not acknowledge the configuration update."));
      }, 5000);

      this.pendingConfigRequests.set(requestId, { resolve, reject, timer });
      try {
        this.ws!.send(JSON.stringify({
          type: "setConfig",
          version: 1,
          requestId,
          ...config,
        }));
      } catch (error) {
        clearTimeout(timer);
        this.pendingConfigRequests.delete(requestId);
        reject(error instanceof Error ? error : new Error("Could not send the configuration update."));
      }
    });
  }

  private handleConfigResult(result: VeloSyncConfigResponse): void {
    const pending = this.pendingConfigRequests.get(result.requestId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingConfigRequests.delete(result.requestId);
    if (result.ok) {
      const config = {
        wheelCircumferenceM: result.wheelCircumferenceM,
        magnetsPerRev: result.magnetsPerRev,
      };
      this.publishConfig(config);
      pending.resolve(config);
    } else {
      pending.reject(new Error(result.error.message));
    }
  }

  private publishConfig(config: VeloSyncHardwareConfig): void {
    if (
      this.latestConfig?.wheelCircumferenceM === config.wheelCircumferenceM &&
      this.latestConfig?.magnetsPerRev === config.magnetsPerRev
    ) {
      return;
    }
    this.latestConfig = config;
    this.configCallback?.(config);
  }

  private rejectPendingConfigRequests(message: string): void {
    for (const pending of this.pendingConfigRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.pendingConfigRequests.clear();
  }

  private disconnectSocket(): void {
    if (!this.ws) return;
    this.ws.onclose = null;
    this.ws.close();
    this.ws = null;
    this.latestConfig = null;
    this.connectionCallback?.(false);
    this.rejectPendingConfigRequests("VeloSync HW disconnected before saving the configuration.");
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    this.disconnectSocket();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const velosyncWsConnector = new VeloSyncWsConnector();
