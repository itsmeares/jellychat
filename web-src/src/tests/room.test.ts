import { describe, expect, it, vi } from "vitest";
import { RoomStore } from "../core/room";
import type { RoomEvent, RoomInfo, SyncResponse } from "../core/types";

const room: RoomInfo = { inGroup: true, groupId: "g1", groupName: "Night", sessionId: "s", participants: ["a", "b"], passwordProtected: false, authorized: true, isOwner: true };

function event(partial: Partial<RoomEvent>): RoomEvent {
  return { id: "e" + (partial.sequence ?? 1), sequence: 1, type: "chat.message", userId: "bob", userName: "Bob", createdAt: new Date().toISOString(), text: "hi", replyTo: null, emoji: "", playbackAction: "", fromTicks: null, toTicks: null, positionSeconds: null, itemName: "", clientEventId: "", isTyping: null, ...partial };
}

function sync(events: RoomEvent[], groupRoom = room): SyncResponse {
  return { room: groupRoom, roomVersion: "v", events };
}

function store(send = vi.fn()) {
  return new RoomStore({ send, selfUserId: () => "me", makeId: (() => { let n = 0; return () => "c" + ++n; })() });
}

describe("RoomStore", () => {
  it("groups messages from the same person close together", () => {
    const s = store();
    s.applySync(sync([event({ sequence: 1 }), event({ sequence: 2, text: "again" }), event({ sequence: 3, userId: "cat", userName: "Cat" })]));
    const items = s.getState().items;
    expect(items).toHaveLength(2);
    expect((items[0] as { messages: unknown[] }).messages).toHaveLength(2);
  });

  it("does not duplicate events seen twice", () => {
    const s = store();
    s.applySync(sync([event({ sequence: 1 })]));
    s.applySync(sync([event({ sequence: 1 })]));
    expect(s.getState().items).toHaveLength(1);
    expect(s.getState().lastSequence).toBe(1);
  });

  it("shows a sent message at once and replaces it with the stored one", async () => {
    const stored = event({ sequence: 5, userId: "me", userName: "Me", text: "hello", clientEventId: "c1" });
    const send = vi.fn().mockResolvedValue(stored);
    const s = store(send);
    s.applySync(sync([]));
    const pending = s.sendMessage("hello");
    expect((s.getState().items[0] as { messages: Array<{ status: string }> }).messages[0].status).toBe("sending");
    await pending;
    const group = s.getState().items[0];
    expect((group as { messages: unknown[] }).messages).toHaveLength(1);
    expect(group.kind === "group" && group.messages[0].status).toBe("sent");
  });

  it("does not move the sync cursor when a send completes", async () => {
    const send = vi.fn().mockResolvedValue(event({ sequence: 9, userId: "me", text: "hello", clientEventId: "c1" }));
    const s = store(send);
    s.applySync(sync([event({ sequence: 1 })]));
    await s.sendMessage("hello");
    expect(s.getState().lastSequence).toBe(1);
    s.applySync(sync([event({ sequence: 5, text: "earlier" }), event({ sequence: 9, userId: "me", text: "hello", clientEventId: "c1" })]));
    expect(s.getState().lastSequence).toBe(9);
    const group = s.getState().items.flatMap((item) => (item.kind === "group" ? item.messages : []));
    expect(group.map((message) => message.text)).toEqual(["hi", "earlier", "hello"]);
  });

  it("marks a failed message and retries it", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(event({ sequence: 2, userId: "me", text: "yo", clientEventId: "c1" }));
    const s = store(send);
    s.applySync(sync([]));
    await s.sendMessage("yo");
    const failed = s.getState().items[0];
    expect(failed.kind === "group" && failed.messages[0].status).toBe("failed");
    await s.retry("client:c1");
    const done = s.getState().items[0];
    expect(done.kind === "group" && done.messages[0].status).toBe("sent");
  });

  it("does not signal old messages on the first sync, but signals new ones", () => {
    const s = store();
    const seen: string[] = [];
    s.onSignal((signal) => seen.push(signal.kind));
    s.applySync(sync([event({ sequence: 1 })]));
    expect(seen).toEqual([]);
    s.applySync(sync([event({ sequence: 2 })]));
    expect(seen).toEqual(["message"]);
  });

  it("ignores stale reactions in the backlog", () => {
    const s = store();
    const seen: string[] = [];
    s.onSignal((signal) => seen.push(signal.kind));
    s.applySync(sync([event({ sequence: 1, type: "reaction.emoji", emoji: "🔥", createdAt: new Date(Date.now() - 60000).toISOString() })]));
    expect(seen).toEqual([]);
  });

  it("clears history when the group changes", () => {
    const s = store();
    s.applySync(sync([event({ sequence: 1 })]));
    s.applySync(sync([], { ...room, groupId: "g2" }));
    expect(s.getState().items).toHaveLength(0);
    expect(s.getState().lastSequence).toBe(0);
  });

  it("tracks typing and expires it", () => {
    vi.useFakeTimers();
    const s = store();
    s.applySync(sync([event({ sequence: 1, type: "typing.update", isTyping: true })]));
    expect(s.getState().typing).toEqual(["Bob"]);
    vi.advanceTimersByTime(7000);
    expect(s.getState().typing).toEqual([]);
    vi.useRealTimers();
  });
});
