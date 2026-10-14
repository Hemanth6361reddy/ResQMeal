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