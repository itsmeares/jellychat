// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ method: string; body?: { CustomPrefs?: Record<string, string> } }> = [];
let failGet = 0;
const stored = { Id: "x", CustomPrefs: { "jellychat.prefs.v3": JSON.stringify({ quick: ["🔥"], favorites: ["🎉"] }), other: "keep" } };

vi.mock("../core/api", () => ({
  currentUserId: () => "u1",
  api: { config: async () => { throw new Error("no config"); } },
  request: async (_path: string, options: { method?: string; body?: never } = {}) => {
    const method = options.method || "GET";
    calls.push({ method, body: options.body });
    if (method === "GET") {
      if (failGet-- > 0) throw new Error("offline");
      return JSON.parse(JSON.stringify(stored));
    }
    return null;
  }
}));

const { PrefsStore } = await import("../core/prefs");

const memory = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => void memory.set(key, value), removeItem: (key: string) => void memory.delete(key) }
});

beforeEach(() => {
  calls.length = 0;
  failGet = 0;
  memory.clear();
  vi.useRealTimers();
});

describe("PrefsStore", () => {
  it("never saves defaults over stored preferences after a failed load, and merges local changes on retry", async () => {
    vi.useFakeTimers();
    failGet = 1;
    const store = new PrefsStore();
    await store.load();
    store.updateUser({ theme: "glass" });
    await vi.advanceTimersByTimeAsync(600);
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(600);
    const post = calls.find((call) => call.method === "POST");
    const saved = JSON.parse(post!.body!.CustomPrefs!["jellychat.prefs.v3"]);
    expect(saved).toMatchObject({ theme: "glass", quick: ["🔥"], favorites: ["🎉"] });
    expect(post!.body!.CustomPrefs!.other).toBe("keep");
  });

  it("keeps a change made while a save is running", async () => {
    vi.useFakeTimers();
    const store = new PrefsStore();
    await store.load();
    store.updateUser({ theme: "glass" });
    await vi.advanceTimersByTimeAsync(500);
    store.updateUser({ theme: "violet" });
    await vi.advanceTimersByTimeAsync(600);
    const posts = calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(2);
    expect(JSON.parse(posts[1].body!.CustomPrefs!["jellychat.prefs.v3"]).theme).toBe("violet");
  });

  it("forgets the account on reset", async () => {
    const store = new PrefsStore();
    await store.load();
    store.updateUser({ theme: "glass" });
    store.reset();
    expect(store.getState().user.theme).toBe("server");
    expect(store.getState().loaded).toBe(false);
  });
});
