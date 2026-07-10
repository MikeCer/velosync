import { useState } from "react";
import { setBackendUrl, getBackendUrl } from "../services/api";
import { getBaselineSpeed, setBaselineSpeed } from "../services/speedMapping";
import { clearAllSessions } from "../services/db";
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
  const { velosyncWsUrl, setVelosyncWsUrl } = useAppState();
  const [wsUrl, setWsUrl] = useState(velosyncWsUrl);
  const [wsSaved, setWsSaved] = useState(false);
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
