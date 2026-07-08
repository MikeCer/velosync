# VeloSync

Speed-adaptive video player for indoor cycling training. Video playback speed scales with your cycling speed — pedal faster, watch faster. Supports BLE bike sensors, custom ESP8266 reed-sensor hardware, a video download library, route mapping, and session tracking.

## Architecture

```
┌──────────────────────┐         ┌──────────────────────┐
│  Tablet / Desktop  │  HTTP   │  Backend (LAN/Cloud) │
│  React PWA           │────────▶│  FastAPI + yt-dlp    │
│  - Video player      │         │  - Download & stream │
│  - Speed control      │         │  - Docker container  │
│  - BLE / WebSocket    │         └──────────────────────┘
│  - Map overlay       │
│  - Session stats     │
│  - Video library     │
└──────────────────────┘
```

## Quick Start

### Backend

```bash
# With Docker (recommended)
docker compose up -d

# Or manually
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

The backend exposes:
- `POST /api/info` — video metadata from YouTube URL
- `POST /api/download` — queue a YouTube video download
- `GET /api/download/progress` — SSE stream for download progress
- `GET /api/videos` — list downloaded videos
- `DELETE /api/videos/{id}` — delete a downloaded video
- `GET /api/media/{filename}` — serve a video file
- `GET /api/health` — health check

### Frontend

```bash
cd frontend
npm install
npm run dev          # Development (port 5173, proxies /api to :8000)
npm run build        # Production build → dist/
```

## Deploy on Android Tablet

1. **Backend**: Run `docker compose up -d` on a computer on the same local network, or deploy to a cloud server.
2. **Frontend**: Build (`npm run build`) and serve the `dist/` folder via any static server (nginx, `python -m http.server`, or Vercel/Netlify).
3. Open the frontend URL on the tablet. The PWA will prompt "Add to Home Screen" — accept for full-screen, standalone experience.
4. In **Settings** (⚙), set the backend URL to your backend's address (e.g., `http://192.168.1.100:8000`).

## Features

### Speed Sources

Three selectable speed sources via a unified toggle in the dashboard:

- **Manual** — Slider control (0–60 km/h). Always available, no hardware required.
- **BLE Sensor** — Connect to FTMS or CSCS Bluetooth bike sensors via Web Bluetooth API. Auto-reconnects on disconnect.
- **VeloSync HW (WebSocket)** — Connect to a custom ESP8266 reed-sensor device over WebSocket. Configure the device URL in Settings. Auto-reconnects on disconnect.

When a hardware sensor (BLE or VeloSync HW) reports 0 km/h, the video auto-pauses. It auto-resumes when speed returns above zero.

### Speed-to-Playback Mapping

Linear mapping from bike speed (km/h) to video playback rate:
- Configurable baseline: default 8 km/h = 1.00×.
- Range: 0.25× at 0 km/h → 4.00× at 4× baseline.
- Adjustable in Settings.

### Video Library & Downloads

- Paste a YouTube URL and choose quality to download videos to the backend.
- Server-Sent Events (SSE) provide real-time download progress.
- Downloaded videos appear in a library panel — add/remove from the playback queue.
- Supports multi-video queues with prev/next navigation.

### Fullscreen Overlay

Toggle fullscreen for an immersive ride:
- Bottom control bar auto-hides after 3 seconds, reappears on mouse/touch.
- Speed display, slider, audio controls, and track navigation in the overlay.
- **Speed gauge** — optional persistent digital speedometer pinned to the top-left corner (toggle via ⚡ button). Preference saved across sessions.

### Virtual Ride Map

- OpenStreetMap overlay with Leaflet.
- Click-to-create route waypoints, saved to IndexedDB.
- Position marker moves along the route based on accumulated distance.

### Session Tracking

- Timer, distance, average speed during training.
- Session history saved to IndexedDB (video, route, duration, stats).
- Clear history from Settings.

### Dark / Light Theme

Toggle between dark and light themes from the header bar.

## VeloSync HW (ESP8266)

The `mcu/velosync-hwr/` directory contains firmware for a Wemos D1 mini pro that reads a reed sensor and streams speed data over WebSocket. See `mcu/velosync-hwr/WEBSOCKET_API.md` for the full API specification.

Default device URL: `ws://192.168.4.1/ws/speed`

## Testing

```bash
# Backend
cd backend
pip install pytest
pytest tests/

# Frontend
cd frontend
npx vitest run
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Leaflet |
| Backend | Python, FastAPI, yt-dlp |
| Storage | IndexedDB (client-side) |
| Map | OpenStreetMap / Leaflet |
| BLE | Web Bluetooth API (FTMS/CSCS) |
| WebSocket | Browser WebSocket API (ESP8266) |
| PWA | vite-plugin-pwa, Workbox |
| Container | Docker |
