import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin, AlertCircle } from "lucide-react";

export interface LocationPickerMapProps {
  latitude?: number;
  longitude?: number;
  initialLat?: number;
  initialLng?: number;
  onLocationChange?: (lat: number, lng: number) => void;
  onLocationSelect?: (lat: number, lng: number) => void;
}

export function LocationPickerMap({
  latitude,
  longitude,
  initialLat,
  initialLng,
  onLocationChange,
  onLocationSelect,
}: LocationPickerMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  // Safe coordinate extraction (defaults to Bangalore center if undefined/NaN)
  const rawLat = latitude ?? initialLat ?? 12.9716;
  const rawLng = longitude ?? initialLng ?? 77.5946;
  const safeLat = typeof rawLat === "number" && !isNaN(rawLat) ? rawLat : 12.9716;
  const safeLng = typeof rawLng === "number" && !isNaN(rawLng) ? rawLng : 77.5946;

  const triggerChange = onLocationChange || onLocationSelect || (() => {});
  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

  useEffect(() => {
    if (!token || !mapContainer.current) return;

    let mapInstance: mapboxgl.Map | null = null;
    let markerInstance: mapboxgl.Marker | null = null;

    try {
      mapboxgl.accessToken = token;

      mapInstance = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [safeLng, safeLat],
        zoom: 13,
      });

      mapInstance.addControl(new mapboxgl.NavigationControl(), "top-right");

      // Custom emerald pin
      const el = document.createElement("div");
      el.className =
        "flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-black shadow-lg cursor-grab border-2 border-white";
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

      markerInstance = new mapboxgl.Marker({ element: el, draggable: true })
        .setLngLat([safeLng, safeLat])
        .addTo(mapInstance);

      map.current = mapInstance;
      marker.current = markerInstance;

      markerInstance.on("dragend", () => {
        const lngLat = markerInstance?.getLngLat();
        if (lngLat) {
          triggerChange(Number(lngLat.lat.toFixed(5)), Number(lngLat.lng.toFixed(5)));
        }
      });

      mapInstance.on("click", (e) => {
        markerInstance?.setLngLat(e.lngLat);
        triggerChange(Number(e.lngLat.lat.toFixed(5)), Number(e.lngLat.lng.toFixed(5)));
      });
    } catch (err: any) {
      console.error("LocationPickerMap init error:", err);
      setMapError("Failed to initialize map. You can still input your pickup address directly.");
    }

    return () => {
      try {
        if (markerInstance) markerInstance.remove();
        if (mapInstance) mapInstance.remove();
      } catch (e) {}
      map.current = null;
      marker.current = null;
    };
  }, [token]);

  // Sync marker if coordinates change from form inputs
  useEffect(() => {
    if (marker.current && map.current) {
      try {
        marker.current.setLngLat([safeLng, safeLat]);
        map.current.flyTo({ center: [safeLng, safeLat], essential: false });
      } catch (e) {}
    }
  }, [safeLat, safeLng]);

  if (!token) {
    return (
      <div className="w-full h-44 rounded-xl border border-dashed border-border bg-card/60 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-8 w-8 text-primary mb-2" />
        <h4 className="font-semibold text-sm">Mapbox Token Required</h4>
        <p className="text-xs text-muted-foreground max-w-sm mt-1">
          Add <code className="text-primary font-mono">VITE_MAPBOX_ACCESS_TOKEN</code> to your .env file to enable the map picker.
        </p>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="w-full h-44 rounded-xl border border-border bg-card/60 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
        <h4 className="font-semibold text-sm">Map Unavailable</h4>
        <p className="text-xs text-muted-foreground max-w-sm mt-1">{mapError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          Click on map or drag pin to adjust pickup coordinates
        </span>
        <span className="font-mono text-primary font-bold">
          {safeLat.toFixed(4)}, {safeLng.toFixed(4)}
        </span>
      </div>
      <div
        ref={mapContainer}
        className="w-full h-64 rounded-xl overflow-hidden border border-border shadow-inner bg-card"
      />
    </div>
  );
}