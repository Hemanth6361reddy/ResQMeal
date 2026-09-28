import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Utensils, Clock, MapPin, XCircle, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch, getAuthToken, removeAuthToken } from "@/lib/api";

interface Donation {
  id: string;
  title: str;
  food_type: string;
  quantity_kg: number;
  servings: number;
  pickup_address: string;
  status: string;
  expires_at: string;
  created_at: string;
}

export function DonorDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = getAuthToken();

  const { data: donations, isLoading, error } = useQuery<Donation[]>({
    queryKey: ["myDonations"],
    queryFn: () => apiFetch("/donations/my"),
    enabled: !!token,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/donations/${id}/cancel`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["myDonations"] }),
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
        <p className="text-muted-foreground mt-2 mb-6">Please log in to manage your food donations.</p>
        <Link to="/login">
          <Button>Sign In to Donor Portal</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-8 border-b border-border">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Donor Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your food surplus listings and track real-time rescue operations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/donor/create">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              <span>List Surplus Food</span>
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      {/* Content Section */}
      <div className="mt-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-sm">
            {(error as any).message || "Failed to load donations"}
          </div>
        ) : !donations || donations.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-dashed border-border bg-card/40">
            <Utensils className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-bold">No active donations yet</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto mt-1 mb-6">
              When you have surplus fresh food, create a listing to immediately notify nearby rescue shelters.
            </p>
            <Link to="/donor/create">
              <Button>Create Your First Listing</Button>
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {donations.map((d) => {
              const expiryDate = new Date(d.expires_at);
              const isExpired = expiryDate < new Date();

              return (
                <Card key={d.id} className="flex flex-col justify-between hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Badge
                        variant={
                          d.status === "AVAILABLE" ? "success" : d.status === "CANCELLED" ? "outline" : "default"
                        }
                      >
                        {d.status}
                      </Badge>
                      <span className="text-xs font-semibold text-primary">{d.food_type}</span>
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
                        <span className="text-xs text-muted-foreground block">Servings</span>
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
                        <span>Expires: {expiryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                      {isExpired && <span className="text-destructive font-semibold">Expired</span>}
                    </div>

                    {d.status === "AVAILABLE" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate(d.id)}
                        className="w-full text-destructive hover:bg-destructive/10 text-xs gap-1.5 mt-2"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span>Cancel Listing</span>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}