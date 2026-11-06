import type { EventRequest } from "./api";
import type { ChatMessage, PlaybackAction, PlaybackNotice, ReplyTarget, RoomEvent, RoomInfo, SyncResponse, TimelineItem } from "./types";

export type RoomSignal =
  | { kind: "message"; event: RoomEvent; mine: boolean }
  | { kind: "reaction"; event: RoomEvent; mine: boolean }
  | { kind: "playback"; event: RoomEvent; mine: boolean };

export type RoomState = {
  room: RoomInfo | null;
  ready: boolean;
  items: TimelineItem[];
  typing: string[];
  lastSequence: number;
  roomVersion: string;
};

export type RoomDeps = {
  send: (event: EventRequest) => Promise<RoomEvent>;
  selfUserId: () => string;
  now?: () => number;
  makeId?: () => string;
};

const groupWindowMs = 3 * 60 * 1000;
const typingTtlMs = 6000;
const typingThrottleMs = 3000;
const reactionFreshMs = 10000;
const maxTimelineEvents = 300;

function defaultId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function previewOf(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 140);
}

export class RoomStore {
  private state: RoomState = { room: null, ready: false, items: [], typing: [], lastSequence: 0, roomVersion: "" };
  private readonly listeners = new Set<() => void>();
  private readonly signalListeners = new Set<(signal: RoomSignal) => void>();
  private events: RoomEvent[] = [];
  private pending: ChatMessage[] = [];
  private typingUntil = new Map<string, { name: string; until: number }>();
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTypingSentAt = 0;
  private iAmTyping = false;
  private groupId = "";
  private firstSync = true;
  private readonly now: () => number;
  private readonly makeId: () => string;

  constructor(private readonly deps: RoomDeps) {
    this.now = deps.now || Date.now;
    this.makeId = deps.makeId || defaultId;
  }

  getState = (): RoomState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onSignal(listener: (signal: RoomSignal) => void): () => void {
    this.signalListeners.add(listener);
    return () => this.signalListeners.delete(listener);
  }

  applySync(response: SyncResponse): void {
    const room = response.room;
    const nextGroup = room.inGroup ? room.groupId : "";
    if (nextGroup !== this.groupId) {
      this.groupId = nextGroup;
      this.events = [];
      this.pending = [];
      this.typingUntil.clear();
      this.firstSync = true;
      this.state = { ...this.state, lastSequence: 0 };
    }

    const backlog = this.firstSync;
    this.firstSync = false;
    let lastSequence = this.state.lastSequence;
    const seen = new Set(this.events.map((event) => this.keyOf(event)));
    const signals: RoomSignal[] = [];

    response.events.forEach((event) => {
      lastSequence = Math.max(lastSequence, event.sequence);
      const mine = this.isMine(event.userId);
      if (event.type === "typing.update") {
        this.applyTyping(event, mine);
        return;
      }
      const key = this.keyOf(event);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      if (event.type === "reaction.emoji") {
        const fresh = this.now() - Date.parse(event.createdAt) < reactionFreshMs;
        if (!backlog || fresh) {
          signals.push({ kind: "reaction", event, mine });
        }
        return;
      }
      this.events.push(event);
      if (event.clientEventId) {
        this.pending = this.pending.filter((message) => message.key !== "client:" + event.clientEventId);
      }
      if (!backlog) {
        if (event.type === "chat.message") {
          signals.push({ kind: "message", event, mine });
        } else if (event.type.startsWith("playback.")) {
          signals.push({ kind: "playback", event, mine });
        }
      }
    });

    if (this.events.length > maxTimelineEvents) {
      this.events = this.events.slice(-maxTimelineEvents);
    }
    this.state = { ...this.state, room, ready: true, lastSequence, roomVersion: response.roomVersion };
    this.rebuild();
    signals.forEach((signal) => this.signalListeners.forEach((listener) => listener(signal)));
  }

  setRoom(room: RoomInfo): void {
    this.state = { ...this.state, room };
    this.emit();
  }

  async sendMessage(text: string, replyTo?: ChatMessage | null): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const clientEventId = this.makeId();
    const reply: ReplyTarget | null = replyTo
      ? { eventId: replyTo.id || replyTo.key, userId: replyTo.userId, userName: replyTo.userName, messagePreview: previewOf(replyTo.text), createdAt: replyTo.createdAt }
      : null;
    const message: ChatMessage = {
      key: "client:" + clientEventId,
      id: "",
      userId: this.deps.selfUserId(),
      userName: "You",
      text: trimmed,
      createdAt: new Date(this.now()).toISOString(),
      replyTo: reply,
      mine: true,
      status: "sending"
    };
    this.pending.push(message);
    this.stopTyping();
    this.rebuild();
    await this.deliver(message, clientEventId);
  }

  async retry(key: string): Promise<void> {
    const message = this.pending.find((item) => item.key === key);
    if (!message) {
      return;
    }
    message.status = "sending";
    this.rebuild();
    await this.deliver(message, key.replace("client:", ""));
  }

  private async deliver(message: ChatMessage, clientEventId: string): Promise<void> {
    try {
      const stored = await this.deps.send({ type: "chat.message", clientEventId, text: message.text, replyTo: message.replyTo || undefined });
      this.applySync({ room: this.state.room!, roomVersion: this.state.roomVersion, events: [stored] });
    } catch {
      message.status = "failed";
      this.rebuild();
    }
  }

  async sendReaction(emoji: string): Promise<void> {
    try {
      await this.deps.send({ type: "reaction.emoji", emoji, clientEventId: this.makeId() });
    } catch {
      /* a lost reaction is not worth an error */
    }
  }

  async sendPlayback(type: `playback.${PlaybackAction}`, details: Omit<EventRequest, "type">): Promise<void> {
    try {
      await this.deps.send({ type, clientEventId: this.makeId(), ...details });
    } catch {
      /* playback notices are best effort */
    }
  }

  notifyTyping(): void {
    const at = this.now();
    if (this.iAmTyping && at - this.lastTypingSentAt < typingThrottleMs) {
      return;
    }
    this.iAmTyping = true;
    this.lastTypingSentAt = at;
    void this.deps.send({ type: "typing.update", isTyping: true }).catch(() => undefined);
  }

  stopTyping(): void {
    if (!this.iAmTyping) {
      return;
    }
    this.iAmTyping = false;
    void this.deps.send({ type: "typing.update", isTyping: false }).catch(() => undefined);
  }

  private applyTyping(event: RoomEvent, mine: boolean): void {
    if (mine) {
      return;
    }
    if (event.isTyping) {
      this.typingUntil.set(event.userId, { name: event.userName, until: this.now() + typingTtlMs });
    } else {
      this.typingUntil.delete(event.userId);
    }
    this.scheduleTypingExpiry();
  }

  private scheduleTypingExpiry(): void {
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
    const nextExpiry = Math.min(...Array.from(this.typingUntil.values(), (entry) => entry.until));
    if (Number.isFinite(nextExpiry)) {
      this.typingTimer = setTimeout(() => {
        const at = this.now();
        this.typingUntil.forEach((entry, key) => entry.until <= at && this.typingUntil.delete(key));
        this.scheduleTypingExpiry();
        this.rebuild();
      }, Math.max(50, nextExpiry - this.now()));
    }
  }

  private isMine(userId: string): boolean {
    const self = this.deps.selfUserId();
    return !!self && userId === self;
  }

  private keyOf(event: RoomEvent): string {
    return event.clientEventId ? "client:" + event.clientEventId : "sequence:" + event.sequence;
  }

  private rebuild(): void {
    const items: TimelineItem[] = [];
    let group: Extract<TimelineItem, { kind: "group" }> | null = null;
    const push = (message: ChatMessage) => {
      const last = group ? group.messages[group.messages.length - 1] : null;
      const gap = last ? Date.parse(message.createdAt) - Date.parse(last.createdAt) : 0;
      if (!group || group.userId !== message.userId || gap > groupWindowMs || group.mine !== message.mine) {
        group = { kind: "group", key: "group:" + message.key, userId: message.userId, userName: message.userName, mine: message.mine, createdAt: message.createdAt, messages: [] };
        items.push(group);
      }
      group.messages.push(message);
    };

    this.events.forEach((event) => {
      if (event.type === "chat.message") {
        push({
          key: this.keyOf(event),
          id: event.id,
          userId: event.userId,
          userName: event.userName || "Someone",
          text: event.text,
          createdAt: event.createdAt,
          replyTo: event.replyTo,
          mine: this.isMine(event.userId),
          status: "sent"
        });
      } else if (event.type.startsWith("playback.") && event.playbackAction) {
        group = null;
        const notice: PlaybackNotice = {
          key: this.keyOf(event),
          userName: event.userName || "Someone",
          createdAt: event.createdAt,
          action: event.playbackAction,
          itemName: event.itemName,
          toTicks: event.toTicks,
          fromTicks: event.fromTicks
        };
        items.push({ kind: "playback", key: notice.key, notice });
      }
    });
    this.pending.forEach(push);

    this.state = { ...this.state, items, typing: Array.from(this.typingUntil.values(), (entry) => entry.name) };
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}
