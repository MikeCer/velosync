import { useEffect, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let configuredApiKey: string | null = null;
let loadPromise: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  const key = apiKey.trim();
  if (!key) {
    return Promise.reject(new Error("Google API key is required"));
  }

  if (configuredApiKey && configuredApiKey !== key) {
    return Promise.reject(
      new Error("The Google API key changed. Reload the page to use the new key."),
    );
  }

  if (!loadPromise) {
    configuredApiKey = key;
    setOptions({ key, v: "weekly" });
    loadPromise = Promise.all([
      importLibrary("maps"),
      importLibrary("places"),
      importLibrary("geometry"),
      importLibrary("routes"),
      importLibrary("geocoding"),
    ])
      .then(() => undefined)
      .catch((error) => {
        configuredApiKey = null;
        loadPromise = null;
        throw error;
      });
  }

  return loadPromise;
}

export function useGoogleMapsLoader(apiKey: string) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    const key = apiKey.trim();
    if (!key) {
      setIsLoaded(false);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    loadGoogleMaps(key)
      .then(() => {
        if (!cancelled) {
          setIsLoaded(true);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setIsLoaded(false);
          setLoadError(
            error instanceof Error ? error : new Error("Failed to load Google Maps"),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  return { isLoaded, loadError };
}
