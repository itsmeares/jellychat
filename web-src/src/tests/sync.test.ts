import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../core/api";
import { SyncLoop, backoffMs } from "../core/sync";
import type { SyncResponse } from "../core/types";

const response = (inGroup: boolean): SyncResponse => ({ room: { inGroup, groupId: "g", groupName: "", sessionId: "", participants: [], passwordProtected: false, authorized: true, isOwner: false }, events: [], roomVersion: "v" });

describe("backoffMs", () => {
  it("waits longer for auth errors and grows for other failures", () => {
    expect(backoffMs(new ApiError(401, ""), 1)).toBe(15000);
    expect(backoffMs(new ApiError(409, ""), 1)).toBe(5000);
    expect(backoffMs(new Error("x"), 1)).toBe(1000);
    expect(backoffMs(new Error("x"), 3)).toBe(4000);
    expect(backoffMs(new Error("x"), 20)).toBe(30000);
  });
});

describe("SyncLoop", () => {
  it("asks without waiting first, then holds the request", async () => {
    const queries: Array<number | undefined> = [];
    let loop: SyncLoop;
    loop = new SyncLoop({
      signedIn: () => true,
      isHidden: () => false,
      cursor: () => ({ afterSequence: 0, roomVersion: "" }),
      fetchSync: async (query) => { queries.push(query.waitSeconds); if (queries.length === 3) loop.stop(); return response(true); },
      onResponse: () => undefined,
      sleep: async () => undefined
    });
    loop.start();
    await vi.waitFor(() => expect(queries).toHaveLength(3));
    expect(queries).toEqual([0, 25, 25]);
  });

  it("does not call the server while signed out or hidden", async () => {
    const fetchSync = vi.fn();
    let ticks = 0;
    let loop: SyncLoop;
    loop = new SyncLoop({
      signedIn: () => false,
      isHidden: () => true,
      cursor: () => ({ afterSequence: 0, roomVersion: "" }),
      fetchSync,
      onResponse: () => undefined,
      sleep: async () => { if (++ticks > 3) loop.stop(); }
    });
    loop.start();
    await vi.waitFor(() => expect(ticks).toBeGreaterThan(3));
    expect(fetchSync).not.toHaveBeenCalled();
  });

  it("backs off after an error and recovers", async () => {
    const waits: number[] = [];
    let calls = 0;
    let loop: SyncLoop;
    loop = new SyncLoop({
      signedIn: () => true,
      isHidden: () => false,
      cursor: () => ({ afterSequence: 0, roomVersion: "" }),
      fetchSync: async () => { calls++; if (calls <= 2) throw new Error("down"); loop.stop(); return response(true); },
      onResponse: () => undefined,
      sleep: async (ms) => { waits.push(ms); }
    });
    loop.start();
    await vi.waitFor(() => expect(calls).toBe(3));
    expect(waits).toEqual([1000, 2000]);
  });
});
