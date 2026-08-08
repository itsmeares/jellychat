export type DrawerWidthPreference = {
  width: number;
  source: "default" | "stored" | "clamped";
  min: number;
  max: number;
};

export type DrawerAlphaPreference = {
  alpha: number;
  source: "default" | "desktop-default" | "stored" | "clamped";
};

export const drawerWidthDefaultPx = 340;
export const drawerWidthMinPx = 280;
export const drawerWidthHardMaxPx = 560;
export const drawerBackgroundAlphaDefault = 0.96;
export const drawerBackgroundAlphaDesktopDefault = 0.88;
export const drawerBackgroundAlphaMin = 0.6;
export const drawerBackgroundAlphaMax = 1;

const drawerWidthStorageKey = "jellychat.drawer.width.v1";
const drawerBackgroundAlphaStorageKey = "jellychat.drawer.backgroundAlpha.v1";
const customCssDisabledStorageKey = "jellychat.customCss.disabled.v1";

function readNumber(key: string): number | null {
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) {
      return null;
    }

    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    window.localStorage?.setItem(key, String(value));
  } catch {
    if (window.JellyChatDebug) {
      window.JellyChatDebug.lastError = "Could not save JellyChat drawer preferences.";
    }
  }
}

function removeValue(key: string): void {
  try {
    window.localStorage?.removeItem(key);
  } catch {
    if (window.JellyChatDebug) {
      window.JellyChatDebug.lastError = "Could not reset JellyChat drawer preferences.";
    }
  }
}

function readBoolean(key: string): boolean {
  try {
    return window.localStorage?.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeBoolean(key: string, value: boolean): void {
  try {
    window.localStorage?.setItem(key, String(value));
  } catch {
    if (window.JellyChatDebug) {
      window.JellyChatDebug.lastError = "Could not save JellyChat appearance preferences.";
    }
  }
}

export function getCustomCssDisabledPreference(): boolean {
  return readBoolean(customCssDisabledStorageKey);
}

export function applyCustomCssPreference(disabled = getCustomCssDisabledPreference()): boolean {
  const stylesheet = document.querySelector<HTMLLinkElement>('link[data-jellychat-custom="true"]');
  if (stylesheet) {
    stylesheet.disabled = disabled;
  }
  return disabled;
}

export function saveCustomCssDisabled(disabled: boolean): boolean {
  writeBoolean(customCssDisabledStorageKey, disabled);
  return applyCustomCssPreference(disabled);
}

export function resetCustomCssDisabled(): boolean {
  removeValue(customCssDisabledStorageKey);
  return applyCustomCssPreference(false);
}

export function getDrawerWidthMax(): number {
  const viewportWidth = Math.max(
    window.innerWidth || 0,
    document.documentElement?.clientWidth || 0,
    window.visualViewport?.width || 0,
    drawerWidthDefaultPx
  );
  return Math.max(drawerWidthMinPx, Math.min(drawerWidthHardMaxPx, Math.floor(viewportWidth * 0.45)));
}

export function clampDrawerWidth(width: number): number {
  const max = getDrawerWidthMax();
  return Math.min(max, Math.max(drawerWidthMinPx, Math.round(width)));
}

export function getDrawerWidthPreference(): DrawerWidthPreference {
  const stored = readNumber(drawerWidthStorageKey);
  const max = getDrawerWidthMax();
  if (stored === null) {
    return {
      width: Math.min(drawerWidthDefaultPx, max),
      source: "default",
      min: drawerWidthMinPx,
      max
    };
  }

  const width = clampDrawerWidth(stored);
  return {
    width,
    source: width === Math.round(stored) ? "stored" : "clamped",
    min: drawerWidthMinPx,
    max
  };
}

export function saveDrawerWidth(width: number): DrawerWidthPreference {
  const clamped = clampDrawerWidth(width);
  writeNumber(drawerWidthStorageKey, clamped);
  return getDrawerWidthPreference();
}

export function resetDrawerWidth(): DrawerWidthPreference {
  removeValue(drawerWidthStorageKey);
  return getDrawerWidthPreference();
}

export function clampDrawerBackgroundAlpha(alpha: number): number {
  return Math.min(drawerBackgroundAlphaMax, Math.max(drawerBackgroundAlphaMin, Math.round(alpha * 100) / 100));
}

export function getDrawerBackgroundAlphaPreference(desktopVideoSafeMode: boolean): DrawerAlphaPreference {
  const stored = readNumber(drawerBackgroundAlphaStorageKey);
  if (stored === null) {
    return {
      alpha: desktopVideoSafeMode ? drawerBackgroundAlphaDesktopDefault : drawerBackgroundAlphaDefault,
      source: desktopVideoSafeMode ? "desktop-default" : "default"
    };
  }

  const alpha = clampDrawerBackgroundAlpha(stored);
  return {
    alpha,
    source: alpha === Math.round(stored * 100) / 100 ? "stored" : "clamped"
  };
}

export function saveDrawerBackgroundAlpha(alpha: number): DrawerAlphaPreference {
  writeNumber(drawerBackgroundAlphaStorageKey, clampDrawerBackgroundAlpha(alpha));
  return getDrawerBackgroundAlphaPreference(!!window.JellyChatDebug?.desktopVideoSafeMode);
}

export function resetDrawerBackgroundAlpha(): DrawerAlphaPreference {
  removeValue(drawerBackgroundAlphaStorageKey);
  return getDrawerBackgroundAlphaPreference(!!window.JellyChatDebug?.desktopVideoSafeMode);
}

export function resetDrawerPreferences(): { width: DrawerWidthPreference; alpha: DrawerAlphaPreference; customCssDisabled: boolean } {
  removeValue(drawerWidthStorageKey);
  removeValue(drawerBackgroundAlphaStorageKey);
  return {
    width: getDrawerWidthPreference(),
    alpha: getDrawerBackgroundAlphaPreference(!!window.JellyChatDebug?.desktopVideoSafeMode),
    customCssDisabled: resetCustomCssDisabled()
  };
}
