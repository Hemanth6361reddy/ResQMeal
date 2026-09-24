import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
      <h1 className="text-7xl font-black text-primary">404</h1>
      <h2 className="mt-4 text-2xl font-bold">Page Not Found</h2>
      <p className="mt-2 text-muted-foreground max-w-md">
        The rescue destination you are looking for does not exist or has been relocated.
      </p>
      <Link to="/" className="mt-6">
        <Button>Return to Home</Button>
      </Link>
    </div>
  );
}