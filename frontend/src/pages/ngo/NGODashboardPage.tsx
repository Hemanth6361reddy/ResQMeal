import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { MapPin, Navigation, Clock, Utensils, CheckCircle2, Loader2, Sparkles, Filter, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch, getAuthToken, removeAuthToken } from "@/lib/api";

interface NearbyDonation {
  id: string;
  title: string;
  food_type: string;
  description?: string;
  servings: number;
  quantity_kg: number;
  pickup_address: string;
  distance_km: number;
  expires_at: string;
  status: string;
}

interface MyClaim {
  claim_id: string;
  donation_id: string;
  title: string;
  food_type: string;
  servings_requested: number;
  pickup_address: string;
  claim_status: string;
  donation_status: string;
  expires_at: string;
}

export function NGODashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = getAuthToken();

  const [activeTab, setActiveTab] = useState<"nearby" | "myClaims">("nearby");
  const [radiusKm, setRadiusKm] = useState(15);
  const [foodType, setFoodType] = useState<string>("");
  const [selectedDonation, setSelectedDonation] = useState<NearbyDonation | null>(null);
  const [servingsToClaim, setServingsToClaim] = useState(20);
  const [notes, setNotes] = useState("");

  // Default Bangalore coordinates (matches our Donor listing in Phase 6)
  const [coords] = useState({ lat: 12.9716, lng: 77.5946 });

  // 1. Query Nearby Donations using PostGIS
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

  // 3. Claim Food Mutation
  const claimMutation = useMutation({
    mutationFn: () => {
      if (!selectedDonation) throw new Error("No donation selected");
      return apiFetch(`/ngo/donations/${selectedDonation.id}/request`, {
        method: "POST",
        body: JSON.stringify({
          servings_requested: servingsToClaim,
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-8 border-b border-border">
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
              My Claims
            </button>
          </div>
          <Link to="/ngo/explore">
            <Button size="sm" variant="outline" className="gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <span>Map Radar</span>
            </Button>
          </Link>
          
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      {activeTab === "nearby" && (
        <div className="mt-8 space-y-6">
          {/* PostGIS Filter Bar */}
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
                  min="2"
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

          {/* Listings Grid */}
          {loadingNearby ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : errorNearby ? (
            <div className="p-4 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-sm">
              {(errorNearby as any).message}
            </div>
          ) : !nearbyDonations || nearbyDonations.length === 0 ? (
            <div className="text-center py-20 rounded-2xl border border-dashed border-border bg-card/40">
              <Utensils className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-bold">No food listings found within {radiusKm} km</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto mt-1">
                Try widening your search radius slider above to discover food across a larger area.
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {nearbyDonations.map((d) => (
                <Card key={d.id} className="flex flex-col justify-between hover:border-primary/50 transition-all">
                  <CardHeader>
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="success" className="gap-1 font-bold">
                        <Navigation className="h-3 w-3" />
                        <span>{d.distance_km} km away</span>
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
                        <span className="text-xs text-muted-foreground block">Servings Available</span>
                        <span className="font-bold text-foreground">{d.servings} Meals</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground block">Weight</span>
                        <span className="font-bold text-foreground">{d.quantity_kg} kg</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Expires: {new Date(d.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                    </div>

                    <Button
                      onClick={() => {
                        setSelectedDonation(d);
                        setServingsToClaim(d.servings);
                      }}
                      className="w-full gap-2 mt-2"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Request This Food</span>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: My Claims */}
      {activeTab === "myClaims" && (
        <div className="mt-8">
          {loadingClaims ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !myClaims || myClaims.length === 0 ? (
            <div className="text-center py-20 rounded-2xl border border-dashed border-border bg-card/40">
              <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-bold">No active claims yet</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto mt-1 mb-6">
                Switch to the "Nearby Available" tab to claim meals for your shelter.
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myClaims.map((claim) => (
                <Card key={claim.claim_id} className="border-border">
                  <CardHeader>
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant={claim.donation_status === "REQUESTED" ? "success" : "default"}>
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
                  <CardContent className="space-y-2 text-sm">
                    <div className="p-3 rounded-lg bg-secondary/50 flex justify-between">
                      <span className="text-muted-foreground">Requested Portions:</span>
                      <span className="font-bold text-foreground">{claim.servings_requested} Meals</span>
                    </div>
                    <p className="text-xs text-muted-foreground pt-2">
                      Ready for delivery dispatch in Phase 8!
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Claim Modal Dialog */}
      {selectedDonation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md border-border bg-card shadow-2xl">
            <CardHeader>
              <CardTitle className="text-xl">Claim {selectedDonation.title}</CardTitle>
              <CardDescription>
                {selectedDonation.distance_km} km away • {selectedDonation.pickup_address}
              </CardDescription>
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
                <label className="text-xs font-semibold uppercase text-muted-foreground">Notes for Donor / Driver</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Please ring the main shelter gate buzzer."
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