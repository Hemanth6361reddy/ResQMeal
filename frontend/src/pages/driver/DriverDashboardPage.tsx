import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { Truck, MapPin, CheckCircle, PackageCheck, Navigation2, Clock, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeliveryRouteMap } from "@/components/maps/DeliveryRouteMap";
import { apiFetch, getAuthToken, removeAuthToken } from "@/lib/api";

interface Delivery {
  id: string;
  food_title: string;
  food_type: string;
  servings: number;
  quantity_kg: number;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  drop_organization: string;
  drop_address: string;
  status: "ASSIGNMENT_PENDING" | "ACCEPTED" | "PICKED_UP" | "ON_THE_WAY" | "DELIVERED" | "CANCELLED";
  created_at: string;
}

export function DriverDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = getAuthToken();

  const [activeTab, setActiveTab] = useState<"active" | "available" | "history">("active");
  const [acceptError, setAcceptError] = useState<string | null>(null);

  // 1. Fetch Current Active Task
  const { data: activeTask, isLoading: loadingActive } = useQuery<Delivery | null>({
    queryKey: ["activeDelivery"],
    queryFn: () => apiFetch("/deliveries/my-active"),
    enabled: !!token,
  });

  // 2. Fetch Available Tasks Waiting for Drivers
  const { data: availableTasks, isLoading: loadingAvailable, refetch: refetchAvailable } = useQuery<Delivery[]>({
    queryKey: ["availableDeliveries"],
    queryFn: () => apiFetch("/deliveries/available"),
    enabled: !!token && activeTab === "available",
  });

  // 3. Fetch Completed History
  const { data: historyTasks } = useQuery<Delivery[]>({
    queryKey: ["deliveryHistory"],
    queryFn: () => apiFetch("/deliveries/my-history"),
    enabled: !!token && activeTab === "history",
  });

  // 4. Accept Delivery Mutation
  const acceptMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/deliveries/${id}/accept`, { method: "POST" }),
    onSuccess: () => {
      setAcceptError(null);
      queryClient.invalidateQueries({ queryKey: ["activeDelivery"] });
      queryClient.invalidateQueries({ queryKey: ["availableDeliveries"] });
      setActiveTab("active");
    },
    onError: (err: any) => {
      setAcceptError(err.message || "Failed to accept task");
    },
  });

  // 5. Update Status State Machine Mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: string }) =>
      apiFetch(`/deliveries/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["activeDelivery"] });
      queryClient.invalidateQueries({ queryKey: ["deliveryHistory"] });
      if (driverSocket.current?.readyState === WebSocket.OPEN) {
        driverSocket.current.send(
          JSON.stringify({
            type: "STATUS_CHANGE",
            status: variables.nextStatus,
          })
        );
      }
    },
  });

  // 6. Persistent WebSocket for Live Driver Location
  const driverSocket = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!activeTask?.id) return;

    driverSocket.current = new WebSocket(`ws://localhost:8000/api/v1/ws/delivery/${activeTask.id}`);

    return () => {
      driverSocket.current?.close();
    };
  }, [activeTask?.id]);

  const transmitGPSPulse = () => {
    if (!driverSocket.current || driverSocket.current.readyState !== WebSocket.OPEN || !activeTask) return;

    const randomOffsetLat = (Math.random() - 0.5) * 0.003;
    const randomOffsetLng = (Math.random() - 0.5) * 0.003;

    driverSocket.current.send(
      JSON.stringify({
        type: "DRIVER_LOCATION",
        lat: (activeTask.pickup_lat || 12.9716) + randomOffsetLat,
        lng: (activeTask.pickup_lng || 77.5946) + randomOffsetLng,
      })
    );
  };

  const handleLogout = () => {
    removeAuthToken();
    navigate("/login");
  };

  if (!token) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <AlertCircle className="h-12 w-12 text-primary mb-4" />
        <h2 className="text-2xl font-bold">Authentication Required</h2>
        <p className="text-muted-foreground mt-2 mb-6">Please log in to access the Driver Console.</p>
        <Link to="/login">
          <Button>Sign In to Driver Portal</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
            <Truck className="h-4 w-4" />
            <span>Rescue Fleet Partner</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Driver Control Center</h1>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex bg-card border border-border p-1 rounded-xl">
            <button
              onClick={() => setActiveTab("active")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "active" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
              }`}
            >
              Active Task {activeTask ? "●" : ""}
            </button>
            <button
              onClick={() => {
                setActiveTab("available");
                refetchAvailable();
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "available" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
              }`}
            >
              Available Radar
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "history" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
              }`}
            >
              History
            </button>
          </div>

          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      {/* TAB 1: ACTIVE TASK */}
      {activeTab === "active" && (
        <div className="mt-8">
          {loadingActive ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !activeTask ? (
            <div className="text-center py-20 rounded-2xl border border-dashed border-border bg-card/40">
              <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-bold">No active delivery in progress</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto mt-1 mb-6">
                You are ready for dispatch! Check the radar for nearby food rescues waiting for transport.
              </p>
              <Button onClick={() => setActiveTab("available")}>
                View Available Deliveries
              </Button>
            </div>
          ) : (
            <Card className="border-primary/60 shadow-2xl overflow-hidden">
              <div className="bg-primary/10 border-b border-primary/20 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">Live Rescue Mission</span>
                </div>
                <Badge variant="success" className="text-xs font-bold">
                  {activeTask.status}
                </Badge>
              </div>

              <CardContent className="p-6 space-y-6">
                <div>
                  <h2 className="text-2xl font-bold">{activeTask.food_title}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {activeTask.servings} Servings • {activeTask.quantity_kg} kg • {activeTask.food_type}
                  </p>
                </div>

                {/* Step Routing Details */}
                <div className="p-5 rounded-2xl bg-secondary/50 border border-border space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                      P
                    </div>
                    <div>
                      <span className="text-xs uppercase font-bold text-muted-foreground block">Pickup Point (Donor)</span>
                      <span className="text-sm font-semibold text-foreground">{activeTask.pickup_address}</span>
                    </div>
                  </div>

                  <div className="border-l-2 border-dashed border-border ml-4 h-6"></div>

                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5 font-bold">
                      D
                    </div>
                    <div>
                      <span className="text-xs uppercase font-bold text-muted-foreground block">Destination (Shelter)</span>
                      <span className="text-sm font-semibold text-foreground">{activeTask.drop_organization}</span>
                      <span className="text-xs text-muted-foreground block">{activeTask.drop_address}</span>
                    </div>
                  </div>
                </div>

                {/* Mapbox Route Map */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Interactive Navigation Route</h4>
                  <DeliveryRouteMap
                    pickupLat={activeTask.pickup_lat || 12.9716}
                    pickupLng={activeTask.pickup_lng || 77.5946}
                    pickupAddress={activeTask.pickup_address}
                    dropLat={12.9784}
                    dropLng={77.6408}
                    dropOrganization={activeTask.drop_organization}
                  />
                </div>

                {/* Live GPS Telemetry Broadcast */}
                <div className="p-4 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold text-primary block">📡 Live GPS Telemetry Stream</span>
                    <span className="text-[11px] text-muted-foreground">Broadcasts real-time location to Donor and NGO over WebSocket</span>
                  </div>
                  <Button
                    size="sm"
                    type="button"
                    onClick={transmitGPSPulse}
                    className="bg-primary text-black font-bold hover:bg-primary/90 shrink-0"
                  >
                    Transmit GPS Pulse
                  </Button>
                </div>

                {/* State Machine Action Controls */}
                <div className="pt-2">
                  {activeTask.status === "ACCEPTED" && (
                    <Button
                      size="lg"
                      onClick={() => updateStatusMutation.mutate({ id: activeTask.id, nextStatus: "PICKED_UP" })}
                      disabled={updateStatusMutation.isPending}
                      className="w-full gap-2 text-base h-14"
                    >
                      <PackageCheck className="h-5 w-5" />
                      <span>Confirm Food Picked Up from Donor</span>
                    </Button>
                  )}

                  {activeTask.status === "PICKED_UP" && (
                    <Button
                      size="lg"
                      onClick={() => updateStatusMutation.mutate({ id: activeTask.id, nextStatus: "ON_THE_WAY" })}
                      disabled={updateStatusMutation.isPending}
                      className="w-full gap-2 text-base h-14"
                    >
                      <Navigation2 className="h-5 w-5" />
                      <span>Start Transit to Shelter (On the Way)</span>
                    </Button>
                  )}

                  {activeTask.status === "ON_THE_WAY" && (
                    <Button
                      size="lg"
                      onClick={() => updateStatusMutation.mutate({ id: activeTask.id, nextStatus: "DELIVERED" })}
                      disabled={updateStatusMutation.isPending}
                      className="w-full gap-2 text-base h-14 bg-emerald-600 hover:bg-emerald-500"
                    >
                      <CheckCircle className="h-5 w-5" />
                      <span>Complete & Mark as Delivered! 🍲</span>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: AVAILABLE DISPATCH RADAR */}
      {activeTab === "available" && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Unassigned Deliveries Waiting for Drivers</h3>
            <Badge variant="outline">{availableTasks?.length || 0} Open Tasks</Badge>
          </div>

          {acceptError && (
            <div className="p-3 text-xs rounded-xl bg-destructive/15 border border-destructive/30 text-destructive">
              {acceptError}
            </div>
          )}

          {loadingAvailable ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !availableTasks || availableTasks.length === 0 ? (
            <div className="text-center py-20 rounded-2xl border border-dashed border-border bg-card/40">
              <CheckCircle className="h-12 w-12 mx-auto text-primary mb-4" />
              <h3 className="text-lg font-bold">All deliveries are currently assigned!</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto mt-1">
                New rescue missions will appear here when NGOs place food claims.
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {availableTasks.map((t) => (
                <Card key={t.id} className="flex flex-col justify-between border-border hover:border-primary/50 transition-all">
                  <CardHeader>
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="outline" className="text-primary border-primary/30">
                        {t.food_type}
                      </Badge>
                      <span className="text-xs font-bold text-muted-foreground">
                        {t.servings} Servings ({t.quantity_kg} kg)
                      </span>
                    </div>
                    <CardTitle className="text-xl">{t.food_title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-xs space-y-2 p-3 rounded-lg bg-secondary/50">
                      <div>
                        <span className="font-bold text-muted-foreground block uppercase">Pickup:</span>
                        <span className="text-foreground">{t.pickup_address}</span>
                      </div>
                      <div>
                        <span className="font-bold text-muted-foreground block uppercase">Dropoff:</span>
                        <span className="text-foreground font-semibold">{t.drop_organization}</span>
                        <span className="text-muted-foreground block">{t.drop_address}</span>
                      </div>
                    </div>

                    <Button
                      onClick={() => acceptMutation.mutate(t.id)}
                      disabled={acceptMutation.isPending || !!activeTask}
                      className="w-full gap-2"
                    >
                      {acceptMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                      <span>Accept Delivery Task</span>
                    </Button>
                    {activeTask && (
                      <p className="text-[11px] text-center text-destructive">
                        Complete your active delivery before accepting another.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HISTORY */}
      {activeTab === "history" && (
        <div className="mt-8 space-y-4">
          <h3 className="text-lg font-bold">Completed Rescue Missions</h3>
          {!historyTasks || historyTasks.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border border-dashed border-border bg-card/40">
              <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No completed deliveries yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historyTasks.map((h) => (
                <div key={h.id} className="p-4 rounded-xl border border-border bg-card flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-foreground text-sm">{h.food_title}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Delivered to {h.drop_organization} • {h.servings} meals rescued
                    </p>
                  </div>
                  <Badge variant="success">COMPLETED</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}