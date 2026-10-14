import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Utensils, 
  Clock, 
  MapPin, 
  Sparkles, 
  Loader2, 
  ArrowLeft, 
  UploadCloud, 
  Camera, 
  Video, 
  X, 
  Image as ImageIcon, 
  AlertCircle, 
  CheckCircle2 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { LocationPickerMap } from "@/components/maps/LocationPickerMap";
import { apiFetch, getAuthToken, resolveMediaUrl } from "@/lib/api";

interface UploadedMediaItem {
  id: string;
  url: string;
  media_type: "image" | "video";
  filename: string;
}

export function CreateDonationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = getAuthToken();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    food_type: "Cooked Meals",
    description: "",
    quantity_kg: 10,
    servings: 25,
    pickup_address: "Grand Palace Hotel, Main Banquet Gate, Bangalore",
    latitude: 12.9716,
    longitude: 77.5946,
    hours_until_expiry: 4,
  });

  // Uploaded Media URLs array
  const [mediaItems, setMediaItems] = useState<UploadedMediaItem[]>([]);

  // 1. Upload File Handler
  const handleUploadFiles = async (files: FileList | File[]) => {
    setMediaError(null);

    if (mediaItems.length + files.length > 5) {
      setMediaError("Maximum 5 media files allowed per donation listing.");
      return;
    }

    const videoCount = mediaItems.filter((m) => m.media_type === "video").length;
    const newVideos = Array.from(files).filter((f) => f.type.startsWith("video/")).length;
    if (videoCount + newVideos > 1) {
      setMediaError("You can upload at most 1 short video per listing.");
      return;
    }

    setUploading(true);

    for (const file of Array.from(files)) {
      // Client-side quick size validation
      if (file.type.startsWith("image/") && file.size > 10 * 1024 * 1024) {
        setMediaError(`Image '${file.name}' exceeds 10MB limit.`);
        continue;
      }
      if (file.type.startsWith("video/") && file.size > 30 * 1024 * 1024) {
        setMediaError(`Video '${file.name}' exceeds 30MB limit.`);
        continue;
      }

      try {
        const formDataPayload = new FormData();
        formDataPayload.append("file", file);

        const response = await fetch("http://localhost:8000/api/v1/donations/upload-media", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formDataPayload,
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || "Failed to upload file.");
        }

        const data = await response.json();
        const resolvedUrl = resolveMediaUrl(data.url);
        setMediaItems((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            url: resolvedUrl,
            media_type: data.media_type,
            filename: data.filename,
          },
        ]);
      } catch (err: any) {
        setMediaError(err.message || `Upload failed for ${file.name}`);
      }
    }

    setUploading(false);
  };

  // Remove a media item
  const handleRemoveMedia = (index: number) => {
    setMediaItems((prev) => prev.filter((_, i) => i !== index));
  };

  // 2. Submit Mutation
  const mutation = useMutation({
    mutationFn: async () => {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + Number(formData.hours_until_expiry));

      return apiFetch("/donations", {
        method: "POST",
        body: JSON.stringify({
          title: formData.title,
          food_type: formData.food_type,
          description: formData.description,
          quantity_kg: Number(formData.quantity_kg),
          servings: Number(formData.servings),
          pickup_address: formData.pickup_address,
          latitude: Number(formData.latitude),
          longitude: Number(formData.longitude),
          expires_at: expiresAt.toISOString(),
          media_urls: mediaItems.map((m) => m.url),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myDonations"] });
      queryClient.invalidateQueries({ queryKey: ["nearbyDonations"] });
      navigate("/donor/dashboard");
    },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Button variant="ghost" size="sm" onClick={() => navigate("/donor/dashboard")} className="gap-2 mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Button>

      <Card className="border-border shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-2 text-primary text-sm font-semibold">
            <Sparkles className="h-4 w-4" />
            <span>New Food Listing</span>
          </div>
          <CardTitle className="text-2xl font-bold">List Surplus Food for Rescue</CardTitle>
          <CardDescription>
            Shelters and verified NGOs will be alerted based on geographic proximity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            className="space-y-6"
          >
            {mutation.isError && (
              <div className="p-3 text-xs rounded-lg bg-destructive/15 border border-destructive/30 text-destructive">
                {(mutation.error as any).message || "Failed to create donation"}
              </div>
            )}

            {/* Food Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Listing Title</label>
              <input
                type="text"
                required
                placeholder="e.g. 50 Fresh Rice & Curry Packets"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Category & Portions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Food Type</label>
                <select
                  value={formData.food_type}
                  onChange={(e) => setFormData({ ...formData, food_type: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="Cooked Meals">Cooked Meals</option>
                  <option value="Bakery / Bread">Bakery / Bread</option>
                  <option value="Produce / Fruits">Produce / Fruits</option>
                  <option value="Packaged Groceries">Packaged Groceries</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Number of Servings</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={formData.servings}
                  onChange={(e) => setFormData({ ...formData, servings: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Weight (Approx Kg)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={formData.quantity_kg}
                  onChange={(e) => setFormData({ ...formData, quantity_kg: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* NEW SECTION: FOOD PHOTOS / VIDEO UPLOAD */}
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Camera className="h-4 w-4 text-primary" />
                  <span>Food Photos / Video</span>
                </label>
                <span className="text-[11px] text-muted-foreground">{mediaItems.length}/5 uploaded</span>
              </div>

              {mediaError && (
                <div className="p-3 text-xs rounded-xl bg-destructive/15 border border-destructive/30 text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{mediaError}</span>
                </div>
              )}

              {/* Drag-and-Drop Area */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files) handleUploadFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`relative p-6 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
                  isDragging
                    ? "border-primary bg-primary/10 scale-[1.01]"
                    : "border-border hover:border-primary/60 bg-secondary/30 hover:bg-secondary/50"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                  onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
                  className="hidden"
                />

                <div className="flex items-center gap-2 text-primary mb-2">
                  <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                    {uploading ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <UploadCloud className="h-6 w-6" />
                    )}
                  </div>
                </div>

                <span className="text-sm font-bold text-foreground">
                  {uploading ? "Uploading media securely..." : "Add Photos / Video"}
                </span>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Drag & drop food photos or a short video, or click to browse.
                </p>
                <span className="text-[10px] text-primary font-mono mt-2">
                  JPG, PNG, WEBP (≤10MB) • MP4, WEBM (≤30MB)
                </span>
              </div>

              {/* Preview Grid */}
              {mediaItems.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2">
                  <AnimatePresence>
                    {mediaItems.map((item, idx) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85 }}
                        className="group relative rounded-xl overflow-hidden border border-border bg-card shadow-sm aspect-square flex items-center justify-center"
                      >
                        {item.media_type === "image" ? (
                          <img
                            src={resolveMediaUrl(item.url)}
                            alt="Food preview"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="relative w-full h-full bg-black flex items-center justify-center">
                            <video src={resolveMediaUrl(item.url)} className="w-full h-full object-cover" muted />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <Video className="h-6 w-6 text-white" />
                            </div>
                          </div>
                        )}

                        {/* Top Badge */}
                        <span className="absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/70 text-white uppercase tracking-wider backdrop-blur">
                          {item.media_type}
                        </span>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveMedia(idx);
                          }}
                          className="absolute top-1.5 right-1.5 p-1 rounded-full bg-destructive text-destructive-foreground opacity-90 hover:opacity-100 hover:scale-110 transition-all cursor-pointer shadow-md"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Expiry Hours */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pickup Window Deadline (Hours from now)</label>
              <select
                value={formData.hours_until_expiry}
                onChange={(e) => setFormData({ ...formData, hours_until_expiry: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value={2}>2 Hours (Immediate rescue needed)</option>
                <option value={4}>4 Hours (Standard cooked food window)</option>
                <option value={8}>8 Hours (End of event / function)</option>
                <option value={24}>24 Hours (Next morning pickup)</option>
              </select>
            </div>

            {/* Address */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pickup Address</label>
              <input
                type="text"
                required
                value={formData.pickup_address}
                onChange={(e) => setFormData({ ...formData, pickup_address: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Map Location Picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-semibold uppercase tracking-wider">Pin Location on Map</span>
                <span className="text-primary font-mono text-[11px]">
                  {formData.latitude.toFixed(4)}, {formData.longitude.toFixed(4)}
                </span>
              </div>
              <LocationPickerMap
                initialLat={formData.latitude}
                initialLng={formData.longitude}
                onLocationSelect={(lat, lng) => {
                  setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }));
                }}
              />
            </div>

            <Button type="submit" disabled={mutation.isPending} className="w-full gap-2 shadow-lg">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              <span>Publish Donation Listing</span>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}