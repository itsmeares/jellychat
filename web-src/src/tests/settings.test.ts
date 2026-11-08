import { describe, expect, it } from "vitest";
import { defaultServerConfig } from "../core/normalize";
import { clampWidth, defaultDevicePrefs, defaultUserPrefs, legacyDevicePrefs, legacyUserPrefs, parseUserPrefs, resolveSettings } from "../core/settings";

const server = { ...defaultServerConfig, theme: "glass" as const, layout: "floating" as const, messageSide: "right" as const };

describe("resolveSettings", () => {
  it("uses the built-in defaults when the server has none", () => {
    const resolved = resolveSettings(defaultServerConfig, defaultUserPrefs(), defaultDevicePrefs());
    expect(resolved).toMatchObject({ theme: "violet", layout: "docked", messageSide: "left", messageStyle: "bubbles", locked: false });
  });

  it("follows the admin choice when the user picks server default", () => {
    expect(resolveSettings(server, defaultUserPrefs(), defaultDevicePrefs()).theme).toBe("glass");
  });

  it("lets the user override while the switch is on", () => {
    const user = { ...defaultUserPrefs(), theme: "violet" as const, layout: "docked" as const, messageSide: "left" as const };
    expect(resolveSettings(server, user, defaultDevicePrefs())).toMatchObject({ theme: "violet", layout: "docked", messageSide: "left" });
  });

  it("ignores user appearance overrides when the admin locks them but keeps width and side", () => {
    const user = { ...defaultUserPrefs(), theme: "violet" as const, layout: "docked" as const };
    const resolved = resolveSettings({ ...server, allowUserAppearance: false }, user, { width: 500, side: "left" });
    expect(resolved).toMatchObject({ theme: "glass", layout: "floating", locked: true, width: 500, side: "left" });
  });

  it("turns the shortcut off when either side disables it", () => {
    expect(resolveSettings({ ...server, shortcutEnabled: false }, defaultUserPrefs(), defaultDevicePrefs()).shortcut).toBe(false);
    expect(resolveSettings(server, { ...defaultUserPrefs(), shortcut: false }, defaultDevicePrefs()).shortcut).toBe(false);
  });

  it("clamps the width", () => {
    expect(clampWidth(10)).toBe(300);
    expect(clampWidth(9999)).toBe(560);
    expect(clampWidth(Number.NaN)).toBe(380);
  });
});

describe("stored preferences", () => {
  it("rejects unknown values and keeps lists bounded", () => {
    const parsed = parseUserPrefs({ theme: "neon", layout: "floating", quick: ["👍", 5, "😂"], favorites: Array(100).fill("x") });
    expect(parsed.theme).toBe("server");
    expect(parsed.layout).toBe("floating");
    expect(parsed.quick).toEqual(["👍", "😂"]);
    expect(parsed.favorites).toHaveLength(40);
  });

  it("migrates the 2.x localStorage keys", () => {
    const data: Record<string, string> = {
      "jellychat.reactions.quick.v1": JSON.stringify(["🔥", "👍"]),
      "jellychat.reactions.favorites.v1": JSON.stringify(["🎉"]),
      "jellychat.drawer.width.v1": "420",
      "jellychat.drawerSide": "left"
    };
    const storage = { getItem: (key: string) => data[key] ?? null };
    expect(legacyUserPrefs(storage)).toEqual({ quick: ["🔥", "👍"], favorites: ["🎉"] });
    expect(legacyDevicePrefs(storage)).toEqual({ width: 420, side: "left" });
    expect(legacyUserPrefs({ getItem: () => null })).toBeNull();
  });
});
