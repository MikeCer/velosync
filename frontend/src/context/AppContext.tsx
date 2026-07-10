import React, { createContext, useContext, useState } from "react";
import type { LibraryVideo, Route, BLEDeviceInfo, HRMDeviceInfo, SpeedSource } from "../types";
import { speedToPlaybackRate, getBaselineSpeed } from "../services/speedMapping";

interface AppState {
  youtubeUrl: string;
  setYoutubeUrl: (url: string) => void;

  currentSpeedKmh: number;
  setCurrentSpeedKmh: (speed: number) => void;
  manualSpeedKmh: number;
  setManualSpeedKmh: (speed: number) => void;
  speedSource: SpeedSource;
  setSpeedSource: (src: SpeedSource) => void;
  effectiveSpeed: number;
  playbackRate: number;
  baselineSpeed: number;

  velosyncWsUrl: string;
  setVelosyncWsUrl: (url: string) => void;
  velosyncWsConnected: boolean;
  setVelosyncWsConnected: (c: boolean) => void;

  bleDevice: BLEDeviceInfo | null;
  setBleDevice: (d: BLEDeviceInfo | null) => void;
  bleConnected: boolean;
  setBleConnected: (c: boolean) => void;

  hrmDevice: HRMDeviceInfo | null;
  setHrmDevice: (d: HRMDeviceInfo | null) => void;
  hrmConnected: boolean;
  setHrmConnected: (c: boolean) => void;
  heartRate: number | null;
  setHeartRate: (hr: number | null) => void;

  isPlaying: boolean;
  setIsPlaying: (p: boolean) => void;
  sessionElapsed: number;
  setSessionElapsed: (t: number) => void;
  totalDistance: number;
  setTotalDistance: (d: number) => void;

  activeRoute: Route | null;
  setActiveRoute: (r: Route | null) => void;
  routes: Route[];
  setRoutes: (r: Route[]) => void;

  showMap: boolean;
  setShowMap: (s: boolean) => void;

  library: LibraryVideo[];
  setLibrary: (v: LibraryVideo[]) => void;
  playlist: LibraryVideo[];
  setPlaylist: (v: LibraryVideo[]) => void;
  currentVideoIndex: number;
  setCurrentVideoIndex: (i: number) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState(0);
  const [manualSpeedKmh, setManualSpeedKmh] = useState(getBaselineSpeed());
  const [speedSource, setSpeedSource] = useState<SpeedSource>(
    () => (localStorage.getItem("speedSource") as SpeedSource) || "manual"
  );
  const [velosyncWsUrl, setVelosyncWsUrl] = useState(
    () => localStorage.getItem("velosyncWsUrl") || "ws://192.168.4.1"
  );
  const [velosyncWsConnected, setVelosyncWsConnected] = useState(false);
  const [bleDevice, setBleDevice] = useState<BLEDeviceInfo | null>(null);
  const [bleConnected, setBleConnected] = useState(false);
  const [hrmDevice, setHrmDevice] = useState<HRMDeviceInfo | null>(null);
  const [hrmConnected, setHrmConnected] = useState(false);
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [activeRoute, setActiveRoute] = useState<Route | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [library, setLibrary] = useState<LibraryVideo[]>([]);
  const [playlist, setPlaylist] = useState<LibraryVideo[]>([]);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

  const baselineSpeed = getBaselineSpeed();
  const effectiveSpeed = speedSource === "manual" ? manualSpeedKmh : currentSpeedKmh;
  const playbackRate = speedToPlaybackRate(effectiveSpeed, baselineSpeed);

  const state: AppState = {
    youtubeUrl, setYoutubeUrl,
    currentSpeedKmh, setCurrentSpeedKmh,
    manualSpeedKmh, setManualSpeedKmh,
    speedSource, setSpeedSource,
    effectiveSpeed, playbackRate,
    baselineSpeed,
    velosyncWsUrl, setVelosyncWsUrl,
    velosyncWsConnected, setVelosyncWsConnected,
    bleDevice, setBleDevice,
    bleConnected, setBleConnected,
    hrmDevice, setHrmDevice,
    hrmConnected, setHrmConnected,
    heartRate, setHeartRate,
    isPlaying, setIsPlaying,
    sessionElapsed, setSessionElapsed,
    totalDistance, setTotalDistance,
    activeRoute, setActiveRoute,
    routes, setRoutes,
    showMap, setShowMap,
    library, setLibrary,
    playlist, setPlaylist,
    currentVideoIndex, setCurrentVideoIndex,
  };

  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppState must be used within AppProvider");
  return ctx;
}
