import { useEffect, useRef } from "react";
import { useAppState } from "../context/AppContext";
import { saveSession } from "../services/db";
import type { SessionRecord } from "../types";

export function useSessionTimer() {
  const {
    isPlaying,
    sessionElapsed,
    setSessionElapsed,
    totalDistance,
    setTotalDistance,
    currentSpeedKmh,
    useBleSpeed,
    manualSpeedKmh,
    playlist,
    currentVideoIndex,
    activeRoute,
  } = useAppState();

  const intervalRef = useRef<number | null>(null);
  const sessionRef = useRef({ start: 0, distance: 0 });

  useEffect(() => {
    if (isPlaying) {
      sessionRef.current.start = Date.now() - sessionElapsed * 1000;
      intervalRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - sessionRef.current.start) / 1000;
        const speed = useBleSpeed ? currentSpeedKmh : manualSpeedKmh;
        const distance = speed / 3600; // km per second
        sessionRef.current.distance += distance;
        setSessionElapsed(elapsed);
        setTotalDistance(sessionRef.current.distance);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying]);

  // Save session when stopping
  useEffect(() => {
    if (!isPlaying && sessionElapsed > 5) {
      const currentVideo = playlist[currentVideoIndex];
      const record: SessionRecord = {
        id: Date.now().toString(),
        date: Date.now(),
        videoUrl: currentVideo?.youtubeUrl ?? "",
        videoTitle: currentVideo?.title ?? "Unknown",
        routeId: activeRoute?.id ?? null,
        duration: Math.round(sessionElapsed),
        distance: totalDistance,
        avgSpeed: sessionElapsed > 0 ? totalDistance / (sessionElapsed / 3600) : 0,
        maxSpeed: useBleSpeed ? currentSpeedKmh : manualSpeedKmh,
      };
      saveSession(record).catch(() => {});
      setSessionElapsed(0);
      setTotalDistance(0);
    }
  }, [isPlaying]);
}
