import { useState } from "react";
import { useAppState } from "../context/AppContext";
import { bleConnector } from "../services/ble";
const C = { accent: "var(--accent)", success: "var(--success)", danger: "var(--danger)", textMuted: "var(--text-muted)", textSec: "var(--text-secondary)", dim: "var(--text-dim)" };

export default function BLEIndicator() {
  const { bleDevice, bleConnected, setBleDevice, setBleConnected, setUseBleSpeed } = useAppState();
  const [connecting, setConnecting] = useState(false); const [error, setError] = useState("");
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: bleConnected ? C.success : C.dim, boxShadow: bleConnected ? "0 0 8px #22c55e" : "none" }} />
        <span style={{ fontSize: 14, color: C.textSec, flex: 1 }}>{bleConnected ? `Connected: ${bleDevice?.name || "Sensor"}` : "No BLE sensor"}</span>
        {bleConnected ? (
          <button onClick={async () => { await bleConnector.disconnect(); setBleConnected(false); setUseBleSpeed(false); }} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.danger}`, background: "transparent", color: C.danger, cursor: "pointer", fontSize: 13 }}>Disconnect</button>
        ) : (
          <button onClick={async () => { setError(""); setConnecting(true); try { bleConnector.setCallback((s) => {}); const info = await bleConnector.requestDevice(); setBleDevice(info); setBleConnected(true); setUseBleSpeed(true); } catch (e: any) { setError(e.message); } finally { setConnecting(false); }}} disabled={connecting} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.accent}`, background: "transparent", color: C.accent, cursor: connecting ? "not-allowed" : "pointer", fontSize: 13 }}>{connecting ? "Connecting…" : "Connect BLE"}</button>
        )}
      </div>
      {error && <div style={{ color: C.danger, fontSize: 13, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
