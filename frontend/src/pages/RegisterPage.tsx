import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { HeartHandshake, Utensils, Building2, Truck, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { apiFetch, setAuthToken, setUserRole } from "@/lib/api";

type RoleType = "DONOR" | "NGO" | "DELIVERY_PARTNER";

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Role selector state
  const [role, setRole] = useState<RoleType>("DONOR");

  // Common user credentials
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");

  // Role-specific fields
  const [orgName, setOrgName] = useState("");
  const [address, setAddress] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [capacity, setCapacity] = useState(100);
  const [vehicleType, setVehicleType] = useState("MOTORBIKE");
  const [licenseNumber, setLicenseNumber] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read ?role= from URL query params (e.g. /register?role=driver)
  useEffect(() => {
    const roleParam = searchParams.get("role")?.toLowerCase();
    if (roleParam === "ngo") setRole("NGO");
    else if (roleParam === "driver") setRole("DELIVERY_PARTNER");
    else if (roleParam === "donor") setRole("DONOR");
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload: any = {
      email,
      password,
      role,
      phone,
    };

    if (role === "DONOR") {
      payload.organization_name = orgName;
      payload.address = address;
      payload.contact_person = contactPerson;
    } else if (role === "NGO") {
      payload.organization_name = orgName;
      payload.address = address;
      payload.registration_number = regNumber;
      payload.capacity_meals_per_day = Number(capacity);
    } else if (role === "DELIVERY_PARTNER") {
      payload.vehicle_type = vehicleType;
      payload.license_number = licenseNumber;
    }

    try {
      const data = await apiFetch<{ access_token: string; role: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setAuthToken(data.access_token);
      setUserRole(data.role);

      // Redirect immediately to that role's portal
      if (data.role === "DONOR") navigate("/donor/dashboard");
      else if (data.role === "NGO") navigate("/ngo/dashboard");
      else if (data.role === "DELIVERY_PARTNER") navigate("/driver/dashboard");
      else navigate("/");
    } catch (err: any) {
      setError(err.message || "Registration failed. Please check inputs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-xl border-border/80 shadow-2xl">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary mb-2">
            <HeartHandshake className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold">Join the Food Rescue Mission</CardTitle>
          <CardDescription>Select your role and start saving fresh food</CardDescription>

          {/* Role Selection Tabs */}
          <div className="grid grid-cols-3 gap-2 p-1.5 mt-4 rounded-xl bg-secondary/60 border border-border">
            <button
              type="button"
              onClick={() => setRole("DONOR")}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-all ${
                role === "DONOR" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Utensils className="h-3.5 w-3.5" />
              <span>Food Donor</span>
            </button>

            <button
              type="button"
              onClick={() => setRole("NGO")}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-all ${
                role === "NGO" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>NGO Shelter</span>
            </button>

            <button
              type="button"
              onClick={() => setRole("DELIVERY_PARTNER")}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-all ${
                role === "DELIVERY_PARTNER" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Truck className="h-3.5 w-3.5" />
              <span>Driver Partner</span>
            </button>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-xs rounded-lg bg-destructive/15 border border-destructive/30 text-destructive">
                {error}
              </div>
            )}

            {/* Common Credentials */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="contact@organization.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Password (min 6 chars)</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Phone Number</label>
              <input
                type="tel"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* DONOR Specific Fields */}
            {role === "DONOR" && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Kitchen / Hotel / Organization Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Royal Caterers / Marriott Banquet"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Contact Person</label>
                    <input
                      type="text"
                      placeholder="Chef / Manager Name"
                      value={contactPerson}
                      onChange={(e) => setContactPerson(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Pickup Address</label>
                    <input
                      type="text"
                      required
                      placeholder="Street, Landmark, City"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* NGO Specific Fields */}
            {role === "NGO" && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Shelter / NGO Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Hope Orphanage Foundation"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Registration Number</label>
                    <input
                      type="text"
                      required
                      placeholder="NGO-REG-2024-XXXX"
                      value={regNumber}
                      onChange={(e) => setRegNumber(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Daily Meal Serving Capacity</label>
                    <input
                      type="number"
                      min="10"
                      value={capacity}
                      onChange={(e) => setCapacity(Number(e.target.value))}
                      className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Shelter Address</label>
                    <input
                      type="text"
                      required
                      placeholder="Delivery Drop Address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* DELIVERY PARTNER Specific Fields */}
            {role === "DELIVERY_PARTNER" && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Vehicle Type</label>
                    <select
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="MOTORBIKE">Motorbike / Scooter</option>
                      <option value="BICYCLE">Bicycle</option>
                      <option value="CAR">Car</option>
                      <option value="VAN">Van</option>
                      <option value="TRUCK">Mini Truck</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Driving License Number</label>
                    <input
                      type="text"
                      required
                      placeholder="KA-04-2023-XXXX"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            <Button type="submit" disabled={loading} size="lg" className="w-full gap-2 mt-4">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete Registration"}
              <ArrowRight className="h-4 w-4" />
            </Button>

            <p className="text-center text-xs text-muted-foreground pt-2">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Sign In
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}