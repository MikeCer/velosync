import type { HRMDeviceInfo } from "../types";

export type HeartRateCallback = (heartRate: number) => void;

const HR_SERVICE = 0x180d;
const HR_MEASUREMENT_CHAR = 0x2a37;
const BODY_SENSOR_LOCATION_CHAR = 0x2a38;

const SENSOR_LOCATION_LABELS: Record<number, string> = {
  1: "Chest",
  2: "Wrist",
  3: "Finger",
  4: "Hand",
  5: "Ear Lobe",
  6: "Foot",
};

export class HRMConnector {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private callback: HeartRateCallback | null = null;
  private sensorLocation: string | null = null;

  setCallback(cb: HeartRateCallback): void {
    this.callback = cb;
  }

  async requestDevice(): Promise<HRMDeviceInfo> {
    if (!("bluetooth" in navigator)) {
      throw new Error("Web Bluetooth is not available in this browser.");
    }

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HR_SERVICE] }],
      });
    } catch (err: any) {
      if (err.name === "NotFoundError") {
        throw new Error(
          "No HR device found. Make sure Heart Rate Broadcast is enabled on your Garmin watch and it is not paired with your phone."
        );
      }
      throw err;
    }

    if (!this.device.gatt) {
      throw new Error("Device does not support GATT.");
    }

    this.server = await this.device.gatt.connect();

    const service = await this.server.getPrimaryService(HR_SERVICE);

    try {
      const locChar = await service.getCharacteristic(BODY_SENSOR_LOCATION_CHAR);
      const locValue = await locChar.readValue();
      const locationCode = locValue.getUint8(0);
      this.sensorLocation = SENSOR_LOCATION_LABELS[locationCode] ?? null;
    } catch {
      this.sensorLocation = null;
    }

    await this.subscribeHR(service);

    this.device.addEventListener("gattserverdisconnected", () => {
      this.handleDisconnect();
    });

    const info: HRMDeviceInfo = {
      id: this.device.id,
      name: this.device.name || "Heart Rate Monitor",
      type: "HRM",
      sensorLocation: this.sensorLocation,
    };

    localStorage.setItem("hrmDeviceName", info.name);
    localStorage.setItem("hrmSensorLocation", info.sensorLocation ?? "");

    return info;
  }

  private async subscribeHR(service: BluetoothRemoteGATTService): Promise<void> {
    const char = await service.getCharacteristic(HR_MEASUREMENT_CHAR);
    await char.startNotifications();
    char.addEventListener("characteristicvaluechanged", (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (!value) return;

      const flags = value.getUint8(0);
      const is16Bit = flags & 0x01;
      const hr = is16Bit ? value.getUint16(1, true) : value.getUint8(1);

      this.callback?.(hr);
    });
  }

  private async handleDisconnect(): Promise<void> {
    console.log("HRM device disconnected, attempting reconnect…");
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      try {
        if (this.device?.gatt) {
          this.server = await this.device.gatt.connect();
          const service = await this.server.getPrimaryService(HR_SERVICE);
          if (service) {
            await this.subscribeHR(service);
            console.log("HRM reconnected");
            return;
          }
        }
      } catch {
        continue;
      }
    }
    console.log("HRM reconnection failed");
  }

  async disconnect(): Promise<void> {
    if (this.server?.connected) {
      await this.server.disconnect();
    }
    this.device = null;
    this.server = null;
    this.sensorLocation = null;
  }

  isConnected(): boolean {
    return this.server?.connected ?? false;
  }

  getSensorLocation(): string | null {
    return this.sensorLocation;
  }
}

export const hrmConnector = new HRMConnector();