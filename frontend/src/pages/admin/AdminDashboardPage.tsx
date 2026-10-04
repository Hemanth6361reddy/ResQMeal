import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import {
  ShieldCheck,
  Leaf,
  Utensils,
  Weight,
  Truck,
  Users,
  BarChart3,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Ban,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch, getAuthToken, removeAuthToken } from "@/lib/api";

interface SystemMetrics {
  total_donations: number;
  completed_rescues: number;
  total_servings_saved: number;
  total_weight_kg_saved: number;
  co2_emissions_avoided_kg: number;
  active_deliveries_in_transit: number;
  total_donors: number;
  total_ngos: number;
  total_drivers: number;
}

interface AnalyticsTrends {
  categories: {
    category: string;
    count: number;
    servings: number;
  }[];
  daily_trends: {
    date: string;
    meals_rescued: number;
    rescues_count: number;
  }[];
}

interface UserItem {
  id: string;
  email: string;
  role: "DONOR" | "NGO" | "DELIVERY_PARTNER" | "ADMIN";
  is_active: boolean;
  phone?: string;
  organization_name?: string;
  created_at: string;
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = getAuthToken();

  const [roleFilter, setRoleFilter] = useState<string>("");

  // 1. Fetch Metrics
  const { data: metrics, isLoading: loadingMetrics } =
    useQuery<SystemMetrics>({
      queryKey: ["adminMetrics"],
      queryFn: () => apiFetch("/admin/metrics"),
      enabled: !!token,
    });

  // 2. Fetch Trends & Charts
  const { data: trends, isLoading: loadingTrends } =
    useQuery<AnalyticsTrends>({
      queryKey: ["adminTrends"],
      queryFn: () => apiFetch("/admin/analytics/trends"),
      enabled: !!token,
    });

  // 3. Fetch Users
  const { data: users, isLoading: loadingUsers } = useQuery<UserItem[]>({
    queryKey: ["adminUsers", roleFilter],
    queryFn: () =>
      apiFetch(
        roleFilter
          ? `/admin/users?role=${roleFilter}`
          : "/admin/users"
      ),
    enabled: !!token,
  });

  // 4. Toggle User Status Mutation
  const toggleStatusMutation = useMutation({
    mutationFn: ({
      userId,
      isActive,
    }: {
      userId: string;
      isActive: boolean;
    }) =>
      apiFetch(`/admin/users/${userId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          is_active: isActive,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["adminUsers"],
      });
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

        <h2 className="text-2xl font-bold">
          Admin Privileges Required
        </h2>

        <p className="text-muted-foreground mt-2 mb-6">
          Please sign in as an Administrator.
        </p>

        <Link to="/login">
          <Button>Sign In to Admin Portal</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
            <ShieldCheck className="h-4 w-4" />
            <span>Master Governance Console</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight">
            Platform Command Center
          </h1>
        </div>

        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Logout
        </Button>
      </div>

      {/* METRIC COUNTER CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Meals Saved */}
        <Card className="border-border bg-card/60 backdrop-blur shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">
              Meals Rescued
            </CardTitle>
            <Utensils className="h-4 w-4 text-emerald-400" />
          </CardHeader>

          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">
              {loadingMetrics ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                `${metrics?.total_servings_saved || 0} Portions`
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              Across {metrics?.completed_rescues || 0} completed missions
            </p>
          </CardContent>
        </Card>

        {/* Weight Saved */}
        <Card className="border-border bg-card/60 backdrop-blur shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">
              Food Rescued
            </CardTitle>
            <Weight className="h-4 w-4 text-primary" />
          </CardHeader>

          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">
              {loadingMetrics ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                `${metrics?.total_weight_kg_saved || 0} kg`
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              Diverted from municipal landfills
            </p>
          </CardContent>
        </Card>

        {/* CO2 Emissions Avoided */}
        <Card className="border-border bg-card/60 backdrop-blur shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">
              CO₂e Offset
            </CardTitle>
            <Leaf className="h-4 w-4 text-emerald-500" />
          </CardHeader>

          <CardContent>
            <div className="text-2xl font-extrabold text-emerald-400">
              {loadingMetrics ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                `${metrics?.co2_emissions_avoided_kg || 0} kg`
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              2.5× weight emission factor
            </p>
          </CardContent>
        </Card>

        {/* Active In-Transit */}
        <Card className="border-border bg-card/60 backdrop-blur shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">
              Fleet in Transit
            </CardTitle>
            <Truck className="h-4 w-4 text-amber-400" />
          </CardHeader>

          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">
              {loadingMetrics ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                `${metrics?.active_deliveries_in_transit || 0} Active`
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              Live drivers currently on the road
            </p>
          </CardContent>
        </Card>
      </div>

      {/* CHARTS SECTION */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* 7-Day Trend Chart */}
        <Card className="border-border shadow-lg">
          <CardHeader>
            <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-wider">
              <TrendingUp className="h-4 w-4" />
              <span>Rescue Activity</span>
            </div>

            <CardTitle className="text-lg">
              7-Day Meals Rescued Trend
            </CardTitle>
          </CardHeader>

          <CardContent className="h-72">
            {loadingTrends ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends?.daily_trends || []}>
                  <defs>
                    <linearGradient
                      id="mealColor"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#1bd677"
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="95%"
                        stopColor="#1bd677"
                        stopOpacity={0.05}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#222"
                  />

                  <XAxis
                    dataKey="date"
                    stroke="#888"
                    fontSize={11}
                  />

                  <YAxis
                    stroke="#888"
                    fontSize={11}
                  />

                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0c1c13",
                      border: "1px solid #1bd677",
                      borderRadius: "8px",
                    }}
                  />

                  <Area
                    type="monotone"
                    dataKey="meals_rescued"
                    stroke="#1bd677"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#mealColor)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown Chart */}
        <Card className="border-border shadow-lg">
          <CardHeader>
            <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-wider">
              <BarChart3 className="h-4 w-4" />
              <span>Category Distribution</span>
            </div>

            <CardTitle className="text-lg">
              Portions Saved by Food Type
            </CardTitle>
          </CardHeader>

          <CardContent className="h-72">
            {loadingTrends ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends?.categories || []}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#222"
                  />

                  <XAxis
                    dataKey="category"
                    stroke="#888"
                    fontSize={10}
                  />

                  <YAxis
                    stroke="#888"
                    fontSize={11}
                  />

                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0c1c13",
                      border: "1px solid #1bd677",
                      borderRadius: "8px",
                    }}
                  />

                  <Bar
                    dataKey="servings"
                    fill="#1bd677"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* USER MANAGEMENT & GOVERNANCE TABLE */}
      <Card className="border-border shadow-lg">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-wider">
              <Users className="h-4 w-4" />
              <span>Access Control & Moderation</span>
            </div>

            <CardTitle className="text-xl">
              Platform User Governance
            </CardTitle>

            <CardDescription>
              Approve verified NGOs and suspend bad actors across all roles.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Roles</option>
              <option value="DONOR">Donors</option>
              <option value="NGO">NGOs</option>
              <option value="DELIVERY_PARTNER">Drivers</option>
            </select>
          </div>
        </CardHeader>

        <CardContent>
          {loadingUsers ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !users || users.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No users found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground font-semibold">
                    <th className="py-3 px-4">
                      User / Organization
                    </th>

                    <th className="py-3 px-4">
                      Role
                    </th>

                    <th className="py-3 px-4">
                      Status
                    </th>

                    <th className="py-3 px-4 text-right">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border/60">
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="hover:bg-secondary/40 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-foreground">
                          {u.email}
                        </div>

                        {u.organization_name && (
                          <div className="text-xs text-muted-foreground">
                            {u.organization_name}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge
                          variant="outline"
                          className="text-xs font-medium"
                        >
                          {u.role}
                        </Badge>
                      </td>

                      {/* NEW HIGH-CONTRAST STATUS */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                            u.is_active
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : "bg-red-500/20 text-red-400 border-red-500/40"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              u.is_active
                                ? "bg-emerald-400"
                                : "bg-red-400 animate-pulse"
                            }`}
                          />

                          <span>
                            {u.is_active ? "Active" : "Suspended"}
                          </span>
                        </span>
                      </td>

                      {/* NEW HIGH-CONTRAST ACTION BUTTON */}
                      <td className="py-3.5 px-4 text-right">
                        {u.role !== "ADMIN" && (
                          <Button
                            size="sm"
                            onClick={() =>
                              toggleStatusMutation.mutate({
                                userId: u.id,
                                isActive: !u.is_active,
                              })
                            }
                            disabled={toggleStatusMutation.isPending}
                            className={`gap-1.5 text-xs h-8 font-semibold transition-all ${
                              u.is_active
                                ? "bg-red-600 hover:bg-red-700 text-white shadow-sm"
                                : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                            }`}
                          >
                            {u.is_active ? (
                              <>
                                <Ban className="h-3.5 w-3.5" />
                                <span>Suspend</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Reactivate</span>
                              </>
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}