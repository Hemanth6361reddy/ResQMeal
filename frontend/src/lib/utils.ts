import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines Tailwind classes conditionally without conflicts.
 * Example: cn("px-4 py-2", isPrimary && "bg-primary text-black")
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}