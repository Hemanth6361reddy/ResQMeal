import { Link } from "react-router-dom";
import { HeartHandshake, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <HeartHandshake className="h-6 w-6" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">
            ResQ<span className="text-primary">Meal</span>
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <a href="#how-it-works" className="transition-colors hover:text-foreground">How it Works</a>
          <a href="#roles" className="transition-colors hover:text-foreground">Who We Connect</a>
          <a href="#impact" className="transition-colors hover:text-foreground">Impact</a>
        </nav>

        {/* Auth CTA Buttons */}
        <div className="flex items-center gap-3">
          <Link to="/login">
            <Button variant="ghost" size="sm">Sign In</Button>
          </Link>
          <Link to="/register">
            <Button size="sm" className="gap-1.5">
              <span>Get Started</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}