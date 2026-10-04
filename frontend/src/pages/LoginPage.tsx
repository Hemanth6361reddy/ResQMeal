import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  HeartHandshake,
  Lock,
  Mail,
  ArrowRight,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

import { apiFetch, setAuthToken, setUserRole } from "@/lib/api";

export function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<{
        access_token: string;
        role: string;
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
        }),
      });

      // Save authentication information
      setAuthToken(data.access_token);
      setUserRole(data.role);

      // Redirect based on user role
      if (data.role === "DONOR") {
        navigate("/donor/dashboard");
      } else if (data.role === "NGO") {
        navigate("/ngo/dashboard");
      } else if (data.role === "DELIVERY_PARTNER") {
        navigate("/driver/dashboard");
      } else if (data.role === "ADMIN") {
        navigate("/admin/dashboard");
      } else {
        navigate("/");
      }
    } catch (err: any) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-border/80 shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary mb-3">
            <HeartHandshake className="h-7 w-7" />
          </div>

          <CardTitle className="text-2xl font-bold">
            Welcome Back
          </CardTitle>

          <CardDescription>
            Sign in to your ResQMeal portal
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-xs rounded-lg bg-destructive/15 border border-destructive/30 text-destructive">
                {error}
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email
              </label>

              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hotel_grand@example.com"
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Password
              </label>

              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Sign In Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full gap-2 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing In...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>

            {/* Register */}
            <p className="text-center text-xs text-muted-foreground pt-4">
              Don't have an account yet?{" "}
              <Link
                to="/register"
                className="text-primary hover:underline font-medium"
              >
                Register now
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}