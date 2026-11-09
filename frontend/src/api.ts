const apiBaseUrl = import.meta.env.VITE_API_URL ?? "";

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = localStorage.getItem("access_token");

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== "/api/login" && headers.has("Authorization")) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("agrigoUser");
      window.dispatchEvent(new Event("agrigo:auth-changed"));
      throw new Error("Your session is no longer valid. Please sign in again.");
    }

    const detail = data.detail;
    const message = Array.isArray(detail)
      ? detail.map((error: { msg?: string }) => error.msg || "Invalid input").join(", ")
      : detail || "Request failed. Please try again.";
    throw new Error(message);
  }
  return data as T;
}

export function realtimeUrl(token: string): string {
  const url = new URL(`${apiBaseUrl}/api/realtime`, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);
  return url.toString();
}