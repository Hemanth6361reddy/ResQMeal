import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ArrowLeft, Loader2, Navigation, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

interface DeliveryDetails {
  id: string;
  food_title: string;
  food_type: string;
  servings: number;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  drop_organization: string;
  drop_address: string;
  status: string;
}

export function LiveDeliveryTrackingPage() {
  const { deliveryId } = useParams<{ deliveryId: string }>();
  const navigate = useNavigate();

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const driverMarker = useRef<mapboxgl.Marker | null>(null);

  const [liveDriverPos, setLiveDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [liveStatus, setLiveStatus] = useState<string>("ACCEPTED");
  const [wsConnected, setWsConnected] = useState(false);

  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

  // 1. Fetch Delivery Task Details via REST
  const { data: delivery, isLoading } = useQuery<DeliveryDetails>({
    queryKey: ["deliveryTracking", deliveryId],
    queryFn: () => apiFetch(`/deliveries/${deliveryId}`),
    enabled: !!deliveryId,
  });

  // Sync status when REST data arrives
  useEffect(() => {
    if (delivery?.status) {
      setLiveStatus(delivery.status);
    }
  }, [delivery]);

  // 2. Open Persistent WebSocket Connection
  useEffect(() => {
    if (!deliveryId) return;

    const socket = new WebSocket(`ws://localhost:8000/api/v1/ws/delivery/${deliveryId}`);

    socket.onopen = () => {
      setWsConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "DRIVER_LOCATION" && data.lat && data.lng) {
          setLiveDriverPos({ lat: data.lat, lng: data.lng });
        } else if (data.type === "STATUS_CHANGE" && data.status) {
          setLiveStatus(data.status);
        }
      } catch (err) {
        console.error("WebSocket message parse error:", err);
      }
    };

    socket.onclose = () => {
      setWsConnected(false);
    };

    return () => {
      socket.close();
    };
  }, [deliveryId]);

  // 3. Initialize Mapbox Canvas
  useEffect(() => {
    if (!token || !mapContainer.current) return;

    mapboxgl.accessToken = token;

    const pLat = delivery?.pickup_lat || 12.9716;
    const pLng = delivery?.pickup_lng || 77.5946;
    const dLat = 12.9784;
    const dLng = 77.6408;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [(pLng + dLng) / 2, (pLat + dLat) / 2],
      zoom: 12,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Add Pickup Pin (Green)
    const pickupEl = document.createElement("div");
    pickupEl.className =
      "flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-black font-bold text-xs border-2 border-white shadow-lg";
    pickupEl.innerHTML = "P";
    new mapboxgl.Marker({ element: pickupEl })
      .setLngLat([pLng, pLat])
      .addTo(map.current);

    // Add Dropoff Pin (Blue)
    const dropEl = document.createElement("div");
    dropEl.className =
      "flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white font-bold text-xs border-2 border-white shadow-lg";
    dropEl.innerHTML = "D";
    new mapboxgl.Marker({ element: dropEl })
      .setLngLat([dLng, dLat])
      .addTo(map.current);

    // Create Vehicle Marker (Car)
    const carEl = document.createElement("div");
    carEl.className =
      "flex items-center justify-center w-10 h-10 rounded-full bg-amber-400 text-black font-bold text-base border-2 border-white shadow-2xl animate-pulse";
    carEl.innerHTML = "🚗";
    driverMarker.current = new mapboxgl.Marker({ element: carEl })
      .setLngLat([pLng, pLat])
      .addTo(map.current);

    // Draw Route Polyline
    fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${pLng},${pLat};${dLng},${dLat}?geometries=geojson&access_token=${token}`
    )
      .then((r) => r.json())
      .then((data) => {
        const route = data.routes?.[0]?.geometry?.coordinates;
        if (!route || !map.current) return;

        map.current.on("load", () => {
          if (!map.current) return;

          map.current.addSource("route", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: route,
              },
            },
          });

          map.current.addLayer({
            id: "route",
            type: "line",
            source: "route",
            paint: {
              "line-color": "#1bd677",
              "line-width": 5,
              "line-opacity": 0.85,
            },
          });
        });
      });

    return () => {
      map.current?.remove();
    };
  }, [token, delivery]);

  // 4. Update Driver Car Marker whenever WebSocket sends new GPS pulse!
  useEffect(() => {
    if (driverMarker.current && liveDriverPos) {
      driverMarker.current.setLngLat([
        liveDriverPos.lng,
        liveDriverPos.lat,
      ]);

      // Smoothly pan camera towards vehicle
      map.current?.easeTo({
        center: [liveDriverPos.lng, liveDriverPos.lat],
        duration: 1000,
      });
    }
  }, [liveDriverPos]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </Button>

          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span>Live Rescue Radar</span>
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  wsConnected
                    ? "bg-emerald-500 animate-ping"
                    : "bg-destructive"
                }`}
              />
            </h1>

            <p className="text-xs text-muted-foreground mt-0.5">
              WebSocket stream:{" "}
              {wsConnected ? "Connected (Real-Time)" : "Connecting..."}
            </p>
          </div>
        </div>

        <Badge
          variant={liveStatus === "DELIVERED" ? "success" : "default"}
          className="text-xs font-bold px-3 py-1"
        >
          {liveStatus}
        </Badge>
      </div>

      {/* Grid: Map on Left, Live Status on Right */}
      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2">
          <div
            ref={mapContainer}
            className="w-full h-[450px] sm:h-[500px] rounded-2xl overflow-hidden border border-border shadow-xl"
          />
        </div>

        <div className="space-y-6">
          <Card className="border-border shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Mission Progress
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4 text-xs">
              {/* Stepper */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                      ["ACCEPTED", "PICKED_UP", "ON_THE_WAY", "DELIVERED"].includes(
                        liveStatus
                      )
                        ? "bg-primary text-black"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    ✓
                  </div>

                  <span
                    className={
                      liveStatus === "ACCEPTED"
                        ? "font-bold text-primary"
                        : "text-foreground"
                    }
                  >
                    Driver Assigned
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div
                    className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                      ["PICKED_UP", "ON_THE_WAY", "DELIVERED"].includes(
                        liveStatus
                      )
                        ? "bg-primary text-black"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    ✓
                  </div>

                  <span
                    className={
                      liveStatus === "PICKED_UP"
                        ? "font-bold text-primary"
                        : "text-foreground"
                    }
                  >
                    Food Picked Up from Donor
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div
                    className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                      ["ON_THE_WAY", "DELIVERED"].includes(liveStatus)
                        ? "bg-primary text-black"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    ✓
                  </div>

                  <span
                    className={
                      liveStatus === "ON_THE_WAY"
                        ? "font-bold text-primary"
                        : "text-foreground"
                    }
                  >
                    In Transit (On the Way)
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div
                    className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                      liveStatus === "DELIVERED"
                        ? "bg-emerald-500 text-black"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    ✓
                  </div>

                  <span
                    className={
                      liveStatus === "DELIVERED"
                        ? "font-bold text-emerald-400"
                        : "text-foreground"
                    }
                  >
                    Delivered to Shelter
                  </span>
                </div>
              </div>

              {liveDriverPos && (
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary mt-4">
                  <div className="font-bold flex items-center gap-1.5">
                    <Navigation className="h-3.5 w-3.5" />
                    <span>Live GPS Pulse</span>
                  </div>

                  <div className="font-mono text-[11px] mt-1">
                    Lat: {liveDriverPos.lat.toFixed(5)}, Lng:{" "}
                    {liveDriverPos.lng.toFixed(5)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}