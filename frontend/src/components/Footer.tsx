import { HeartHandshake } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/40 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HeartHandshake className="h-4 w-4" />
          </div>
          <span className="font-semibold text-foreground">ResQMeal</span>
          <span>— Real-Time Food Rescue System</span>
        </div>
        <p className="text-xs">
          Built for zero food waste and immediate community relief. © {new Date().getFullYear()} ResQMeal.
        </p>
      </div>
    </footer>
  );
}