import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  MapPin,
  Utensils,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Navigation,
  Loader2,
  Filter,
  Sparkles,
  Map as MapIcon,
  Video,
  X,
  Maximize2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  apiFetch,
  getAuthToken,
  getUserRole,
  removeAuthToken,
  parseMediaUrls,
  isVideoMedia,
  formatUploadedDateTime,
  formatRelativeTime,
} from "@/lib/api";

interface NearbyDonation {
  id: string;
  donor_id: string;
  title: string;
  food_type: string;
  description?: string;
  quantity_kg: number;
  servings: number;
  pickup_address: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  status: string;
  expires_at: string;
  created_at: string;
  updated_at?: string;
  published_at?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  expiresAt?: string;
  media_urls?: string[];
}

interface MyClaim {
  claim_id: string;
  donation_id: string;
  delivery_id?: string;
  title: string;
  food_type: string;
  servings: number;
  servings_requested: number;
  pickup_address: string;
  claim_status: string;
  donation_status: string;
  expires_at: string;
  created_at: string;
  updated_at?: string;
  published_at?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  expiresAt?: string;
}

interface LightboxState {
  urls: string[];
  index: number;
  title: string;
}

// Interactive Multi-Media Card Carousel
function DonationCardMedia({
  urls,
  title,
  onOpenLightbox,
}: {
  urls: string[];
  title: string;
  onOpenLightbox: (index: number) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!urls || urls.length === 0) return null;

  const currentUrl = urls[currentIndex] || urls[0];
  const isVideo = isVideoMedia(currentUrl);

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : urls.length - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev < urls.length - 1 ? prev + 1 : 0));
  };

  return (
    <div
      onClick={() => onOpenLightbox(currentIndex)}
      className="w-full h-48 overflow-hidden bg-black/60 border-b border-border relative group cursor-pointer select-none"
      title="Click to view full size gallery"
    >
      {isVideo ? (
        <div className="relative w-full h-full flex items-center justify-center bg-black">
          <video
            src={currentUrl}
            className="w-full h-full object-cover"
            muted
            autoPlay
            loop
            playsInline
          />
          <div className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white backdrop-blur">
            <Video className="h-3.5 w-3.5" />
          </div>
        </div>
      ) : (
        <img
          src={currentUrl}
          alt={`${title} - photo ${currentIndex + 1}`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      )}

      {/* Hover Zoom Prompt */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-semibold backdrop-blur-[2px] pointer-events-none">
        <Maximize2 className="h-4 w-4" />
        <span>Click to view gallery ({urls.length} media)</span>
      </div>

      {urls.length > 1 && (
        <>
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/75 text-white hover:bg-black hover:scale-110 transition-all opacity-0 group-hover:opacity-100 z-10 shadow-lg"
            title="Previous media"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/75 text-white hover:bg-black hover:scale-110 transition-all opacity-0 group-hover:opacity-100 z-10 shadow-lg"
            title="Next media"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <span className="absolute bottom-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/80 text-white backdrop-blur z-10">
            {currentIndex + 1} / {urls.length}
          </span>

          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10">
            {urls.map((_, idx) => (
              <span
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(idx);
                }}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  idx === currentIndex
                    ? "w-4 bg-primary"
                    : "w-1.5 bg-white/60 hover:bg-white"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NGODashboardContent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = getAuthToken();
  const userRole = getUserRole();
  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

  const [activeTab, setActiveTab] = useState<"nearby" | "myClaims">("nearby");
  const [radiusKm, setRadiusKm] = useState(25);
  const [foodType, setFoodType] = useState<string>("");
  const [selectedDonation, setSelectedDonation] = useState<NearbyDonation | null>(null);
  const [servingsToClaim, setServingsToClaim] = useState(20);
  const [notes, setNotes] = useState("");

  // Fullscreen Interactive Lightbox Gallery state
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lightbox) return;
      if (e.key === "Escape") {
        setLightbox(null);
      } else if (e.key === "ArrowLeft") {
        setLightbox((prev) =>
          prev
            ? { ...prev, index: prev.index > 0 ? prev.index - 1 : prev.urls.length - 1 }
            : null
        );
      } else if (e.key === "ArrowRight") {
        setLightbox((prev) =>
          prev
            ? { ...prev, index: prev.index < prev.urls.length - 1 ? prev.index + 1 : 0 }
            : null
        );
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightbox]);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const [coords] = useState({ lat: 12.9716, lng: 77.5946 });

  // 1. Query Nearby Donations
  const { data: nearbyDonations, isLoading: loadingNearby, error: errorNearby } = useQuery<NearbyDonation[]>({
    queryKey: ["nearbyDonations", radiusKm, foodType, coords],
    queryFn: () => {
      let url = `/ngo/nearby?latitude=${coords.lat}&longitude=${coords.lng}&radius_km=${radiusKm}`;
      if (foodType) url += `&food_type=${encodeURIComponent(foodType)}`;
      return apiFetch(url);
    },
    enabled: !!token && activeTab === "nearby",
  });

  // 2. Query NGO's Claims
  const { data: myClaims, isLoading: loadingClaims } = useQuery<MyClaim[]>({
    queryKey: ["myClaims"],
    queryFn: () => apiFetch("/ngo/claims/my"),
    enabled: !!token && activeTab === "myClaims",
  });

  const donationsList: NearbyDonation[] = Array.isArray(nearbyDonations) ? nearbyDonations : [];
  const claimsList: MyClaim[] = Array.isArray(myClaims) ? myClaims : [];

  // 3. Claim Food Mutation
  const claimMutation = useMutation({
    mutationFn: () => {
      if (!selectedDonation) throw new Error("No donation selected");
      return apiFetch(`/ngo/donations/${selectedDonation.id}/request`, {
        method: "POST",
        body: JSON.stringify({
          servings_requested: Number(servingsToClaim),
          notes,
        }),
      });
    },
    onSuccess: () => {
      setSelectedDonation(null);
      queryClient.invalidateQueries({ queryKey: ["nearbyDonations"] });
      queryClient.invalidateQueries({ queryKey: ["myClaims"] });
      setActiveTab("myClaims");
    },
  });

  // 4. Safe Mapbox Initialization
  useEffect(() => {
    if (!mapContainer.current || activeTab !== "nearby") return;

    if (!mapboxToken) {
      setMapError("Mapbox access token is not configured.");
      return;
    }

    let mapInstance: mapboxgl.Map | null = null;

    try {
      mapboxgl.accessToken = mapboxToken;
      mapInstance = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [coords.lng, coords.lat],
        zoom: 11,
      });

      mapInstance.addControl(new mapboxgl.NavigationControl(), "top-right");

      mapInstance.on("load", () => {
        map.current = mapInstance;
        setMapLoaded(true);
      });

      mapInstance.on("error", (e) => {
        console.warn("Mapbox internal event error:", e);
      });
    } catch (err: any) {
      console.error("Mapbox init failed:", err);
      setMapError("Interactive map could not load. Food cards below remain fully usable.");
    }

    return () => {
      setMapLoaded(false);
      try {
        if (mapInstance) {
          mapInstance.remove();
        }
      } catch (e) {}
      map.current = null;
    };
  }, [mapboxToken, activeTab, coords.lat, coords.lng]);

  // 5. Place Pins only after the map is fully loaded
  useEffect(() => {
    if (!mapLoaded || !map.current || activeTab !== "nearby") return;

    markers.current.forEach((m) => {
      try { m.remove(); } catch (e) {}
    });
    markers.current = [];

    if (donationsList.length === 0) return;

    try {
      const bounds = new mapboxgl.LngLatBounds();
      let pinsAdded = 0;

      donationsList.forEach((d) => {
        if (typeof d.latitude !== "number" || typeof d.longitude !== "number") return;
        if (isNaN(d.latitude) || isNaN(d.longitude)) return;

        const el = document.createElement("div");
        el.className = "flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-black shadow-lg cursor-pointer border-2 border-white hover:scale-125 transition-transform";
        el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/></svg>`;

        el.addEventListener("click", () => {
          setSelectedDonation(d);
          setServingsToClaim(d.servings || 20);
        });

        const popupHtml = `
          <div style="color: #0c1c13; padding: 4px; font-family: sans-serif;">
            <h4 style="font-weight: bold; margin: 0 0 2px 0;">${d.title || "Surplus Food"}</h4>
            <p style="font-size: 11px; margin: 0; color: #555;">${d.servings || 0} Servings • ${d.food_type || ""}</p>
            <p style="font-size: 11px; margin: 2px 0 0 0; color: #047857; font-weight: bold;">📍 ${d.distance_km ?? 0} km away</p>
          </div>
        `;

        if (map.current) {
          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([d.longitude, d.latitude])
            .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(popupHtml))
            .addTo(map.current);

          markers.current.push(marker);
          bounds.extend([d.longitude, d.latitude]);
          pinsAdded++;
        }
      });

      if (pinsAdded > 0 && map.current) {
        map.current.fitBounds(bounds, { padding: 60, maxZoom: 13 });
      }
    } catch (err) {
      console.warn("Error placing map markers:", err);
    }
  }, [mapLoaded, donationsList, activeTab]);

  const handleLogout = () => {
    removeAuthToken();
    navigate("/login");
  };

  if (!token) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <AlertCircle className="h-12 w-12 text-primary mb-4" />
        <h2 className="text-2xl font-bold">Authentication Required</h2>
        <p className="text-muted-foreground mt-2 mb-6">Please log in to browse and request nearby food.</p>
        <Link to="/login">
          <Button>Sign In to NGO Portal</Button>
        </Link>
      </div>
    );
  }

  if (userRole && userRole !== "NGO") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-4">
          <AlertCircle className="h-10 w-10 mx-auto" />
        </div>
        <h2 className="text-2xl font-bold">Access Restricted</h2>
        <p className="text-muted-foreground mt-2 mb-6 max-w-sm">
          This portal is reserved for registered NGOs and shelters. Your account role is {userRole}.
        </p>
        <Button onClick={handleLogout} variant="outline">
          Sign in with different account
        </Button>
      </div>
    );
  }

  const modalUrls = selectedDonation ? parseMediaUrls(selectedDonation.media_urls) : [];
  const modalMedia = modalUrls[0];
  const isModalVideo = isVideoMedia(modalMedia);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* FULLSCREEN LIGHTBOX GALLERY MODAL */}
      <AnimatePresence>
        {lightbox && (
          <div
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-zoom-out"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-5xl max-h-[92vh] flex flex-col items-center justify-between rounded-2xl overflow-hidden bg-black/95 border border-white/15 p-4 shadow-2xl cursor-default"
            >
              <div className="w-full flex items-center justify-between pb-3 border-b border-white/10 text-white z-20">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm truncate max-w-md">{lightbox.title}</span>
                  {lightbox.urls.length > 1 && (
                    <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-white/10">
                      {lightbox.index + 1} of {lightbox.urls.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setLightbox(null)}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="relative w-full flex-1 flex items-center justify-center my-3 min-h-[300px] max-h-[65vh] overflow-hidden">
                {lightbox.urls.length > 1 && (
                  <button
                    onClick={() =>
                      setLightbox((prev) =>
                        prev
                          ? {
                              ...prev,
                              index: prev.index > 0 ? prev.index - 1 : prev.urls.length - 1,
                            }
                          : null
                      )
                    }
                    className="absolute left-2 z-20 p-2.5 rounded-full bg-black/70 hover:bg-black text-white hover:scale-110 transition-all border border-white/20 cursor-pointer shadow-xl"
                    title="Previous (Left Arrow)"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                )}

                {isVideoMedia(lightbox.urls[lightbox.index]) ? (
                  <video
                    key={lightbox.urls[lightbox.index]}
                    src={lightbox.urls[lightbox.index]}
                    controls
                    autoPlay
                    playsInline
                    className="max-w-full max-h-[60vh] object-contain rounded-xl shadow-lg"
                  />
                ) : (
                  <img
                    key={lightbox.urls[lightbox.index]}
                    src={lightbox.urls[lightbox.index]}
                    alt={`${lightbox.title} - ${lightbox.index + 1}`}
                    className="max-w-full max-h-[60vh] object-contain rounded-xl shadow-lg"
                  />
                )}

                {lightbox.urls.length > 1 && (
                  <button
                    onClick={() =>
                      setLightbox((prev) =>
                        prev
                          ? {
                              ...prev,
                              index: prev.index < prev.urls.length - 1 ? prev.index + 1 : 0,
                            }
                          : null
                      )
                    }
                    className="absolute right-2 z-20 p-2.5 rounded-full bg-black/70 hover:bg-black text-white hover:scale-110 transition-all border border-white/20 cursor-pointer shadow-xl"
                    title="Next (Right Arrow)"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                )}
              </div>

              {lightbox.urls.length > 1 && (
                <div className="w-full flex items-center justify-center gap-2 pt-2 border-t border-white/10 overflow-x-auto py-1">
                  {lightbox.urls.map((url, idx) => {
                    const isVid = isVideoMedia(url);
                    const isActive = idx === lightbox.index;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() =>
                          setLightbox((prev) => (prev ? { ...prev, index: idx } : null))
                        }
                        className={`relative h-14 w-14 rounded-lg overflow-hidden border-2 transition-all shrink-0 cursor-pointer ${
                          isActive
                            ? "border-primary scale-105 shadow-md shadow-primary/30"
                            : "border-white/20 opacity-60 hover:opacity-100"
                        }`}
                      >
                        {isVid ? (
                          <div className="w-full h-full bg-black flex items-center justify-center text-white">
                            <Video className="h-4 w-4" />
                          </div>
                        ) : (
                          <img src={url} alt={`thumb-${idx}`} className="w-full h-full object-cover" />
                        )}
                        {isVid && (
                          <span className="absolute bottom-0.5 right-0.5 p-0.5 rounded bg-black/80 text-[8px] font-bold text-white">
                            VID
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
            <Sparkles className="h-4 w-4" />
            <span>NGO Rescue Console</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Available Food Radar</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-card border border-border p-1 rounded-xl">
            <button
              onClick={() => setActiveTab("nearby")}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "nearby" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
              }`}
            >
              Nearby Available
            </button>
            <button
              onClick={() => setActiveTab("myClaims")}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "myClaims" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
              }`}
            >
              My Claims {claimsList.length > 0 ? `(${claimsList.length})` : ""}
            </button>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      {activeTab === "nearby" && (
        <div className="mt-6 space-y-6">
          {/* Controls Bar */}
          <div className="p-4 rounded-2xl bg-card border border-border flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex-1 w-full flex items-center gap-4">
              <Navigation className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1">
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Search Radius</span>
                  <span className="text-primary font-bold">{radiusKm} km</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="1"
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={foodType}
                onChange={(e) => setFoodType(e.target.value)}
                className="h-9 px-3 rounded-lg border border-border bg-secondary text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">All Categories</option>
                <option value="Cooked Meals">Cooked Meals</option>
                <option value="Bakery / Bread">Bakery / Bread</option>
                <option value="Produce / Fruits">Produce / Fruits</option>
                <option value="Packaged Groceries">Packaged Groceries</option>
              </select>
            </div>
          </div>

          {/* EMBEDDED MAPBOX RADAR */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                <MapIcon className="h-3.5 w-3.5 text-primary" />
                Live Geospatial Food Radar
              </span>
              <span className="text-primary font-bold">
                {donationsList.length} Pin{donationsList.length === 1 ? "" : "s"} within {radiusKm} km
              </span>
            </div>
            {mapError ? (
              <div className="w-full h-72 sm:h-80 rounded-2xl border border-border bg-card/60 flex flex-col items-center justify-center p-6 text-center shadow-xl">
                <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                <h4 className="text-sm font-bold text-foreground">Map Radar Notice</h4>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">{mapError}</p>
              </div>
            ) : (
              <div ref={mapContainer} className="w-full h-72 sm:h-80 rounded-2xl overflow-hidden border border-border shadow-xl bg-card" />
            )}
          </div>

          {/* LISTINGS GRID WITH MULTI-MEDIA CAROUSEL CARDS */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
              Available Donation Cards
            </h3>

            {loadingNearby ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : errorNearby ? (
              <div className="p-4 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-sm">
                {(errorNearby as any).message || "Failed to load nearby donations."}
              </div>
            ) : donationsList.length === 0 ? (
              <div className="text-center py-16 rounded-2xl border border-dashed border-border bg-card/40">
                <Utensils className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="text-base font-bold">No food listings found within {radiusKm} km</h3>
                <p className="text-muted-foreground text-xs max-w-sm mx-auto mt-1">
                  Adjust the radius slider or create a fresh donation listing as a Donor.
                </p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {donationsList.map((d) => {
                  const urls = parseMediaUrls(d.media_urls);
                  const uploadIso = d.created_at || d.createdAt || d.published_at || d.publishedAt;

                  return (
                    <Card key={d.id} className="flex flex-col justify-between hover:border-primary/50 transition-all overflow-hidden shadow-md">
                      {/* Interactive Multi-Media Carousel Header */}
                      <DonationCardMedia
                        urls={urls}
                        title={d.title}
                        onOpenLightbox={(idx) =>
                          setLightbox({ urls, index: idx, title: d.title })
                        }
                      />

                      <CardHeader>
                        <div className="flex justify-between items-start mb-2">
                          <Badge variant="success" className="gap-1 font-bold">
                            <Navigation className="h-3 w-3" />
                            <span>{d.distance_km ?? 0} km away</span>
                          </Badge>
                          <span className="text-xs text-primary font-semibold">{d.food_type}</span>
                        </div>
                        <CardTitle className="text-lg">{d.title}</CardTitle>
                        <CardDescription className="flex items-center gap-1.5 pt-1 text-xs">
                          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate">{d.pickup_address}</span>
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between text-sm py-2 px-3 rounded-lg bg-secondary/50">
                          <div>
                            <span className="text-xs text-muted-foreground block">Available</span>
                            <span className="font-bold text-foreground">{d.servings} Meals</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-muted-foreground block">Weight</span>
                            <span className="font-bold text-foreground">{d.quantity_kg} kg</span>
                          </div>
                        </div>

                        {/* Timestamps Section: Exact Creation & Expiration */}
                        <div className="space-y-1.5 pt-1 border-t border-border/50 text-xs">
                          {/* Uploaded Timestamp */}
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span className="flex items-center gap-1 font-medium text-foreground/80">
                              <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span>Uploaded:</span>
                            </span>
                            <div className="text-right">
                              <span className="font-semibold text-foreground">
                                {formatUploadedDateTime(uploadIso)}
                              </span>
                              {uploadIso && formatRelativeTime(uploadIso) && (
                                <span className="text-[10px] text-muted-foreground ml-1.5 font-normal">
                                  ({formatRelativeTime(uploadIso)})
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Expiry Timestamp */}
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                              <span>Expires:</span>
                            </span>
                            <span className="font-medium text-foreground/90">
                              {formatUploadedDateTime(d.expires_at || d.expiresAt)}
                            </span>
                          </div>
                        </div>

                        <Button
                          onClick={() => {
                            setSelectedDonation(d);
                            setServingsToClaim(d.servings || 20);
                          }}
                          className="w-full gap-2 mt-2"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Request This Food</span>
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MY CLAIMS */}
      {activeTab === "myClaims" && (
        <div className="mt-8">
          {loadingClaims ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : claimsList.length === 0 ? (
            <div className="text-center py-20 rounded-2xl border border-dashed border-border bg-card/40">
              <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-bold">No active claims yet</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto mt-1 mb-6">
                Switch to the "Nearby Available" tab to claim meals for your shelter.
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {claimsList.map((claim) => {
                const claimUploadIso = claim.created_at || claim.createdAt;

                return (
                  <Card key={claim.claim_id} className="border-border">
                    <CardHeader>
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant={claim.donation_status === "DELIVERED" ? "success" : "default"}>
                          {claim.donation_status}
                        </Badge>
                        <span className="text-xs text-primary font-semibold">{claim.food_type}</span>
                      </div>
                      <CardTitle className="text-lg">{claim.title}</CardTitle>
                      <CardDescription className="flex items-center gap-1.5 pt-1 text-xs">
                        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate">{claim.pickup_address}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="p-3 rounded-lg bg-secondary/50 flex justify-between">
                        <span className="text-muted-foreground">Requested Portions:</span>
                        <span className="font-bold text-foreground">{claim.servings_requested} Meals</span>
                      </div>

                      {/* Upload and Expiry Timestamps */}
                      <div className="space-y-1 pt-1 border-t border-border/50 text-xs">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="flex items-center gap-1 font-medium text-foreground/80">
                            <Calendar className="h-3 w-3 text-primary" />
                            <span>Uploaded:</span>
                          </span>
                          <span className="font-semibold text-foreground">
                            {formatUploadedDateTime(claimUploadIso)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-amber-400" />
                            <span>Expires:</span>
                          </span>
                          <span>
                            {formatUploadedDateTime(claim.expires_at || claim.expiresAt)}
                          </span>
                        </div>
                      </div>

                      {claim.delivery_id && (
                        <Link to={`/track/${claim.delivery_id}`}>
                          <Button size="sm" className="w-full gap-1.5 text-xs">
                            <Navigation className="h-3.5 w-3.5" />
                            <span>Track Delivery Live 📡</span>
                          </Button>
                        </Link>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CLAIM MODAL DIALOG */}
      {selectedDonation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md border-border bg-card shadow-2xl overflow-hidden">
            {/* Show photo preview inside claim modal */}
            {modalMedia && (
              <div
                onClick={() => setLightbox({ urls: modalUrls, index: 0, title: selectedDonation.title })}
                className="w-full h-36 bg-black overflow-hidden border-b border-border cursor-pointer relative group"
                title="Click to view full size gallery"
              >
                {isModalVideo ? (
                  <video src={modalMedia} className="w-full h-full object-cover" muted autoPlay loop playsInline />
                ) : (
                  <img src={modalMedia} alt="Food preview" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                )}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs gap-1 font-semibold">
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Click to expand ({modalUrls.length} media)</span>
                </div>
              </div>
            )}

            <CardHeader>
              <CardTitle className="text-xl">Claim {selectedDonation.title}</CardTitle>
              <CardDescription>
                {selectedDonation.distance_km ?? 0} km away • {selectedDonation.pickup_address}
              </CardDescription>

              {/* Uploaded date badge inside claim modal */}
              <div className="mt-2.5 p-2.5 rounded-xl bg-secondary/60 border border-border/60 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  <span>Uploaded:</span>
                </span>
                <span className="font-bold text-foreground">
                  {formatUploadedDateTime(selectedDonation.created_at || selectedDonation.createdAt || selectedDonation.published_at)}
                  {(selectedDonation.created_at || selectedDonation.createdAt) && formatRelativeTime(selectedDonation.created_at || selectedDonation.createdAt) && (
                    <span className="text-[10px] font-normal text-muted-foreground ml-1.5">
                      ({formatRelativeTime(selectedDonation.created_at || selectedDonation.createdAt)})
                    </span>
                  )}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Servings Needed</label>
                <input
                  type="number"
                  min="1"
                  max={selectedDonation.servings}
                  value={servingsToClaim}
                  onChange={(e) => setServingsToClaim(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Notes for Driver</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Please ring the main gate buzzer on arrival."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-3 rounded-lg border border-border bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="ghost" onClick={() => setSelectedDonation(null)} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={() => claimMutation.mutate()}
                  disabled={claimMutation.isPending}
                  className="flex-1 gap-2"
                >
                  {claimMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  <span>Confirm Claim</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export function NGODashboardPage() {
  return <NGODashboardContent />;
}