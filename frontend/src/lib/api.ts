const API_BASE_URL = "http://localhost:8000/api/v1";
export const BACKEND_URL = "http://localhost:8000";

// Auth Storage Helpers
export const getAuthToken = () => localStorage.getItem("resqmeal_token");
export const setAuthToken = (token: string) => localStorage.setItem("resqmeal_token", token);
export const removeAuthToken = () => localStorage.removeItem("resqmeal_token");

export const getUserRole = () => localStorage.getItem("resqmeal_role");
export const setUserRole = (role: string) => localStorage.setItem("resqmeal_role", role);

/**
 * Robustly turns any backend media path, relative URL, or Windows path
 * into a fully-qualified, browser-loadable URL (e.g. http://localhost:8000/uploads/file.jpg).
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("data:")
  ) {
    return trimmed;
  }

  // Normalize Windows backslashes
  let normalized = trimmed.replace(/\\/g, "/");

  // Check if it has an /uploads/ segment
  const uploadsIdx = normalized.indexOf("/uploads/");
  if (uploadsIdx !== -1) {
    normalized = normalized.substring(uploadsIdx);
  } else if (normalized.startsWith("uploads/")) {
    normalized = `/${normalized}`;
  } else if (!normalized.startsWith("/")) {
    normalized = `/uploads/${normalized}`;
  }

  return `${BACKEND_URL}${normalized}`;
}

/**
 * Safely parses media URLs from database records, handling:
 * - JSON string array (e.g. '["/uploads/1.jpg"]')
 * - Python string list with single quotes (e.g. "['/uploads/1.jpg']")
 * - PostgreSQL array strings (e.g. '{/uploads/1.jpg}')
 * - Plain string arrays
 * - Comma-separated strings
 * - Single URL strings
 */
export function parseMediaUrls(mediaInput: any): string[] {
  if (!mediaInput) return [];

  let rawList: any[] = [];

  if (Array.isArray(mediaInput)) {
    rawList = mediaInput;
  } else if (typeof mediaInput === "string") {
    const trimmed = mediaInput.trim();
    if (!trimmed) return [];

    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) rawList = parsed;
        else if (parsed) rawList = [parsed];
      } catch {
        try {
          const jsonCompatible = trimmed
            .replace(/^\{/, "[")
            .replace(/\}$/, "]")
            .replace(/'/g, '"');
          const parsed = JSON.parse(jsonCompatible);
          if (Array.isArray(parsed)) rawList = parsed;
          else if (parsed) rawList = [parsed];
        } catch {
          const matches = trimmed.match(/\/uploads\/[^\s"',\]\}]+/g);
          if (matches && matches.length > 0) {
            rawList = matches;
          } else {
            rawList = [trimmed];
          }
        }
      }
    } else if (trimmed.includes(",")) {
      rawList = trimmed.split(",").map((s) => s.trim());
    } else {
      rawList = [trimmed];
    }
  }

  return rawList
    .map((item) => {
      if (typeof item !== "string") return "";
      let s = item.trim();
      s = s.replace(/^['"\[\{]+|['"\]\}]+$/g, "").trim();
      return resolveMediaUrl(s);
    })
    .filter((url) => !!url);
}

/**
 * Checks if a media URL corresponds to a video file.
 */
export function isVideoMedia(url?: string | null): boolean {
  if (!url) return false;
  return /\.(mp4|webm|mov|ogg|m4v)(?:$|[?#])/i.test(url);
}

/**
 * Formats a date/timestamp to exact human-readable format:
 * e.g. "07 Oct 2026, 12:42 AM"
 */
export function formatUploadedDateTime(dateInput: string | Date | undefined | null): string {
  if (!dateInput) return "N/A";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "N/A";

  const day = String(d.getDate()).padStart(2, "0");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[d.getMonth()];
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  const hourStr = hours === 0 ? "12" : String(hours).padStart(2, "0");

  return `${day} ${month} ${year}, ${hourStr}:${minutes} ${ampm}`;
}

/**
 * Calculates a friendly relative time string (e.g. "18 minutes ago", "just now", "2 hours ago").
 */
export function formatRelativeTime(dateInput: string | Date | undefined | null): string {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";

  const now = Date.now();
  const diffMs = now - d.getTime();

  if (diffMs < 0) return "just now";
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? "minute" : "minutes"} ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks} ${diffWeeks === 1 ? "week" : "weeks"} ago`;
}

/**
 * Standardized Fetch Wrapper that automatically includes
 * Authorization: Bearer <token> for protected requests.
 */
export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
  }

  return response.json();
}