import { useState } from "react";
import { useAppState } from "../context/AppContext";
import { bleConnector } from "../services/ble";
import { hrmConnector } from "../services/hrm";
import { velosyncWsConnector } from "../services/velosyncWs";
import type { SpeedSource } from "../types";

export default function SpeedSourceSelector() {
  const {
    speedSource, setSpeedSource,
    bleDevice, bleConnected, setBleDevice, setBleConnected,
    velosyncWsUrl, velosyncWsConnected, setVelosyncWsConnected,
    hrmDevice, hrmConnected, setHrmDevice, setHrmConnected,
    heartRate, setHeartRate,
    setCurrentSpeedKmh,
  } = useAppState();
  const [bleConnecting, setBleConnecting] = useState(false);
  const [bleError, setBleError] = useState("");
  const [wsConnecting, setWsConnecting] = useState(false);
  const [wsError, setWsError] = useState("");
  const [hrmConnecting, setHrmConnecting] = useState(false);
  const [hrmError, setHrmError] = useState("");

  const sources: { key: SpeedSource; label: string; icon: string }[] = [
    { key: "manual", label: "Manual", icon: "👆" },
    { key: "ble", label: "BLE", icon: "📶" },
    { key: "velosyncWs", label: "VeloSync HW", icon: "🔌" },
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

  const handleHrmConnect = async () => {
    setHrmError("");
    setHrmConnecting(true);
    try {
      hrmConnector.setCallback((hr) => setHeartRate(hr));
      const info = await hrmConnector.requestDevice();
      setHrmDevice(info);
      setHrmConnected(true);
    } catch (e: any) {
      setHrmError(e.message);
    } finally {
      setHrmConnecting(false);
    }
  };

  const handleHrmDisconnect = async () => {
    await hrmConnector.disconnect();
    setHrmConnected(false);
    setHrmDevice(null);
    setHeartRate(null);
  };

  const isHwConnected = bleConnected || velosyncWsConnected;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Connection status indicator */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
        padding: "8px 14px", borderRadius: "var(--radius-md)",
        background: isHwConnected ? "var(--success-bg)" : "var(--bg-input)",
        border: `1px solid ${isHwConnected ? "rgba(34, 197, 94, 0.3)" : "var(--glass-border)"}`,
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: "50%",
          background: isHwConnected ? "var(--success)" : "var(--text-dim)",
          boxShadow: isHwConnected ? "0 0 8px rgba(34, 197, 94, 0.6)" : "none",
          transition: "all var(--transition-base)",
        }} />
        <span style={{ fontSize: 13, color: "var(--text-secondary)", flex: 1 }}>
          {bleConnected
            ? "Connected: " + (bleDevice?.name || "BLE Sensor")
            : velosyncWsConnected
              ? "Connected: VeloSync HW"
              : "No hardware sensor connected"}
        </span>
      </div>

      {/* Source selector tabs */}
      <div style={{
        display: "flex", gap: 4, padding: 4,
        borderRadius: "var(--radius-lg)",
        background: "var(--bg-input)",
        border: "1px solid var(--glass-border)",
      }}>
        {sources.map((s) => (
          <button
            key={s.key}
            onClick={() => handleSelect(s.key)}
            style={{
              flex: 1, padding: "8px 12px", borderRadius: "var(--radius-md)",
              border: "none",
              background: speedSource === s.key ? "var(--accent-bg)" : "transparent",
              color: speedSource === s.key ? "var(--accent-light)" : "var(--text-muted)",
              cursor: "pointer", fontSize: 12, fontWeight: 600,
              transition: "all var(--transition-fast)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <span>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      {/* BLE controls */}
      {speedSource === "ble" && (
        <div style={{ marginTop: 10 }}>
          {bleConnected ? (
            <button
              onClick={handleBleDisconnect}
              style={{
                padding: "8px 16px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--danger)",
                background: "var(--danger-bg)",
                color: "var(--danger)", cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                transition: "all var(--transition-fast)",
              }}
            >
              Disconnect BLE
            </button>
          ) : (
            <button
              onClick={handleBleConnect}
              disabled={bleConnecting}
              className="btn-gradient"
              style={{
                padding: "8px 20px", fontSize: 13,
              }}
            >
              {bleConnecting ? "Connecting…" : "🔗 Connect BLE Sensor"}
            </button>
          )}
          {bleError && (
            <div style={{
              color: "var(--danger)", fontSize: 12, marginTop: 6,
              padding: "6px 10px", borderRadius: "var(--radius-sm)",
              background: "var(--danger-bg)", border: "1px solid rgba(239, 68, 68, 0.3)",
            }}>
              {bleError}
            </div>
          )}
        </div>
      )}

      {/* VeloSync HW controls */}
      {speedSource === "velosyncWs" && (
        <div style={{ marginTop: 10 }}>
          {velosyncWsConnected ? (
            <button
              onClick={handleWsDisconnect}
              style={{
                padding: "8px 16px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--danger)",
                background: "var(--danger-bg)",
                color: "var(--danger)", cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                transition: "all var(--transition-fast)",
              }}
            >
              Disconnect VeloSync HW
            </button>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                Device: {velosyncWsUrl}
              </div>
              <button
                onClick={handleWsConnect}
                disabled={wsConnecting}
                className="btn-gradient"
                style={{
                  padding: "8px 20px", fontSize: 13,
                }}
              >
                {wsConnecting ? "Connecting…" : "🔗 Connect"}
              </button>
            </div>
          )}
          {wsError && (
            <div style={{
              color: "var(--danger)", fontSize: 12, marginTop: 6,
              padding: "6px 10px", borderRadius: "var(--radius-sm)",
              background: "var(--danger-bg)", border: "1px solid rgba(239, 68, 68, 0.3)",
            }}>
              {wsError}
            </div>
          )}
        </div>
      )}

      {/* Heart Rate Monitor — independent */}
      <div style={{
        marginTop: 14, paddingTop: 14,
        borderTop: "1px solid var(--glass-border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>❤️</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>
            Heart Rate Monitor
          </span>
          {hrmConnected && (
            <span style={{
              fontSize: 15, fontWeight: 700,
              color: "var(--accent-light)",
              marginLeft: "auto",
            }}>
              {heartRate ?? "--"} BPM
            </span>
          )}
        </div>

        {hrmConnected ? (
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
              {hrmDevice?.name || "HR Monitor"}
              {hrmDevice?.sensorLocation ? ` · ${hrmDevice.sensorLocation}` : ""}
            </div>
            <button
              onClick={handleHrmDisconnect}
              style={{
                padding: "8px 16px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--danger)",
                background: "var(--danger-bg)",
                color: "var(--danger)", cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                transition: "all var(--transition-fast)",
              }}
            >
              Disconnect HR
            </button>
          </div>
        ) : (
          <div>
            {!hrmConnecting && !hrmError && (
              <div style={{
                fontSize: 12, color: "var(--text-muted)", marginBottom: 8,
                background: "var(--bg-input)", padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--glass-border)",
                lineHeight: 1.6,
              }}>
                <strong>Before connecting:</strong>
                <br />1. Garmin: Settings → Health → Wrist HR → Broadcast
                <br />2. Disconnect watch from smartphone
                <br />3. Keep watch awake and nearby
              </div>
            )}
            <button
              onClick={handleHrmConnect}
              disabled={hrmConnecting}
              className="btn-gradient"
              style={{
                padding: "8px 20px", fontSize: 13,
              }}
            >
              {hrmConnecting ? "Connecting…" : "❤️ Connect HR Monitor"}
            </button>
          </div>
        )}
        {hrmError && (
          <div style={{
            color: "var(--danger)", fontSize: 12, marginTop: 6,
            padding: "6px 10px", borderRadius: "var(--radius-sm)",
            background: "var(--danger-bg)", border: "1px solid rgba(239, 68, 68, 0.3)",
          }}>
            {hrmError}
          </div>
        )}
      </div>
    </div>
  );
}
