import { baseUrl } from "@/src/env";
import { storage } from "@/src/utils/storage";

const TOKEN_KEY = "auth_token";

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export async function loadToken() {
  token = (await storage.secureGet(TOKEN_KEY, null)) as string | null;
  return token;
}

export async function setToken(t: string | null) {
  token = t;
  if (t) await storage.secureSet(TOKEN_KEY, t);
  else await storage.secureRemove(TOKEN_KEY);
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const sent = token;
  const res = await fetch(`${baseUrl()}/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(sent ? { Authorization: `Bearer ${sent}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // Only sign out when the token we actually sent was rejected.
  if (res.status === 401 && sent && sent === token) {
    await setToken(null);
    onUnauthorized?.();
  }
  if (!res.ok) {
    const d = data?.detail;
    const msg = typeof d === "string" ? d : Array.isArray(d) ? `${d[0]?.loc?.slice(-1)[0] ?? ""} ${d[0]?.msg ?? ""}`.trim() : "Something went wrong";
    throw new Error(msg);
  }
  return data as T;
}
