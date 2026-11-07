import { normalizeEvent, normalizeId, normalizeRoom, normalizeServerConfig, normalizeSync } from "./normalize";
import type { RoomEvent, RoomInfo, ServerConfig, SyncResponse } from "./types";

/** The slice of Jellyfin Web's global ApiClient this plugin uses. */
export type JellyfinApiClient = {
  serverAddress(): string;
  accessToken(): string | null | undefined;
  getCurrentUserId?(): string | null | undefined;
  deviceId?(): string;
  deviceName?(): string;
  appName?(): string;
  appVersion?(): string;
};

declare global {
  interface Window {
    ApiClient?: JellyfinApiClient;
  }
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function jellyfinClient(): JellyfinApiClient | null {
  const client = window.ApiClient;
  return client && typeof client.serverAddress === "function" ? client : null;
}

export function isSignedIn(): boolean {
  const client = jellyfinClient();
  return !!client && !!client.accessToken() && !!client.serverAddress();
}

export function currentUserId(): string {
  return normalizeId(jellyfinClient()?.getCurrentUserId?.() || "");
}

export function authorizationHeader(client: JellyfinApiClient): string {
  const part = (key: string, value: string | undefined) => key + '="' + (value ?? "").replace(/"/g, "") + '"';
  return "MediaBrowser " + [
    part("Client", client.appName?.() || "Jellyfin Web"),
    part("Device", client.deviceName?.() || "Browser"),
    part("DeviceId", client.deviceId?.() || ""),
    part("Version", client.appVersion?.() || "0"),
    part("Token", client.accessToken() || "")
  ].join(", ");
}

type RequestOptions = {
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  keepalive?: boolean;
};

export async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
  const client = jellyfinClient();
  if (!client || !client.accessToken()) {
    throw new ApiError(401, "Not signed in");
  }

  const url = new URL(client.serverAddress().replace(/\/+$/, "") + path, window.location.href);
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const headers: Record<string, string> = { Authorization: authorizationHeader(client), Accept: "application/json" };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url.toString(), {
    method: options.method || (options.body !== undefined ? "POST" : "GET"),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    keepalive: options.keepalive,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new ApiError(response.status, (await response.text().catch(() => "")) || response.statusText);
  }
  if (response.status === 204) {
    return null;
  }
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}

export type SyncQuery = { afterSequence?: number; roomVersion?: string; waitSeconds?: number };

export type EventRequest = {
  type: string;
  clientEventId?: string;
  text?: string;
  replyTo?: { eventId: string; userId: string; userName: string; messagePreview: string; createdAt: string };
  emoji?: string;
  isTyping?: boolean;
  itemId?: string;
  itemName?: string;
  positionSeconds?: number;
  fromPositionTicks?: number;
  toPositionTicks?: number;
};

export const api = {
  async sync(query: SyncQuery, signal?: AbortSignal): Promise<SyncResponse> {
    return normalizeSync(await request("/JellyChat/Sync", { query, signal }));
  },
  async send(event: EventRequest): Promise<RoomEvent> {
    return normalizeEvent(await request("/JellyChat/Events", { method: "POST", body: event }));
  },
  async config(): Promise<ServerConfig> {
    return normalizeServerConfig(await request("/JellyChat/Config"));
  },
  async unlock(password: string): Promise<RoomInfo> {
    return normalizeRoom(await request("/JellyChat/Room/Unlock", { method: "POST", body: { password } }));
  },
  async setPassword(password: string): Promise<RoomInfo> {
    return normalizeRoom(await request("/JellyChat/Room/Password", { method: "PUT", body: { password } }));
  },
  async disablePassword(): Promise<RoomInfo> {
    return normalizeRoom(await request("/JellyChat/Room/Password", { method: "DELETE" }));
  }
};
