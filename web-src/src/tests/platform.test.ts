// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { findVideo, isNativeShell, isVideoRoute } from "../core/host";
import { itemIdFromSource } from "../core/playback";
import { searchCatalog } from "../core/emoji/search";
import { emojiCatalog } from "../core/emoji/catalog";
import { normalizeServerConfig } from "../core/normalize";

describe("isNativeShell", () => {
  it("is false in a plain browser", () => {
    expect(isNativeShell(window as never)).toBe(false);
  });
  it("detects Jellyfin Desktop and Jellium style hosts", () => {
    expect(isNativeShell({ jmpInfo: { mode: "desktop" } } as never)).toBe(true);
    expect(isNativeShell({ NativeShell: {} } as never)).toBe(true);
  });
});

describe("itemIdFromSource", () => {
  it("reads the item id from stream URLs", () => {
    expect(itemIdFromSource("http://x/Videos/75A6AA4F90F7E1600CA1B6266CA5EE63/stream.mp4?a=1")).toBe("75a6aa4f90f7e1600ca1b6266ca5ee63");
    expect(itemIdFromSource("http://x/web/#/details?id=75a6aa4f90f7e1600ca1b6266ca5ee63")).toBe("75a6aa4f90f7e1600ca1b6266ca5ee63");
    expect(itemIdFromSource("blob:http://x/abc")).toBe("");
  });
});

describe("emoji search", () => {
  it("ranks exact names before loose tags", () => {
    expect(searchCatalog(emojiCatalog, "heart")[0].emoji).toBe("❤️");
    expect(searchCatalog(emojiCatalog, "zzzz")).toEqual([]);
    expect(searchCatalog(emojiCatalog, "")).toBe(emojiCatalog);
  });
});

describe("normalizeServerConfig", () => {
  it("accepts server PascalCase and falls back on bad values", () => {
    expect(normalizeServerConfig({ Theme: "glass", Layout: "floating", MessageSide: "sideways", AllowUserAppearance: false })).toMatchObject({ theme: "glass", layout: "floating", messageSide: "left", allowUserAppearance: false });
    expect(normalizeServerConfig(null).theme).toBe("violet");
  });
});

describe("playback detection", () => {
  it("ignores a preview video on Home", () => {
    window.location.hash = "#/home";
    document.body.innerHTML = "<video></video>";
    expect(findVideo()).toBeNull();
    expect(isVideoRoute()).toBe(false);
  });

  it("finds the player video on the video route", () => {
    window.location.hash = "#/video";
    document.body.innerHTML = '<div class="videoPlayerContainer"><video class="htmlvideoplayer"></video></div>';
    expect(findVideo()).not.toBeNull();
    expect(isVideoRoute()).toBe(true);
  });
});
