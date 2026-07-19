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

To build, upload, and monitor with station-mode Wi-Fi credentials, run the
interactive script for your shell from this directory:

```powershell
.\flash.ps1
```

```bash
bash ./flash.sh
```

The scripts hide password input, list available serial devices, prompt for the
upload/monitor port, and pass credentials through process-local environment
variables. Credentials are not written to the source tree. The serial monitor
prints the active device IP address after boot.

You can provide the serial port directly (`.\flash.ps1 -Port COM3` or
`bash ./flash.sh /dev/ttyUSB0`). Leave the SSID empty to build the default
`VeloSync-HWR` access-point mode.

## Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Plain-text API hint and health check. |
| `GET` | `/api/speed` | One JSON snapshot of the current speed state. |
| `WebSocket` | `/ws/speed` | Realtime speed telemetry stream. |

Use `ws://<device-ip>/ws/speed` from the React app. The connection is bidirectional: the device sends telemetry, and clients can update hardware calibration. The device sends one telemetry message immediately after connection and then broadcasts updates about every `100 ms` while at least one WebSocket client is connected.

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
| `wheelCircumferenceM` | number | Effective virtual distance per sensed shaft revolution used for speed calculation. The legacy field name is retained for protocol compatibility. |
| `magnetsPerRev` | number | Number of magnets configured in firmware. |
| `counters.accepted` | number | Accepted reed pulses since boot. |
| `counters.rejected` | number | Pulses rejected because they were outside the valid speed range. |
| `counters.bounce` | number | Fast edges ignored as reed-switch bounce or impossible speed. |

## Update hardware configuration

Send a complete WebSocket text frame with both calibration values:

```json
{
  "type": "setConfig",
  "version": 1,
  "requestId": "settings-42",
  "wheelCircumferenceM": 2.105,
  "magnetsPerRev": 1
}
```

| Field | Requirement |
| --- | --- |
| `requestId` | Non-empty client-generated string used to correlate the response. |
| `wheelCircumferenceM` | Effective virtual distance per sensed shaft revolution, from `0.1` through `10.0 m`, stored to `0.001 m` precision. The legacy field name is retained for compatibility. |
| `magnetsPerRev` | Integer from `1` through `16`. |

Both values are required and are applied atomically. Accepted changes are stored in EEPROM and survive device restarts. The firmware writes EEPROM only when a value changes, recalculates all calibration-dependent pulse thresholds immediately, resets the current speed measurement, and broadcasts fresh telemetry to every connected client.

For a crank-mounted sensor, do not use the circumference traced by the pedal. An indoor bike's displayed speed is virtual and normally includes its internal crank-to-flywheel drive ratio. At a steady cadence, calculate the calibration from simultaneous readings:

```text
new distance/rev = current distance/rev × bike display speed ÷ VeloSync speed
```

For example, a current value of `1.25 m`, bike speed of `20 km/h`, and VeloSync speed of `5.5 km/h` gives `4.545 m` per sensed revolution.

Every complete command receives a correlated result. A successful update returns the authoritative stored values:

```json
{
  "type": "configResult",
  "version": 1,
  "requestId": "settings-42",
  "ok": true,
  "wheelCircumferenceM": 2.105,
  "magnetsPerRev": 1
}
```

Rejected commands return a machine-readable code and a user-facing message:

```json
{
  "type": "configResult",
  "version": 1,
  "requestId": "settings-42",
  "ok": false,
  "error": {
    "code": "out_of_range",
    "message": "Distance per sensor revolution must be 0.1-10.0 m and magnets per revolution 1-16."
  }
}
```

Possible error codes are `invalid_json`, `missing_request_id`, `invalid_request_id`, `unsupported_message`, `unsupported_frame`, `invalid_config`, `out_of_range`, `device_busy`, and `persistence_failed`. Commands must fit in one text frame. Clients should report success only after receiving an `ok: true` result and should continue treating telemetry/configuration results as authoritative.

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
