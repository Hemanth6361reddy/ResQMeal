import { motion } from "framer-motion";
import { Utensils, Building2, Truck, ShieldCheck, Clock, MapPin, ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function LandingPage() {
  const roles = [
    {
      title: "Food Donors",
      badge: "Restaurants & Caterers",
      icon: Utensils,
      desc: "List excess fresh meals in seconds with shelf-life countdowns and pickup locations.",
      actionText: "Become a Donor",
      actionLink: "/register?role=donor",
    },
    {
      title: "NGOs & Shelters",
      badge: "Verified Recipients",
      icon: Building2,
      desc: "Discover nearby donations in real time using geographic radius filters and request food.",
      actionText: "Register NGO",
      actionLink: "/register?role=ngo",
    },
    {
      title: "Delivery Partners",
      badge: "Rescue Fleet",
      icon: Truck,
      desc: "Accept nearby dispatch tasks, share live GPS tracking, and ensure timely community delivery.",
      actionText: "Drive & Rescue",
      actionLink: "/register?role=driver",
    },
  ];

  const stats = [
    { label: "Meals Rescued Target", value: "50,000+" },
    { label: "Average Dispatch Time", value: "< 15 Mins" },
    { label: "CO2 Emissions Saved", value: "18.5 Tons" },
    { label: "Verified Partners", value: "100% Inspected" },
  ];

  return (
    <div className="flex flex-col gap-24 pb-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 md:pt-28">
        {/* Ambient Gradient Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-primary/15 blur-[120px] rounded-full pointer-events-none -z-10" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex justify-center"
          >
            <Badge variant="success" className="gap-1.5 px-3 py-1 mb-6 text-sm">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Real-Time Food Rescue Network</span>
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight max-w-4xl mx-auto"
          >
            Turn Surplus Food into <span className="text-primary underline decoration-primary/40 underline-offset-8">Saved Lives</span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
          >
            ResQMeal connects commercial kitchens with nearby shelters using live geospatial tracking, smart dispatch, and instant WebSocket updates.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-10 flex flex-wrap justify-center gap-4"
          >
            <Link to="/register">
              <Button size="lg" className="gap-2 text-base">
                <span>Start Rescuing Food</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button size="lg" variant="outline">
                How It Works
              </Button>
            </a>
          </motion.div>
        </div>
      </section>

      {/* Impact Stats Ticker */}
      <section id="impact" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-6 sm:p-8 rounded-2xl bg-card border border-border shadow-lg">
          {stats.map((stat, i) => (
            <div key={i} className="text-center p-3">
              <div className="text-2xl sm:text-4xl font-extrabold text-primary">{stat.value}</div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Role Cards Section */}
      <section id="roles" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-3">Ecosystem</Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Who Makes ResQMeal Work?</h2>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
            A synchronized network of donors, volunteers, and distribution centers.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {roles.map((role, idx) => {
            const Icon = role.icon;
            return (
              <motion.div
                key={idx}
                whileHover={{ y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="h-full flex flex-col justify-between hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <div className="flex justify-between items-start mb-4">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                        <Icon className="h-6 w-6" />
                      </div>
                      <Badge variant="outline">{role.badge}</Badge>
                    </div>
                    <CardTitle className="text-xl">{role.title}</CardTitle>
                    <CardDescription className="pt-2 text-sm leading-relaxed">
                      {role.desc}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <Link to={role.actionLink}>
                      <Button variant="secondary" className="w-full justify-between group">
                        <span>{role.actionText}</span>
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Feature Highlights Section */}
      <section id="how-it-works" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="rounded-3xl border border-border bg-gradient-to-b from-card to-background p-8 sm:p-14">
          <div className="max-w-2xl">
            <Badge variant="success" className="mb-3">Instant Coordination</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Built for speed because fresh food won't wait.
            </h2>
            <p className="text-muted-foreground mt-4 text-base leading-relaxed">
              Every donation has a ticking countdown. Our PostGIS engine matches nearby shelters instantly, and WebSockets ensure drivers get live turn-by-turn directions without refreshing.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 mt-12">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-secondary text-primary mt-1">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Expiry Timers</h4>
                <p className="text-xs text-muted-foreground mt-1">Real-time shelf-life alerts prioritize food nearing expiry.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-secondary text-primary mt-1">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">PostGIS Proximity</h4>
                <p className="text-xs text-muted-foreground mt-1">Find nearby shelters within a customizable radius instantly.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-secondary text-primary mt-1">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Verified Delivery</h4>
                <p className="text-xs text-muted-foreground mt-1">Proof of delivery photos and secure digital handshakes.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}