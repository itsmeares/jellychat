import { api, currentUserId, request } from "./api";
import { defaultUserPrefs, legacyUserPrefs, parseDevicePrefs, parseUserPrefs, resolveSettings } from "./settings";
import { defaultServerConfig } from "./normalize";
import type { DevicePrefs, Resolved, ServerConfig, UserPrefs } from "./types";

const customKey = "jellychat.prefs.v3";
const cachePrefix = "jellychat.cache.v3.";
const deviceWidthKey = "jellychat.drawer.width.v1";
const deviceSideKey = "jellychat.drawerSide";
const saveDelayMs = 500;

export type PrefsState = { server: ServerConfig; user: UserPrefs; device: DevicePrefs; resolved: Resolved; loaded: boolean };

type DisplayPreferences = { CustomPrefs?: Record<string, string>; [key: string]: unknown };

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class PrefsStore {
  private state: PrefsState;
  private readonly listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private userId = "";
  private remote: DisplayPreferences | null = null;

  constructor() {
    const device = parseDevicePrefs(storage()?.getItem(deviceWidthKey) ?? null, storage()?.getItem(deviceSideKey) ?? null);
    this.state = this.build(defaultServerConfig, defaultUserPrefs(), device, false);
  }

  getState = (): PrefsState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async load(): Promise<void> {
    const userId = currentUserId();
    const server = await api.config().catch(() => this.state.server);
    this.userId = userId;
    const cached = this.readCache(userId);
    let user = cached || defaultUserPrefs();
    try {
      this.remote = (await request(this.prefsPath(), { query: { userId, client: "jellychat" } })) as DisplayPreferences;
      const stored = this.remote?.CustomPrefs?.[customKey];
      if (stored) {
        user = parseUserPrefs(JSON.parse(stored));
      } else {
        user = this.migrateLegacy(user);
      }
      this.writeCache(userId, user);
    } catch {
      /* offline or no access: keep the cached copy */
    }
    this.set(server, user, this.state.device, true);
  }

  updateUser(patch: Partial<UserPrefs>): void {
    this.set(this.state.server, { ...this.state.user, ...patch }, this.state.device, true);
    this.scheduleSave();
  }

  updateDevice(patch: Partial<DevicePrefs>): void {
    const device = { ...this.state.device, ...patch };
    try {
      storage()?.setItem(deviceWidthKey, String(device.width));
      storage()?.setItem(deviceSideKey, device.side);
    } catch {
      /* private mode */
    }
    this.set(this.state.server, this.state.user, device, true);
  }

  resetUser(): void {
    const keep = { quick: this.state.user.quick, favorites: this.state.user.favorites, recent: this.state.user.recent };
    this.updateUser({ ...defaultUserPrefs(), ...keep });
  }

  recordRecent(emoji: string): void {
    const recent = [emoji, ...this.state.user.recent.filter((item) => item !== emoji)].slice(0, 24);
    this.updateUser({ recent });
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.save();
  }

  private prefsPath(): string {
    return "/DisplayPreferences/jellychat";
  }

  private migrateLegacy(current: UserPrefs): UserPrefs {
    const store = storage();
    const legacy = store ? legacyUserPrefs(store) : null;
    if (!legacy) {
      return current;
    }
    const merged = { ...current, ...legacy };
    this.state = { ...this.state, user: merged };
    this.scheduleSave();
    return merged;
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.writeCache(this.userId, this.state.user);
    this.saveTimer = setTimeout(() => void this.save(), saveDelayMs);
  }

  private async save(): Promise<void> {
    this.saveTimer = null;
    if (!this.userId) {
      return;
    }
    const body: DisplayPreferences = { ...(this.remote || { Id: "jellychat", Client: "jellychat" }) };
    body.CustomPrefs = { ...(body.CustomPrefs || {}), [customKey]: JSON.stringify(this.state.user) };
    try {
      await request(this.prefsPath(), { method: "POST", query: { userId: this.userId, client: "jellychat" }, body });
      this.remote = body;
    } catch {
      /* the local cache keeps the value; the next change retries */
    }
  }

  private readCache(userId: string): UserPrefs | null {
    try {
      const raw = storage()?.getItem(cachePrefix + userId);
      return raw ? parseUserPrefs(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  private writeCache(userId: string, user: UserPrefs): void {
    try {
      storage()?.setItem(cachePrefix + userId, JSON.stringify(user));
    } catch {
      /* private mode */
    }
  }

  private build(server: ServerConfig, user: UserPrefs, device: DevicePrefs, loaded: boolean): PrefsState {
    return { server, user, device, resolved: resolveSettings(server, user, device), loaded };
  }

  private set(server: ServerConfig, user: UserPrefs, device: DevicePrefs, loaded: boolean): void {
    this.state = this.build(server, user, device, loaded);
    this.listeners.forEach((listener) => listener());
  }
}
