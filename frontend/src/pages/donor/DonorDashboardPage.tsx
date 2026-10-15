import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Utensils,
  Clock,
  MapPin,
  CheckCircle2,
  Loader2,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Ban,
  Archive,
  Video,
  X,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Pencil,
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
  removeAuthToken,
  parseMediaUrls,
  isVideoMedia,
} from "@/lib/api";

interface Donation {
  id: string;
  title: string;
  food_type: string;
  description?: string;
  quantity_kg: number;
  servings: number;
  pickup_address: string;
  latitude: number;
  longitude: number;
  status:
    | "AVAILABLE"
    | "REQUESTED"
    | "ACCEPTED"
    | "PICKED_UP"
    | "ON_THE_WAY"
    | "DELIVERED"
    | "CANCELLED"
    | "EXPIRED";
  expires_at: string;
  created_at: string;
  media_urls?: string[] | string;
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

      {/* Hover Click-to-Zoom Indicator */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-semibold backdrop-blur-[2px] pointer-events-none">
        <Maximize2 className="h-4 w-4" />
        <span>Click to view gallery ({urls.length} media)</span>
      </div>

      {/* Multi-item Navigation Controls on Card */}
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

          {/* Counter Badge */}
          <span className="absolute bottom-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/80 text-white backdrop-blur z-10">
            {currentIndex + 1} / {urls.length}
          </span>

          {/* Dots Indicator */}
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

export function DonorDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = getAuthToken();

  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [donationToCancel, setDonationToCancel] = useState<Donation | null>(null);
  const [claimedWarningId, setClaimedWarningId] = useState<string | null>(null);
  const [claimedEditWarningId, setClaimedEditWarningId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Fullscreen Interactive Lightbox Gallery state
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  // Keyboard Navigation for Lightbox (Left / Right / Escape)
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

  // Show a warning popup when attempting to edit a claimed donation
  const triggerClaimedEditPopup = (id: string) => {
    setClaimedEditWarningId(id);
    setClaimedWarningId(null);
    setTimeout(() => {
      setClaimedEditWarningId((current) => (current === id ? null : current));
    }, 4000);
  };

  // Show a warning popup when attempting to cancel a claimed donation
  const triggerClaimedPopup = (id: string) => {
    setClaimedWarningId(id);
    setClaimedEditWarningId(null);
    setTimeout(() => {
      setClaimedWarningId((current) => (current === id ? null : current));
    }, 4000);
  };

  // 1. Fetch My Donations
  const {
    data: donations,
    isLoading,
    error,
  } = useQuery<Donation[]>({
    queryKey: ["myDonations"],
    queryFn: () => apiFetch("/donations/my"),
    enabled: !!token,
  });

  // 2. Cancel Donation Mutation
  const cancelMutation = useMutation({
    mutationFn: (donationId: string) =>
      apiFetch(`/donations/${donationId}/cancel`, {
        method: "PATCH",
      }),
    onSuccess: () => {
      setSuccessToast("Donation cancelled successfully");
      setDonationToCancel(null);
      setCancelError(null);
      setClaimedWarningId(null);
      setClaimedEditWarningId(null);

      queryClient.invalidateQueries({
        queryKey: ["myDonations"],
      });

      setTimeout(() => {
        setSuccessToast(null);
      }, 3500);
    },
    onError: (err: any) => {
      setCancelError(err?.message || "Failed to cancel donation.");
    },
  });

  const handleLogout = () => {
    removeAuthToken();
    navigate("/login");
  };

  if (!token) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <AlertCircle className="h-12 w-12 text-primary mb-4" />
        <h2 className="text-2xl font-bold">Authentication Required</h2>
        <p className="text-muted-foreground mt-2 mb-6">
          Please log in to manage your food donations.
        </p>
        <Link to="/login">
          <Button>Sign In</Button>
        </Link>
      </div>
    );
  }

  const activeListings =
    (Array.isArray(donations) ? donations : []).filter((d) =>
      [
        "AVAILABLE",
        "REQUESTED",
        "ACCEPTED",
        "PICKED_UP",
        "ON_THE_WAY",
      ].includes(d.status)
    );

  const historyListings =
    (Array.isArray(donations) ? donations : []).filter((d) =>
      ["DELIVERED", "CANCELLED", "EXPIRED"].includes(d.status)
    );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Toast Notification */}
      <AnimatePresence>
        {successToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-5 right-5 z-50 p-4 rounded-xl bg-emerald-500 text-black font-bold flex items-center gap-2 shadow-2xl border border-white/20"
          >
            <CheckCircle2 className="h-5 w-5" />
            <span>{successToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

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
              {/* Header */}
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

              {/* Main Media Viewport */}
              <div className="relative w-full flex-1 flex items-center justify-center my-3 min-h-[300px] max-h-[65vh] overflow-hidden">
                {/* Previous Button */}
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

                {/* Media Element */}
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

                {/* Next Button */}
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

              {/* Bottom Thumbnail Carousel Strip */}
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
            <span>Donor Console</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Manage Surplus Food</h1>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/donor/create">
            <Button className="gap-2 shadow-lg">
              <Plus className="h-4 w-4" />
              <span>List New Food</span>
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex bg-card border border-border p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("active")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === "active"
              ? "bg-primary text-primary-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Active Listings ({activeListings.length})
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === "history"
              ? "bg-primary text-primary-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          History & Terminal ({historyListings.length})
        </button>
      </div>

      {/* Listings */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-sm">
          {(error as any)?.message || "Failed to load donations."}
        </div>
      ) : activeTab === "active" ? (
        activeListings.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-dashed border-border bg-card/40">
            <Utensils className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-bold">No active food listings</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto mt-1 mb-6">
              You don't have any surplus food active right now.
            </p>
            <Link to="/donor/create">
              <Button>List Surplus Food</Button>
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {activeListings.map((d) => {
                const urls = parseMediaUrls(d.media_urls);

                return (
                  <motion.div
                    key={d.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, y: 15 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Card className="flex flex-col justify-between h-full border-border hover:border-primary/50 transition-all shadow-md overflow-hidden">
                      {/* Multi-Photo Carousel Card Header */}
                      <DonationCardMedia
                        urls={urls}
                        title={d.title}
                        onOpenLightbox={(idx) =>
                          setLightbox({ urls, index: idx, title: d.title })
                        }
                      />

                      <CardHeader>
                        <div className="flex justify-between items-start mb-2">
                          <Badge
                            variant={d.status === "AVAILABLE" ? "success" : "default"}
                            className="font-bold text-xs"
                          >
                            {d.status === "AVAILABLE" ? "PUBLISHED" : d.status}
                          </Badge>
                          <span className="text-xs text-primary font-semibold">{d.food_type}</span>
                        </div>
                        <CardTitle className="text-xl">{d.title}</CardTitle>
                        <CardDescription className="flex items-center gap-1.5 pt-1 text-xs">
                          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate">{d.pickup_address}</span>
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between text-sm py-2 px-3 rounded-lg bg-secondary/50">
                          <div>
                            <span className="text-xs text-muted-foreground block">Portions</span>
                            <span className="font-bold text-foreground">{d.servings} Servings</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-muted-foreground block">Weight</span>
                            <span className="font-bold text-foreground">{d.quantity_kg} kg</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Expires: {new Date(d.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          </span>
                        </div>

                        {/* Card Action Buttons (Edit + Cancel Listing) */}
                        <div className="relative pt-1 space-y-2">
                          <AnimatePresence>
                            {/* Popup Warning for Edit (when claimed) */}
                            {claimedEditWarningId === d.id && (
                              <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                transition={{ duration: 0.2 }}
                                className="absolute bottom-full left-0 right-0 mb-3 z-30 p-3 rounded-xl bg-card border border-amber-500/50 shadow-2xl text-xs leading-relaxed flex items-start gap-2.5"
                              >
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                                <div className="flex-1">
                                  <span className="font-bold text-foreground block mb-0.5">
                                    Editing Not Applicable
                                  </span>
                                  <span className="text-amber-300">
                                    This donation can no longer be edited because it has already been claimed.
                                  </span>
                                </div>
                                {/* Pointer arrow pointing directly down to Edit button */}
                                <div className="absolute -bottom-1.5 left-1/4 -translate-x-1/2 w-3 h-3 bg-card border-r border-b border-amber-500/50 rotate-45" />
                              </motion.div>
                            )}

                            {/* Popup Warning for Cancel (when claimed) */}
                            {claimedWarningId === d.id && (
                              <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                transition={{ duration: 0.2 }}
                                className="absolute bottom-full left-0 right-0 mb-3 z-30 p-3 rounded-xl bg-card border border-amber-500/50 shadow-2xl text-xs leading-relaxed flex items-start gap-2.5"
                              >
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                                <div className="flex-1">
                                  <span className="font-bold text-foreground block mb-0.5">
                                    Cancellation Not Applicable
                                  </span>
                                  <span className="text-amber-300">
                                    An NGO has already claimed your food donation.
                                  </span>
                                </div>
                                {/* Pointer arrow pointing directly down to Cancel button */}
                                <div className="absolute -bottom-1.5 left-3/4 -translate-x-1/2 w-3 h-3 bg-card border-r border-b border-amber-500/50 rotate-45" />
                              </motion.div>
                            )}
                          </AnimatePresence>

                          <div className="flex items-center gap-2">
                            {/* EDIT BUTTON */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (d.status !== "AVAILABLE") {
                                  triggerClaimedEditPopup(d.id);
                                  return;
                                }
                                setClaimedEditWarningId(null);
                                setClaimedWarningId(null);
                                navigate(`/donor/create?edit=${d.id}`, { state: { donation: d } });
                              }}
                              className={`flex-1 gap-1.5 text-xs transition-all font-semibold ${
                                d.status === "AVAILABLE"
                                  ? "border-primary/40 text-primary hover:bg-primary/10 cursor-pointer"
                                  : "border-border/80 text-muted-foreground/70 bg-secondary/30 hover:border-amber-500/50 hover:text-amber-400 cursor-pointer"
                              }`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </Button>

                            {/* CANCEL BUTTON */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (d.status !== "AVAILABLE") {
                                  triggerClaimedPopup(d.id);
                                  return;
                                }
                                setClaimedWarningId(null);
                                setClaimedEditWarningId(null);
                                setCancelError(null);
                                setDonationToCancel(d);
                              }}
                              className={`flex-1 gap-1.5 text-xs transition-all ${
                                d.status === "AVAILABLE"
                                  ? "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                                  : "border-border/80 text-muted-foreground/70 bg-secondary/30 hover:border-amber-500/50 hover:text-amber-400 cursor-pointer"
                              }`}
                            >
                              <Ban className="h-3.5 w-3.5" />
                              <span>Cancel Listing</span>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )
      ) : (
        /* TAB 2: HISTORY */
        historyListings.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-dashed border-border bg-card/40">
            <Archive className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-bold">No past donation history</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto mt-1">
              Completed and cancelled listings will appear here.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {historyListings.map((d) => {
              const urls = parseMediaUrls(d.media_urls);

              return (
                <Card key={d.id} className="border-border bg-card/60 overflow-hidden">
                  <DonationCardMedia
                    urls={urls}
                    title={d.title}
                    onOpenLightbox={(idx) =>
                      setLightbox({ urls, index: idx, title: d.title })
                    }
                  />
                  <CardHeader>
                    <div className="flex justify-between items-start mb-2">
                      <Badge
                        variant={
                          d.status === "DELIVERED"
                            ? "success"
                            : d.status === "CANCELLED"
                            ? "destructive"
                            : "outline"
                        }
                        className="text-xs font-bold"
                      >
                        {d.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{d.food_type}</span>
                    </div>
                    <CardTitle className="text-lg">{d.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground space-y-2">
                    <div>{d.servings} Servings ({d.quantity_kg} kg)</div>
                    <div>📍 {d.pickup_address}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* Cancel Confirmation Dialog */}
      <AnimatePresence>
        {donationToCancel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-md"
            >
              <Card className="border-border bg-card shadow-2xl overflow-hidden">
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15 border border-destructive/30 text-destructive mb-3">
                    <AlertTriangle className="h-7 w-7" />
                  </div>
                  <CardTitle className="text-2xl font-bold">Cancel Donation?</CardTitle>
                  <CardDescription className="text-sm pt-1">
                    Are you sure you want to cancel this food donation? NGOs will no longer be able to claim it.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <div className="p-3 rounded-xl bg-secondary/50 border border-border text-xs space-y-1">
                    <span className="font-bold text-foreground block">{donationToCancel.title}</span>
                    <span className="text-muted-foreground block">
                      {donationToCancel.servings} Servings • {donationToCancel.food_type}
                    </span>
                  </div>
                  {cancelError && (
                    <div className="p-3 text-xs rounded-xl bg-destructive/15 border border-destructive/30 text-destructive">
                      {cancelError}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDonationToCancel(null);
                        setCancelError(null);
                      }}
                      disabled={cancelMutation.isPending}
                      className="w-full"
                    >
                      Keep Listing
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => cancelMutation.mutate(donationToCancel.id)}
                      disabled={cancelMutation.isPending}
                      className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold"
                    >
                      {cancelMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Ban className="h-4 w-4" />
                      )}
                      <span>Cancel Donation</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}