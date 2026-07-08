# VeloSync HW WebSocket API

The Wemos D1 mini pro exposes speed telemetry for browser clients over HTTP port `80`.

## Network setup

By default, the firmware starts its own Wi-Fi access point:

| Setting | Value |
| --- | --- |
| SSID | `VeloSync-HWR` |
| Password | `velosync` |
| Device URL | `http://192.168.4.1/` |
| WebSocket URL | `ws://192.168.4.1/ws/speed` |

To connect the device to an existing Wi-Fi network instead, define credentials in `platformio.ini`:

```ini
build_flags =
  -D WIFI_SSID=\"YourWifiName\"
  -D WIFI_PASSWORD=\"YourWifiPassword\"
```

After boot, the serial monitor prints the active device IP address.

## Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Plain-text API hint and health check. |
| `GET` | `/api/speed` | One JSON snapshot of the current speed state. |
| `WebSocket` | `/ws/speed` | Realtime speed telemetry stream. |

Use `ws://<device-ip>/ws/speed` from the React app. The device sends one telemetry message immediately after connection and then broadcasts updates about every `100 ms` while at least one WebSocket client is connected.

After a full stop, `speedKmh` intentionally stays at `0` for the first restart pulse. The next valid pulse establishes the movement interval and ramps the filtered speed back up, which avoids a single magnet passage producing an exaggerated speed spike.

## WebSocket message schema

Each WebSocket message is a JSON object:

```json
{
  "type": "speed",
  "version": 1,
  "seq": 42,
  "timestampMs": 123456,
  "speedKmh": 18.75,
  "instantSpeedKmh": 19.12,
  "pulseIntervalMs": 396,
  "pulseAgeMs": 38,
  "stopped": false,
  "wheelCircumferenceM": 2.105,
  "magnetsPerRev": 1,
  "counters": {
    "accepted": 128,
    "rejected": 0,
    "bounce": 4
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `type` | string | Always `speed`. |
| `version` | number | Schema version. Current value is `1`. |
| `seq` | number | Monotonic message sequence from device boot. |
| `timestampMs` | number | Device uptime from `millis()` when the message was created. |
| `speedKmh` | number | Filtered speed in km/h. This is the value the UI should display. |
| `instantSpeedKmh` | number | Last accepted pulse-derived speed before filtering. |
| `pulseIntervalMs` | number | Last accepted reed pulse interval in milliseconds, or `0` before the first valid pulse. |
| `pulseAgeMs` | number | Milliseconds since the last accepted reed pulse, or `0` before the first valid pulse. |
| `stopped` | boolean | `true` when the filtered speed is below the configured minimum tracked speed. |
| `wheelCircumferenceM` | number | Firmware calibration value used for speed calculation. |
| `magnetsPerRev` | number | Number of magnets configured in firmware. |
| `counters.accepted` | number | Accepted reed pulses since boot. |
| `counters.rejected` | number | Pulses rejected because they were outside the valid speed range. |
| `counters.bounce` | number | Fast edges ignored as reed-switch bounce or impossible speed. |

## React usage example

```ts
type VeloSyncSpeedMessage = {
  type: 'speed';
  version: 1;
  seq: number;
  timestampMs: number;
  speedKmh: number;
  instantSpeedKmh: number;
  pulseIntervalMs: number;
  pulseAgeMs: number;
  stopped: boolean;
  wheelCircumferenceM: number;
  magnetsPerRev: number;
  counters: {
    accepted: number;
    rejected: number;
    bounce: number;
  };
};
```

```tsx
import { useEffect, useState } from 'react';

export function BikeSpeed({ deviceIp }: { deviceIp: string }) {
  const [speed, setSpeed] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(`ws://${deviceIp}/ws/speed`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as VeloSyncSpeedMessage;
      if (message.type === 'speed' && message.version === 1) {
        setSpeed(message.speedKmh);
      }
    };

    return () => ws.close();
  }, [deviceIp]);

  return (
    <div>
      <div>{connected ? 'Connected' : 'Disconnected'}</div>
      <div>{speed.toFixed(1)} km/h</div>
    </div>
  );
}
```

For a production UI, reconnect when `onclose` fires and show the connection state separately from `speedKmh`. Treat `speedKmh` as authoritative for display; use `instantSpeedKmh` only for diagnostics or advanced visualizations.
