import type { BLEDeviceInfo } from "../types";

export type SpeedCallback = (speedKmh: number) => void;

const FTMS_SERVICE = 0x1826;
const CSCS_SERVICE = 0x1816;
const CSC_MEASUREMENT_CHAR = 0x2a5b;

const DEFAULT_WHEEL_CIRCUMFERENCE_MM = 2105; // 700c x 23mm

export class BLEConnector {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private callback: SpeedCallback | null = null;
  private wheelCircumference: number = DEFAULT_WHEEL_CIRCUMFERENCE_MM;
  private lastWheelRevs = 0;
  private lastWheelTime = 0;

  setWheelCircumference(mm: number): void {
    this.wheelCircumference = mm;
  }

  setCallback(cb: SpeedCallback): void {
    this.callback = cb;
  }

  async requestDevice(): Promise<BLEDeviceInfo> {
    if (!("bluetooth" in navigator)) {
      throw new Error("Web Bluetooth is not available in this browser.");
    }

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [FTMS_SERVICE] },
          { services: [CSCS_SERVICE] },
        ],
        optionalServices: [FTMS_SERVICE, CSCS_SERVICE],
      });
    } catch (err: any) {
      if (err.name === "NotFoundError") {
        throw new Error("No BLE device selected.");
      }
      throw err;
    }

    if (!this.device.gatt) {
      throw new Error("Device does not support GATT.");
    }

    this.server = await this.device.gatt.connect();

    let deviceType: "FTMS" | "CSCS" = "CSCS";

    try {
      const ftmsService = await this.server.getPrimaryService(FTMS_SERVICE);
      deviceType = "FTMS";
      await this.subscribeFTMS(ftmsService);
    } catch {
      const cscsService = await this.server.getPrimaryService(CSCS_SERVICE);
      await this.subscribeCSCS(cscsService);
    }

    this.device.addEventListener("gattserverdisconnected", () => {
      this.handleDisconnect();
    });

    const info: BLEDeviceInfo = {
      id: this.device.id,
      name: this.device.name || "Unknown device",
      type: deviceType,
    };

    localStorage.setItem("bleDeviceName", info.name);
    localStorage.setItem("bleDeviceType", info.type);

    return info;
  }

  private async subscribeFTMS(service: BluetoothRemoteGATTService): Promise<void> {
    const char = await service.getCharacteristic(0x2acc);
    await char.startNotifications();
    char.addEventListener("characteristicvaluechanged", (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (!value) return;
      const speed = value.getUint16(1, true) / 100; // km/h
      this.callback?.(speed);
    });
  }

  private async subscribeCSCS(service: BluetoothRemoteGATTService): Promise<void> {
    const char = await service.getCharacteristic(CSC_MEASUREMENT_CHAR);
    await char.startNotifications();
    char.addEventListener("characteristicvaluechanged", (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (!value) return;
      const flags = value.getUint8(0);
      if (!(flags & 0x01)) return;
      const wheelRevs = value.getUint32(1, true);
      const wheelTime = value.getUint16(5, true);

      if (this.lastWheelTime > 0 && wheelTime !== this.lastWheelTime) {
        const timeDelta = (wheelTime - this.lastWheelTime + 65536) % 65536;
        if (timeDelta > 0) {
          const revDelta = (wheelRevs - this.lastWheelRevs + 65536) % 65536;
          const speedMs = (revDelta * (this.wheelCircumference / 1000)) / (timeDelta / 1024);
          const speedKmh = speedMs * 3.6;
          this.callback?.(speedKmh);
        }
      }
      this.lastWheelRevs = wheelRevs;
      this.lastWheelTime = wheelTime;
    });
  }

  private async handleDisconnect(): Promise<void> {
    console.log("BLE device disconnected, attempting reconnect…");
    this.lastWheelRevs = 0;
    this.lastWheelTime = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      try {
        if (this.device?.gatt) {
          this.server = await this.device.gatt.connect();
          const service =
            (await this.server.getPrimaryService(FTMS_SERVICE).catch(() => null)) ||
            (await this.server.getPrimaryService(CSCS_SERVICE));
          if (service) {
            console.log("BLE reconnected");
            return;
          }
        }
      } catch {
        continue;
      }
    }
    console.log("BLE reconnection failed");
  }

  async disconnect(): Promise<void> {
    if (this.server?.connected) {
      await this.server.disconnect();
    }
    this.device = null;
    this.server = null;
    this.lastWheelRevs = 0;
    this.lastWheelTime = 0;
  }

  isConnected(): boolean {
    return this.server?.connected ?? false;
  }
}

export const bleConnector = new BLEConnector();
