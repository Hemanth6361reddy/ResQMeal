import { useState, useRef, useEffect, Component, ErrorInfo, ReactNode } from "react";
import { useNavigate, useLocation, useParams, useSearchParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  AlertCircle, 
  CheckCircle2,
  RefreshCw,
  Save,
  Pencil
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { LocationPickerMap } from "@/components/maps/LocationPickerMap";
import { apiFetch, getAuthToken, resolveMediaUrl, parseMediaUrls, isVideoMedia } from "@/lib/api";

interface UploadedMediaItem {
  id: string;
  url: string;
  media_type: "image" | "video";
  filename: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class CreateDonationErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("CreateDonationPage crash caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
          <div className="p-4 rounded-2xl bg-destructive/15 border border-destructive/30 text-destructive mb-4">
            <AlertCircle className="h-10 w-10 mx-auto" />
          </div>
          <h2 className="text-2xl font-bold">Failed to load Form</h2>
          <p className="text-muted-foreground mt-2 mb-6 max-w-md text-sm">
            {this.state.error?.message || "An unexpected error occurred while loading this form."}
          </p>
          <div className="flex gap-3">
            <Button onClick={() => window.location.reload()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              <span>Reload Page</span>
            </Button>
            <Link to="/donor/dashboard">
              <Button variant="outline">Back to Dashboard</Button>
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function CreateDonationContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const token = getAuthToken();

  const editId = routeId || searchParams.get("edit");
  const isEditing = Boolean(editId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

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

  const [mediaItems, setMediaItems] = useState<UploadedMediaItem[]>([]);

  const stateDonation = (location.state as any)?.donation;

  const { data: fetchedDonation, isLoading: loadingExisting } = useQuery<any>({
    queryKey: ["donationDetail", editId],
    queryFn: () => apiFetch(`/donations/${editId}`),
    enabled: isEditing && !stateDonation && !!token,
  });

  const donationData = stateDonation || fetchedDonation;

  useEffect(() => {
    if (!isEditing || !donationData) return;

    let hours = 4;
    if (donationData.expires_at) {
      const diffMs = new Date(donationData.expires_at).getTime() - Date.now();
      const diffHrs = diffMs / (1000 * 60 * 60);
      if (diffHrs > 0) hours = Number(diffHrs.toFixed(2));
    }

    setFormData({
      title: donationData.title || "",
      food_type: donationData.food_type || "Cooked Meals",
      description: donationData.description || "",
      quantity_kg: donationData.quantity_kg ?? 10,
      servings: donationData.servings ?? 25,
      pickup_address: donationData.pickup_address || "",
      latitude: donationData.latitude ?? 12.9716,
      longitude: donationData.longitude ?? 77.5946,
      hours_until_expiry: hours,
    });

    const existingUrls = parseMediaUrls(donationData.media_urls);
    if (existingUrls.length > 0) {
      setMediaItems(
        existingUrls.map((url, idx) => ({
          id: `existing-${idx}-${Date.now()}`,
          url,
          media_type: isVideoMedia(url) ? "video" : "image",
          filename: url.split("/").pop() || `media-${idx + 1}`,
        }))
      );
    }
  }, [isEditing, donationData]);

  if (!token) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <AlertCircle className="h-12 w-12 text-primary mb-4" />
        <h2 className="text-2xl font-bold">Authentication Required</h2>
        <p className="text-muted-foreground mt-2 mb-6">
          Please log in to publish or edit surplus food listings.
        </p>
        <Link to="/login">
          <Button>Sign In</Button>
        </Link>
      </div>
    );
  }

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
          const errData = await response.json().catch(() => ({}));
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

  const handleRemoveMedia = (index: number) => {
    setMediaItems((prev) => prev.filter((_, i) => i !== index));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const expiresAt = new Date(Date.now() + Number(formData.hours_until_expiry) * 3600 * 1000);

      const payload = {
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
      };

      if (isEditing) {
        return apiFetch(`/donations/${editId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        return apiFetch("/donations", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
    },
    onSuccess: () => {
      setSuccessToast(isEditing ? "Donation updated successfully" : "Donation published successfully");
      queryClient.invalidateQueries({ queryKey: ["myDonations"] });
      queryClient.invalidateQueries({ queryKey: ["nearbyDonations"] });

      setTimeout(() => {
        navigate("/donor/dashboard");
      }, 1200);
    },
  });

  if (isEditing && loadingExisting && !donationData) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
        <p className="text-sm text-muted-foreground font-semibold">Loading food listing for edit...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
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

      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/donor/dashboard")}
        className="gap-2 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Button>

      <Card className="border-border shadow-xl overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2 text-primary text-sm font-semibold">
            {isEditing ? <Pencil className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            <span>{isEditing ? "Edit Food Listing" : "New Food Listing"}</span>
          </div>
          <CardTitle className="text-2xl font-bold">
            {isEditing ? "Edit Food Listing" : "List Surplus Food for Rescue"}
          </CardTitle>
          <CardDescription>
            {isEditing
              ? "Update food details, portions, pickup deadline, or photos before an NGO claims it."
              : "Shelters and verified NGOs will be alerted based on geographic proximity."}
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
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 text-xs rounded-xl bg-destructive/15 border border-destructive/30 text-destructive flex items-center gap-2.5 font-medium leading-relaxed"
              >
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                <span>{(mutation.error as any).message || "Failed to save donation"}</span>
              </motion.div>
            )}

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

            {/* FOOD PHOTOS / VIDEO UPLOAD */}
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

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleUploadFiles(e.target.files);
                }}
              />

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
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-primary bg-primary/10 scale-[0.99]"
                    : "border-border/80 hover:border-primary/60 bg-secondary/30"
                }`}
              >
                {uploading ? (
                  <div className="flex flex-col items-center justify-center py-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                    <p className="text-xs font-semibold text-foreground">Uploading files...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-2 space-y-2">
                    <div className="p-3 rounded-full bg-primary/15 text-primary mb-1">
                      <UploadCloud className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold">
                      Click to browse or drag & drop photos / short video
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG, WEBP (max 10MB each) or MP4/WEBM video (max 30MB)
                    </p>
                  </div>
                )}
              </div>

              {mediaItems.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
                  <AnimatePresence>
                    {mediaItems.map((item, idx) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="relative rounded-lg overflow-hidden border border-border group bg-black aspect-video"
                      >
                        {item.media_type === "video" ? (
                          <div className="w-full h-full flex items-center justify-center bg-black relative">
                            <video src={item.url} className="w-full h-full object-cover" muted />
                            <Video className="h-5 w-5 text-white absolute" />
                          </div>
                        ) : (
                          <img src={item.url} alt={item.filename} className="w-full h-full object-cover" />
                        )}
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

            {/* Expiry Hours Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pickup Window Deadline
              </label>
              <select
                value={formData.hours_until_expiry}
                onChange={(e) => setFormData({ ...formData, hours_until_expiry: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-medium"
              >
                <option value={0.033}>⚡ 2 Minutes (Quick Expiration Test)</option>
                <option value={0.083}>⚡ 5 Minutes (Short Expiration Test)</option>
                <option value={1}>1 Hour (Quick rescue needed)</option>
                <option value={2}>2 Hours (Immediate rescue)</option>
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
              <LocationPickerMap
                latitude={formData.latitude}
                longitude={formData.longitude}
                initialLat={formData.latitude}
                initialLng={formData.longitude}
                onLocationChange={(lat, lng) => {
                  setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }));
                }}
                onLocationSelect={(lat, lng) => {
                  setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }));
                }}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/donor/dashboard")}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="flex-1 gap-2 shadow-lg"
              >
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isEditing ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                <span>{isEditing ? "Update Food Listing" : "Publish Donation Listing"}</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function CreateDonationPage() {
  return (
    <CreateDonationErrorBoundary>
      <CreateDonationContent />
    </CreateDonationErrorBoundary>
  );
}