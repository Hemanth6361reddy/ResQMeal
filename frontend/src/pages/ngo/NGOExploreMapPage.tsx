import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ArrowLeft, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, getAuthToken } from "@/lib/api";

interface NearbyDonation {
  id: string;
  title: string;
  food_type: string;
  servings: number;
  quantity_kg: number;
  pickup_address: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  expires_at: string;
}

export function NGOExploreMapPage() {
  const navigate = useNavigate();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
  const authToken = getAuthToken();

  const [coords] = useState({ lat: 12.9716, lng: 77.5946 });

  const { data: donations, isLoading, refetch } = useQuery<NearbyDonation[]>({
    queryKey: ["nearbyDonationsMap"],
    queryFn: () => apiFetch(`/ngo/nearby?latitude=${coords.lat}&longitude=${coords.lng}&radius_km=50`),
    enabled: !!authToken,
  });

  // 1. Initialize Mapbox
  useEffect(() => {
    if (!token || !mapContainer.current) return;

    mapboxgl.accessToken = token;

    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [coords.lng, coords.lat],
      zoom: 12,
    });

    mapInstance.addControl(new mapboxgl.NavigationControl(), "top-right");

    mapInstance.on("load", () => {
      map.current = mapInstance;
      setMapLoaded(true);
    });

    return () => {
      mapInstance.remove();
    };
  }, [token]);

  // 2. Add Pins whenever both the map is loaded AND donations exist
  useEffect(() => {
    if (!mapLoaded || !map.current || !donations) return;

    // Clear old markers
    markers.current.forEach((m) => m.remove());
    markers.current = [];

    if (donations.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();

    donations.forEach((d) => {
      // Create Custom Emerald Pin Element
      const el = document.createElement("div");
      el.className = "flex items-center justify-center w-9 h-9 rounded-full bg-emerald-500 text-black shadow-xl cursor-pointer border-2 border-white hover:scale-125 transition-transform";
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`;

      const popupHtml = `
        <div style="color: #0c1c13; padding: 6px; font-family: sans-serif;">
          <h4 style="font-weight: bold; font-size: 14px; margin: 0 0 4px 0;">${d.title}</h4>
          <p style="font-size: 12px; margin: 0; color: #555;">${d.servings} Servings • ${d.food_type}</p>
          <p style="font-size: 11px; margin: 4px 0 0 0; color: #047857; font-weight: bold;">📍 ${d.distance_km} km away</p>
          <p style="font-size: 10px; margin: 4px 0 0 0; color: #888;">${d.pickup_address}</p>
        </div>
      `;

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([d.longitude, d.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(popupHtml))
        .addTo(map.current!);

      markers.current.push(marker);
      bounds.extend([d.longitude, d.latitude]);
    });

    // Auto-center camera to encompass all donation pins
    map.current.fitBounds(bounds, { padding: 80, maxZoom: 14 });
  }, [mapLoaded, donations]);

  return (
    <div className="relative w-full h-[calc(100vh-4rem)]">
      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate("/ngo/dashboard")}
          className="gap-2 bg-card/90 backdrop-blur shadow-md"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Console</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-1.5 bg-card/90 backdrop-blur shadow-md text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh Pins</span>
        </Button>
      </div>

      {/* Floating Status Notification */}
      <div className="absolute top-4 right-14 z-10">
        {isLoading ? (
          <div className="p-2 px-3 rounded-xl bg-card/90 backdrop-blur border border-border flex items-center gap-2 text-xs font-semibold">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Scanning radar...</span>
          </div>
        ) : donations && donations.length > 0 ? (
          <div className="p-2 px-3 rounded-xl bg-card/90 backdrop-blur border border-border text-xs font-semibold text-primary">
            ● {donations.length} Active Food Pin{donations.length > 1 ? "s" : ""} Found
          </div>
        ) : (
          <div className="p-2 px-3 rounded-xl bg-card/90 backdrop-blur border border-border text-xs text-muted-foreground">
            0 Available Donations (Create one as Donor!)
          </div>
        )}
      </div>

      {!token ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-card">
          <AlertCircle className="h-12 w-12 text-primary mb-3" />
          <h3 className="text-xl font-bold">Mapbox Token Required</h3>
          <p className="text-sm text-muted-foreground max-w-md mt-2">
            Please add your public token to <code className="text-primary font-mono">frontend/.env</code> as <code className="font-mono">VITE_MAPBOX_ACCESS_TOKEN</code>.
          </p>
        </div>
      ) : (
        <div ref={mapContainer} className="w-full h-full" />
      )}
    </div>
  );
}