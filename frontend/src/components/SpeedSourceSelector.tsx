import { useState } from "react";
import { useAppState } from "../context/AppContext";
import { bleConnector } from "../services/ble";
import { velosyncWsConnector } from "../services/velosyncWs";
import type { SpeedSource } from "../types";

const C = {
  accent: "var(--accent)",
  success: "var(--success)",
  danger: "var(--danger)",
  textMuted: "var(--text-muted)",
  textSec: "var(--text-secondary)",
  dim: "var(--text-dim)",
  card: "var(--bg-secondary)",
  cardBorder: "var(--border-primary)",
  bg: "var(--bg-input)",
};

export default function SpeedSourceSelector() {
  const {
    speedSource, setSpeedSource,
    bleDevice, bleConnected, setBleDevice, setBleConnected,
    velosyncWsUrl, velosyncWsConnected, setVelosyncWsConnected,
    setCurrentSpeedKmh,
  } = useAppState();
  const [bleConnecting, setBleConnecting] = useState(false);
  const [bleError, setBleError] = useState("");
  const [wsConnecting, setWsConnecting] = useState(false);
  const [wsError, setWsError] = useState("");

  const sources: { key: SpeedSource; label: string }[] = [
    { key: "manual", label: "Manual" },
    { key: "ble", label: "BLE" },
    { key: "velosyncWs", label: "VeloSync HW" },
  ];

  const handleSelect = (src: SpeedSource) => {
    setSpeedSource(src);
    localStorage.setItem("speedSource", src);
    if (src !== "ble" && bleConnected) {
      bleConnector.disconnect();
      setBleConnected(false);
    }
    if (src !== "velosyncWs" && velosyncWsConnected) {
      velosyncWsConnector.disconnect();
      setVelosyncWsConnected(false);
    }
  };

  const handleBleConnect = async () => {
    setBleError("");
    setBleConnecting(true);
    try {
      bleConnector.setCallback((s) => setCurrentSpeedKmh(s));
      const info = await bleConnector.requestDevice();
      setBleDevice(info);
      setBleConnected(true);
      setSpeedSource("ble");
      localStorage.setItem("speedSource", "ble");
    } catch (e: any) {
      setBleError(e.message);
    } finally {
      setBleConnecting(false);
    }
  };

  const handleBleDisconnect = async () => {
    await bleConnector.disconnect();
    setBleConnected(false);
    setSpeedSource("manual");
    localStorage.setItem("speedSource", "manual");
  };

  const handleWsConnect = () => {
    setWsError("");
    setWsConnecting(true);
    velosyncWsConnector.setCallback((s) => setCurrentSpeedKmh(s));
    velosyncWsConnector.connect(velosyncWsUrl);
    setTimeout(() => {
      const connected = velosyncWsConnector.isConnected();
      setVelosyncWsConnected(connected);
      setWsConnecting(false);
      if (connected) {
        setSpeedSource("velosyncWs");
        localStorage.setItem("speedSource", "velosyncWs");
      } else {
        setWsError("Could not connect to " + velosyncWsUrl);
      }
    }, 2000);
  };

  const handleWsDisconnect = () => {
    velosyncWsConnector.disconnect();
    setVelosyncWsConnected(false);
    setSpeedSource("manual");
    localStorage.setItem("speedSource", "manual");
  };

  const isHwConnected = bleConnected || velosyncWsConnected;

  const border = "1px solid " + C.cardBorder;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 12, height: 12, borderRadius: "50%",
            background: isHwConnected ? C.success : C.dim,
            boxShadow: isHwConnected ? "0 0 8px #22c55e" : "none",
          }}
        />
        <span style={{ fontSize: 14, color: C.textSec, flex: 1 }}>
          {bleConnected
            ? "Connected: " + (bleDevice?.name || "BLE Sensor")
            : velosyncWsConnected
              ? "Connected: VeloSync HW"
              : "No sensor"}
        </span>
      </div>

      <div style={{
        display: "flex", gap: 4, marginTop: 10, padding: 4,
        borderRadius: 10, background: C.bg,
        border: border,
      }}>
        {sources.map((s) => (
          <button
            key={s.key}
            onClick={() => handleSelect(s.key)}
            style={{
              flex: 1, padding: "6px 10px", borderRadius: 8,
              border: "none",
              background: speedSource === s.key ? C.accent : "transparent",
              color: speedSource === s.key ? "#fff" : C.textMuted,
              cursor: "pointer", fontSize: 12, fontWeight: 600,
              transition: "background 0.15s",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {speedSource === "ble" && (
        <div style={{ marginTop: 8 }}>
          {bleConnected ? (
            <button
              onClick={handleBleDisconnect}
              style={{
                padding: "6px 14px", borderRadius: 8,
                border: "1px solid " + C.danger, background: "transparent",
                color: C.danger, cursor: "pointer", fontSize: 13,
              }}
            >
              Disconnect BLE
            </button>
          ) : (
            <button
              onClick={handleBleConnect}
              disabled={bleConnecting}
              style={{
                padding: "6px 14px", borderRadius: 8,
                border: "1px solid " + C.accent, background: "transparent",
                color: C.accent, cursor: bleConnecting ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              {bleConnecting ? "Connecting..." : "Connect BLE"}
            </button>
          )}
          {bleError && <div style={{ color: C.danger, fontSize: 13, marginTop: 6 }}>{bleError}</div>}
        </div>
      )}

      {speedSource === "velosyncWs" && (
        <div style={{ marginTop: 8 }}>
          {velosyncWsConnected ? (
            <button
              onClick={handleWsDisconnect}
              style={{
                padding: "6px 14px", borderRadius: 8,
                border: "1px solid " + C.danger, background: "transparent",
                color: C.danger, cursor: "pointer", fontSize: 13,
              }}
            >
              Disconnect VeloSync HW
            </button>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>
                Device: {velosyncWsUrl}
              </div>
              <button
                onClick={handleWsConnect}
                disabled={wsConnecting}
                style={{
                  padding: "6px 14px", borderRadius: 8,
                  border: "1px solid " + C.accent, background: "transparent",
                  color: C.accent, cursor: wsConnecting ? "not-allowed" : "pointer",
                  fontSize: 13,
                }}
              >
                {wsConnecting ? "Connecting..." : "Connect"}
              </button>
            </div>
          )}
          {wsError && <div style={{ color: C.danger, fontSize: 13, marginTop: 6 }}>{wsError}</div>}
        </div>
      )}
    </div>
  );
}
