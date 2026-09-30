import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { AlertCircle } from "lucide-react";

interface DeliveryRouteMapProps {
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  dropLat: number;
  dropLng: number;
  dropOrganization: string;
  driverLat?: number;
  driverLng?: number;
}

export function DeliveryRouteMap({
  pickupLat,
  pickupLng,
  pickupAddress,
  dropLat,
  dropLng,
  dropOrganization,
  driverLat,
  driverLng,
}: DeliveryRouteMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

  // 1. Initialize Map
  useEffect(() => {
    if (!token || !mapContainer.current) return;

    mapboxgl.accessToken = token;

    const centerLng = (pickupLng + dropLng) / 2;
    const centerLat = (pickupLat + dropLat) / 2;

    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [centerLng, centerLat],
      zoom: 12,
    });

    mapInstance.addControl(new mapboxgl.NavigationControl(), "top-right");

    mapInstance.on("load", () => {
      map.current = mapInstance;
      setMapReady(true);
    });

    return () => {
      mapInstance.remove();
    };
  }, [token]);

  // 2. Draw Markers & Directions Route once map is ready
  useEffect(() => {
    if (!mapReady || !map.current) return;

    // A. Pickup Marker (Green)
    const pickupEl = document.createElement("div");
    pickupEl.className = "flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-black shadow-lg font-bold text-xs border-2 border-white";
    pickupEl.innerHTML = "P";

    new mapboxgl.Marker({ element: pickupEl })
      .setLngLat([pickupLng, pickupLat])
      .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`<strong>Pickup:</strong><br/>${pickupAddress}`))
      .addTo(map.current);

    // B. Dropoff Marker (Blue)
    const dropEl = document.createElement("div");
    dropEl.className = "flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white shadow-lg font-bold text-xs border-2 border-white";
    dropEl.innerHTML = "D";

    new mapboxgl.Marker({ element: dropEl })
      .setLngLat([dropLng, dropLat])
      .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`<strong>Dropoff:</strong><br/>${dropOrganization}`))
      .addTo(map.current);

    // C. Driver Marker (if present)
    if (driverLat && driverLng) {
      const driverEl = document.createElement("div");
      driverEl.className = "flex items-center justify-center w-9 h-9 rounded-full bg-amber-400 text-black shadow-xl font-bold text-sm border-2 border-white animate-pulse";
      driverEl.innerHTML = "🚗";

      new mapboxgl.Marker({ element: driverEl })
        .setLngLat([driverLng, driverLat])
        .addTo(map.current);
    }

    // D. Fetch and Draw Emerald Road Route
    async function fetchRoute() {
      try {
        const res = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${pickupLng},${pickupLat};${dropLng},${dropLat}?geometries=geojson&access_token=${token}`
        );
        const data = await res.json();
        const route = data.routes?.[0]?.geometry?.coordinates;

        if (!route || !map.current) return;

        const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: route,
          },
        };

        if (map.current.getSource("route")) {
          (map.current.getSource("route") as mapboxgl.GeoJSONSource).setData(geojson);
        } else {
          map.current.addSource("route", {
            type: "geojson",
            data: geojson,
          });

          map.current.addLayer({
            id: "route",
            type: "line",
            source: "route",
            layout: {
              "line-join": "round",
              "line-cap": "round",
            },
            paint: {
              "line-color": "#1bd677", // Emerald theme color
              "line-width": 5,
              "line-opacity": 0.9,
            },
          });
        }

        // Adjust camera to fit the entire route
        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([pickupLng, pickupLat]);
        bounds.extend([dropLng, dropLat]);
        map.current.fitBounds(bounds, { padding: 60 });
      } catch (err) {
        console.warn("Directions API error:", err);
      }
    }

    fetchRoute();
  }, [mapReady, pickupLat, pickupLng, dropLat, dropLng, driverLat, driverLng]);

  if (!token) {
    return (
      <div className="w-full h-72 rounded-2xl border border-dashed border-border bg-card/60 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-8 w-8 text-primary mb-2" />
        <p className="text-xs text-muted-foreground">Add VITE_MAPBOX_ACCESS_TOKEN to view the map.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-72 sm:h-80 rounded-2xl overflow-hidden border border-border shadow-lg" ref={mapContainer} />
  );
}