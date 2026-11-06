import { normalizeId } from "./normalize";
import type { DevicePrefs, Resolved, ServerConfig, Side, UserPrefs } from "./types";

export const widthMin = 300;
export const widthMax = 560;
export const widthDefault = 380;
export const quickDefault = ["👍", "❤️", "😂", "😮", "🎉", "🔥"];

export function defaultUserPrefs(): UserPrefs {
  return { theme: "server", layout: null, messageSide: null, messageStyle: null, autoHide: null, shortcut: true, quick: [...quickDefault], favorites: [], recent: [] };
}

export function defaultDevicePrefs(): DevicePrefs {
  return { width: widthDefault, side: "right" };
}

export function clampWidth(value: number): number {
  return Math.min(widthMax, Math.max(widthMin, Math.round(Number.isFinite(value) ? value : widthDefault)));
}

export function resolveSettings(server: ServerConfig, user: UserPrefs, device: DevicePrefs): Resolved {
  const locked = !server.allowUserAppearance;
  const theme = locked || user.theme === "server" ? server.theme : user.theme;
  return {
    theme,
    layout: (!locked && user.layout) || server.layout,
    messageSide: (!locked && user.messageSide) || server.messageSide,
    messageStyle: (!locked && user.messageStyle) || server.messageStyle,
    autoHide: locked || user.autoHide === null ? server.autoHide : user.autoHide,
    shortcut: server.shortcutEnabled && user.shortcut !== false,
    locked,
    customBase: server.customBase,
    customCorners: server.customCorners,
    customGlass: server.customGlass,
    width: clampWidth(device.width),
    side: device.side
  };
}

function emojiList(value: unknown, limit: number): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 16).slice(0, limit) : [];
}

export function parseUserPrefs(raw: unknown): UserPrefs {
  const base = defaultUserPrefs();
  if (!raw || typeof raw !== "object") {
    return base;
  }
  const source = raw as Record<string, unknown>;
  const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | null => (allowed as readonly unknown[]).includes(value) ? (value as T) : null;
  const quick = emojiList(source.quick, 8);
  return {
    theme: pick(source.theme, ["server", "violet", "glass"] as const) || "server",
    layout: pick(source.layout, ["docked", "floating"] as const),
    messageSide: pick(source.messageSide, ["left", "right"] as const),
    messageStyle: pick(source.messageStyle, ["bubbles", "flat"] as const),
    autoHide: typeof source.autoHide === "boolean" ? source.autoHide : null,
    shortcut: source.shortcut !== false,
    quick: quick.length ? quick : base.quick,
    favorites: emojiList(source.favorites, 40),
    recent: emojiList(source.recent, 24)
  };
}

export function parseDevicePrefs(rawWidth: string | null, rawSide: string | null): DevicePrefs {
  const width = Number(rawWidth);
  return { width: rawWidth && Number.isFinite(width) ? clampWidth(width) : widthDefault, side: rawSide === "left" ? "left" : "right" };
}

/** Read the 2.x localStorage keys once so existing users keep their emoji and width. */
export function legacyUserPrefs(storage: Pick<Storage, "getItem">): Partial<UserPrefs> | null {
  const list = (key: string) => {
    try {
      const parsed = JSON.parse(storage.getItem(key) || "null");
      return Array.isArray(parsed) ? emojiList(parsed, 40) : null;
    } catch {
      return null;
    }
  };
  const quick = list("jellychat.reactions.quick.v1");
  const favorites = list("jellychat.reactions.favorites.v1");
  const recent = list("jellychat.reactions.recent.v1");
  if (!quick && !favorites && !recent) {
    return null;
  }
  const result: Partial<UserPrefs> = {};
  if (quick?.length) result.quick = quick.slice(0, 8);
  if (favorites) result.favorites = favorites;
  if (recent) result.recent = recent.slice(0, 24);
  return result;
}

export function legacyDevicePrefs(storage: Pick<Storage, "getItem">): DevicePrefs | null {
  const width = storage.getItem("jellychat.drawer.width.v1");
  const side = storage.getItem("jellychat.drawerSide");
  return width || side ? parseDevicePrefs(width, side) : null;
}

export function sameUser(a: string, b: string): boolean {
  return !!a && normalizeId(a) === normalizeId(b);
}

export type { Side };
