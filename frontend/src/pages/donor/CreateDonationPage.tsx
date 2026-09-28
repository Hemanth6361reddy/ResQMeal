import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Utensils, Clock, MapPin, Sparkles, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

export function CreateDonationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myDonations"] });
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

            {/* Shelf-Life Expiry Hours */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-primary" />
                <span>Pickup Window Deadline (Shelf Life)</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="24"
                  value={formData.hours_until_expiry}
                  onChange={(e) => setFormData({ ...formData, hours_until_expiry: Number(e.target.value) })}
                  className="flex-1 accent-primary cursor-pointer"
                />
                <span className="w-24 text-right text-sm font-bold text-primary">
                  {formData.hours_until_expiry} Hours
                </span>
              </div>
            </div>

            {/* Location & Address */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-primary" />
                <span>Pickup Address</span>
              </label>
              <input
                type="text"
                required
                value={formData.pickup_address}
                onChange={(e) => setFormData({ ...formData, pickup_address: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Coordinates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Latitude</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Longitude</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <Button type="submit" disabled={mutation.isPending} size="lg" className="w-full gap-2">
              {mutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Utensils className="h-5 w-5" />}
              <span>Publish Donation Listing</span>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}