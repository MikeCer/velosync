import { useEffect, useState } from "react";
import { setBackendUrl, getBackendUrl } from "../services/api";
import { getBaselineSpeed, setBaselineSpeed } from "../services/speedMapping";
import { clearAllSessions } from "../services/db";
import { velosyncWsConnector } from "../services/velosyncWs";
import { useAppState } from "../context/AppContext";

const C = {
  text: "var(--text-primary)", textSec: "var(--text-secondary)", textMuted: "var(--text-muted)", textDim: "var(--text-dim)",
  bg: "var(--bg-secondary)", bgInput: "var(--bg-input)", bgOverlay: "rgba(0,0,0,0.7)",
  border: "var(--border-primary)", border2: "var(--border-secondary)", borderInput: "var(--border-input)",
  accent: "var(--accent)", success: "var(--success)", danger: "var(--danger)",
};
interface Props { open: boolean; onClose: () => void; }

export default function SettingsDialog({ open, onClose }: Props) {
  const [url, setUrl] = useState(getBackendUrl);
  const [urlSaved, setUrlSaved] = useState(false);
  const [baseline, setBaseline] = useState(getBaselineSpeed());
  const [baselineSaved, setBaselineSaved] = useState(false);
  const {
    velosyncWsUrl,
    setVelosyncWsUrl,
    velosyncWsConnected,
    googleApiKey,
    setGoogleApiKey,
  } = useAppState();
  const [wsUrl, setWsUrl] = useState(velosyncWsUrl);
  const [wsSaved, setWsSaved] = useState(false);
  const [wheelCircumference, setWheelCircumference] = useState("");
  const [magnetsPerRev, setMagnetsPerRev] = useState("");
  const [hardwareConfigLoaded, setHardwareConfigLoaded] = useState(false);
  const [hardwareConfigSaving, setHardwareConfigSaving] = useState(false);
  const [hardwareConfigSaved, setHardwareConfigSaved] = useState(false);
  const [hardwareConfigError, setHardwareConfigError] = useState("");
  const [apiKey, setApiKey] = useState(googleApiKey);
  const [apiKeySaved, setApiKeySaved] = useState(false);

  useEffect(() => {
    velosyncWsConnector.setConfigCallback((config) => {
      setWheelCircumference(String(config.wheelCircumferenceM));
      setMagnetsPerRev(String(config.magnetsPerRev));
      setHardwareConfigLoaded(true);
    });
    return () => velosyncWsConnector.setConfigCallback(null);
  }, []);

  useEffect(() => {
    if (!velosyncWsConnected) {
      setHardwareConfigLoaded(false);
      setHardwareConfigError("");
      setHardwareConfigSaved(false);
    }
  }, [velosyncWsConnected]);

  const saveHardwareConfig = async () => {
    const wheel = Math.round(Number(wheelCircumference) * 1000) / 1000;
    const magnets = Number(magnetsPerRev);
    if (!Number.isFinite(wheel) || wheel < 0.5 || wheel > 4) {
      setHardwareConfigError("Wheel circumference must be between 0.5 and 4.0 m.");
      return;
    }
    if (!Number.isInteger(magnets) || magnets < 1 || magnets > 16) {
      setHardwareConfigError("Magnets per revolution must be an integer from 1 to 16.");
      return;
    }

    setHardwareConfigError("");
    setHardwareConfigSaved(false);
    setHardwareConfigSaving(true);
    try {
      const saved = await velosyncWsConnector.updateConfig({
        wheelCircumferenceM: wheel,
        magnetsPerRev: magnets,
      });
      setWheelCircumference(String(saved.wheelCircumferenceM));
      setMagnetsPerRev(String(saved.magnetsPerRev));
      setHardwareConfigSaved(true);
      window.setTimeout(() => setHardwareConfigSaved(false), 1500);
    } catch (error) {
      setHardwareConfigError(
        error instanceof Error ? error.message : "Could not save the hardware configuration."
      );
    } finally {
      setHardwareConfigSaving(false);
    }
  };

  const saveGoogleApiKey = () => {
    const nextKey = apiKey.trim();
    const keyChanged = nextKey !== googleApiKey;
    localStorage.setItem("googleApiKey", nextKey);
    setGoogleApiKey(nextKey);
    setApiKeySaved(true);
    if (keyChanged) {
      window.setTimeout(() => window.location.reload(), 250);
    } else {
      window.setTimeout(() => setApiKeySaved(false), 1500);
    }
  };
  if (!open) return null;

  const border1 = "1px solid " + C.borderInput;
  const border2 = "1px solid " + C.border2;
  const borderDanger = "1px solid " + C.danger;

  return (
    <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bgOverlay, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto", padding: "24px", borderRadius: 16, background: C.bg, border: border2, boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>⚙ Settings</h2>
          <button onClick={onClose} style={{ padding: "4px 10px", borderRadius: 6, border: border1, background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: C.textSec, fontWeight: 500 }}>Backend URL</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (setBackendUrl(url.trim()), setUrlSaved(true), setTimeout(() => setUrlSaved(false), 1500))} placeholder="http://192.168.1.100:8000" style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: border1, background: C.bgInput, color: C.text, fontSize: 14 }} />
              <button onClick={() => { setBackendUrl(url.trim()); setUrlSaved(true); setTimeout(() => setUrlSaved(false), 1500); }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: urlSaved ? C.success : C.accent, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{urlSaved ? "✓" : "Save"}</button>
            </div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Leave empty to use same origin (dev/Vite proxy).</div>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: C.textSec, fontWeight: 500 }}>Speed baseline (km/h for 1.00× video)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" value={baseline} onChange={(e) => setBaseline(Number(e.target.value))} onKeyDown={(e) => e.key === "Enter" && (() => { const v = Math.max(1,Math.min(60,baseline)); setBaselineSpeed(v); setBaseline(v); setBaselineSaved(true); setTimeout(() => setBaselineSaved(false), 1500); })()} min={1} max={60} step={1} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: border1, background: C.bgInput, color: C.text, fontSize: 14 }} />
              <button onClick={() => { const v = Math.max(1,Math.min(60,baseline)); setBaselineSpeed(v); setBaseline(v); setBaselineSaved(true); setTimeout(() => setBaselineSaved(false), 1500); }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: baselineSaved ? C.success : C.accent, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{baselineSaved ? "✓" : "Save"}</button>
            </div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Default: 8 km/h = 1.00×. Range: 0.25× at 0 km/h → 4.00× at {baseline * 4} km/h.</div>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: C.textSec, fontWeight: 500 }}>VeloSync HW URL (WebSocket)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (setVelosyncWsUrl(wsUrl.trim()), localStorage.setItem("velosyncWsUrl", wsUrl.trim()), setWsSaved(true), setTimeout(() => setWsSaved(false), 1500))} placeholder="ws://192.168.4.1" style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: border1, background: C.bgInput, color: C.text, fontSize: 14 }} />
              <button onClick={() => { setVelosyncWsUrl(wsUrl.trim()); localStorage.setItem("velosyncWsUrl", wsUrl.trim()); setWsSaved(true); setTimeout(() => setWsSaved(false), 1500); }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: wsSaved ? C.success : C.accent, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{wsSaved ? "✓" : "Save"}</button>
            </div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>ESP8266 WebSocket device URL (e.g. ws://192.168.4.1).</div>
          </div>
          <div style={{ borderTop: border2, paddingTop: 16 }}>
            <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: C.textSec, fontWeight: 600 }}>VeloSync HW calibration</label>
            {velosyncWsConnected && hardwareConfigLoaded ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 11, color: C.textDim }}>Wheel circumference (m)</label>
                    <input
                      type="number"
                      value={wheelCircumference}
                      onChange={(e) => setWheelCircumference(e.target.value)}
                      min={0.5}
                      max={4}
                      step={0.001}
                      disabled={hardwareConfigSaving}
                      style={{ boxSizing: "border-box", width: "100%", padding: "8px 12px", borderRadius: 8, border: border1, background: C.bgInput, color: C.text, fontSize: 14 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 11, color: C.textDim }}>Magnets per revolution</label>
                    <input
                      type="number"
                      value={magnetsPerRev}
                      onChange={(e) => setMagnetsPerRev(e.target.value)}
                      min={1}
                      max={16}
                      step={1}
                      disabled={hardwareConfigSaving}
                      style={{ boxSizing: "border-box", width: "100%", padding: "8px 12px", borderRadius: 8, border: border1, background: C.bgInput, color: C.text, fontSize: 14 }}
                    />
                  </div>
                </div>
                <button
                  onClick={saveHardwareConfig}
                  disabled={hardwareConfigSaving}
                  style={{ marginTop: 8, padding: "8px 16px", borderRadius: 8, border: "none", background: hardwareConfigSaved ? C.success : C.accent, color: "#fff", cursor: hardwareConfigSaving ? "wait" : "pointer", fontSize: 13, fontWeight: 600 }}
                >
                  {hardwareConfigSaving ? "Saving…" : hardwareConfigSaved ? "✓ Saved" : "Save to device"}
                </button>
              </>
            ) : (
              <div style={{ fontSize: 12, color: C.textDim }}>
                {velosyncWsConnected ? "Waiting for device configuration…" : "Connect to VeloSync HW to edit calibration."}
              </div>
            )}
            {hardwareConfigError && (
              <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 6, border: borderDanger, background: "var(--danger-bg)", color: C.danger, fontSize: 12 }}>
                {hardwareConfigError}
              </div>
            )}
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>Accepted range: 0.5–4.0 m and 1–16 magnets. Values are stored on the device.</div>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: C.textSec, fontWeight: 500 }}>Google API Key</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveGoogleApiKey()} placeholder="AIza..." style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: border1, background: C.bgInput, color: C.text, fontSize: 14 }} />
              <button onClick={saveGoogleApiKey} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: apiKeySaved ? C.success : C.accent, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{apiKeySaved ? "✓" : "Save"}</button>
            </div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
              Required for Route Creator and Live Street View. Enable Maps JavaScript API, Street View Static API, Routes API, and Geocoding API with billing in{" "}
              <a href="https://console.cloud.google.com/apis" target="_blank" rel="noopener" style={{ color: "var(--accent-light)" }}>Google Cloud Console</a>.
              The page reloads after changing the key so every Google Maps request uses the saved credential.
            </div>
          </div>
          <div style={{ borderTop: border2, paddingTop: 16 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: C.textSec, fontWeight: 500 }}>HUD Position (fullscreen telemetry overlay)</label>
            <select
              value={localStorage.getItem("hudCorner") || "top-right"}
              onChange={(e) => localStorage.setItem("hudCorner", e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: border1, background: C.bgInput, color: C.text, fontSize: 14, width: "100%" }}
            >
              <option value="top-left">Top Left</option>
              <option value="top-right">Top Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="bottom-right">Bottom Right</option>
            </select>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Toggle via 📊 button in fullscreen controls.</div>
          </div>
          <div style={{ borderTop: border2, paddingTop: 16 }}>
            <button onClick={async () => { if (confirm("Delete all session history?")) await clearAllSessions(); }} style={{ padding: "8px 16px", borderRadius: 8, border: borderDanger, background: "transparent", color: C.danger, cursor: "pointer", fontSize: 13 }}>Clear session history</button>
          </div>
        </div>
      </div>
    </div>
  );
}
