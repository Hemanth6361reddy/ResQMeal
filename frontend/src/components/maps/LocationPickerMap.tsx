import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin, AlertCircle } from "lucide-react";

interface LocationPickerMapProps {
  latitude: number;
  longitude: number;
  onLocationChange: (lat: number, lng: number) => void;
}

export function LocationPickerMap({ latitude, longitude, onLocationChange }: LocationPickerMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);

  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

  useEffect(() => {
    if (!token || !mapContainer.current) return;

    mapboxgl.accessToken = token;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11", // Dark food rescue theme
      center: [longitude, latitude],
      zoom: 13,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Create Draggable Custom Green Marker
    const el = document.createElement("div");
    el.className = "flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-black shadow-lg cursor-grab border-2 border-white";
    el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

    marker.current = new mapboxgl.Marker({ element: el, draggable: true })
      .setLngLat([longitude, latitude])
      .addTo(map.current);

    marker.current.on("dragend", () => {
      const lngLat = marker.current?.getLngLat();
      if (lngLat) {
        onLocationChange(Number(lngLat.lat.toFixed(5)), Number(lngLat.lng.toFixed(5)));
      }
    });

    // Also update pin when user clicks anywhere on map
    map.current.on("click", (e) => {
      marker.current?.setLngLat(e.lngLat);
      onLocationChange(Number(e.lngLat.lat.toFixed(5)), Number(e.lngLat.lng.toFixed(5)));
    });

    return () => {
      map.current?.remove();
    };
  }, [token]);

  // Sync marker if coordinates change from form inputs
  useEffect(() => {
    if (marker.current && map.current) {
      marker.current.setLngLat([longitude, latitude]);
    }
  }, [latitude, longitude]);

  if (!token) {
    return (
      <div className="w-full h-64 rounded-xl border border-dashed border-border bg-card/60 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-8 w-8 text-primary mb-2" />
        <h4 className="font-semibold text-sm">Mapbox Token Required</h4>
        <p className="text-xs text-muted-foreground max-w-sm mt-1">
          Add <code className="text-primary font-mono">VITE_MAPBOX_ACCESS_TOKEN</code> to your <code className="font-mono">frontend/.env</code> file to enable interactive map pin picking.
        </p>
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
        <span className="font-mono text-primary">{latitude}, {longitude}</span>
      </div>
      <div ref={mapContainer} className="w-full h-64 rounded-xl overflow-hidden border border-border shadow-inner" />
    </div>
  );
}