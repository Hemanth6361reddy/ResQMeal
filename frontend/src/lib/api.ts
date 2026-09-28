const API_BASE_URL = "http://localhost:8000/api/v1";

// Auth Storage Helpers
export const getAuthToken = () => localStorage.getItem("resqmeal_token");
export const setAuthToken = (token: string) => localStorage.setItem("resqmeal_token", token);
export const removeAuthToken = () => localStorage.removeItem("resqmeal_token");

export const getUserRole = () => localStorage.getItem("resqmeal_role");
export const setUserRole = (role: string) => localStorage.setItem("resqmeal_role", role);

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