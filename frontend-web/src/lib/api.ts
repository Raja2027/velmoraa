export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  if (!path) return API_BASE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function wsUrl(path: string): string {
  const base = API_BASE_URL.replace(/^http/i, "ws");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function gcsObjectKey(value: string): string | null {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/^\/+/, "");

    if (host === "storage.googleapis.com") {
      const [, ...keyParts] = path.split("/");
      return keyParts.length ? keyParts.join("/") : null;
    }

    if (host.endsWith(".storage.googleapis.com")) {
      return path || null;
    }
  } catch {
    return null;
  }

  return null;
}

export function mediaUrl(value?: string | null): string {
  if (!value) return "";
  if (/^(blob:|data:)/i.test(value)) return value;

  if (value.startsWith("/uploads/")) {
    return apiUrl(`/media/${value.slice("/uploads/".length)}`);
  }

  const proxyGcs = process.env.NEXT_PUBLIC_PROXY_GCS_MEDIA !== "false";
  if (proxyGcs && /^https?:\/\//i.test(value)) {
    const key = gcsObjectKey(value);
    if (key) {
      const encodedKey = key.split("/").map(encodeURIComponent).join("/");
      return apiUrl(`/media/${encodedKey}`);
    }
  }

  return /^https?:\/\//i.test(value) ? value : apiUrl(value);
}
