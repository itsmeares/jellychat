import type { PlaybackAction } from "./types";

export type PlaybackReport = {
  action: PlaybackAction;
  positionSeconds: number;
  fromSeconds?: number;
  itemId: string;
  itemName: string;
};

const intentWindowMs = 2000;
const seekThresholdSeconds = 2;
const seekDebounceMs = 900;
const startGuardMs = 4000;

export function itemIdFromSource(source: string): string {
  const match = /\/(?:Videos|Audio)\/([0-9a-f]{32})/i.exec(source) || /[?&#/]id=([0-9a-f]{32})/i.exec(source);
  return match ? match[1].toLowerCase() : "";
}

function pageTitle(): string {
  return (document.querySelector(".pageTitle")?.textContent || "").trim();
}

/**
 * Reports only what this user did. Remote SyncPlay commands also fire media events,
 * so an event counts only if a local click, key or touch happened a moment before.
 */
export class PlaybackWatcher {
  private media: HTMLMediaElement | null = null;
  private lastInputAt = 0;
  private lastSeconds = 0;
  private seekFrom: number | null = null;
  private seekTimer: ReturnType<typeof setTimeout> | null = null;
  private startedFor = "";
  private mountedAt = 0;
  private readonly cleanup: Array<() => void> = [];

  constructor(private readonly report: (report: PlaybackReport) => void, private readonly now: () => number = Date.now) {
    const mark = () => { this.lastInputAt = this.now(); };
    (["pointerdown", "keydown", "touchstart"] as const).forEach((type) => {
      document.addEventListener(type, mark, true);
      this.cleanup.push(() => document.removeEventListener(type, mark, true));
    });
  }

  attach(media: HTMLMediaElement | null): void {
    if (media === this.media) {
      return;
    }
    this.detach();
    this.media = media;
    if (!media) {
      return;
    }
    this.mountedAt = this.now();
    this.lastSeconds = media.currentTime || 0;
    const on = (type: string, handler: () => void) => {
      media.addEventListener(type, handler);
      this.mediaCleanup.push(() => media.removeEventListener(type, handler));
    };
    on("play", () => this.onPlayPause("play"));
    on("pause", () => this.onPlayPause("pause"));
    on("seeking", () => this.onSeeking());
    on("seeked", () => this.onSeeked());
    on("timeupdate", () => { if (!media.seeking) this.lastSeconds = media.currentTime; });
  }

  private mediaCleanup: Array<() => void> = [];

  private detach(): void {
    this.mediaCleanup.forEach((fn) => fn());
    this.mediaCleanup = [];
    if (this.seekTimer) clearTimeout(this.seekTimer);
    this.seekTimer = null;
    this.seekFrom = null;
    this.media = null;
  }

  dispose(): void {
    this.detach();
    this.cleanup.forEach((fn) => fn());
  }

  private isLocal(): boolean {
    return this.now() - this.lastInputAt < intentWindowMs;
  }

  private emit(action: PlaybackAction, extra: Partial<PlaybackReport> = {}): void {
    const media = this.media;
    if (!media) return;
    const itemId = itemIdFromSource(media.currentSrc || media.src || "") || itemIdFromSource(window.location.href);
    this.report({ action, positionSeconds: media.currentTime || 0, itemId, itemName: pageTitle(), ...extra });
  }

  private onPlayPause(action: "play" | "pause"): void {
    const media = this.media;
    if (!media || media.seeking || this.seekTimer) return;
    if (action === "pause" && media.ended) return;
    const itemKey = itemIdFromSource(media.currentSrc || "") || media.currentSrc;
    if (action === "play" && this.startedFor !== itemKey && this.now() - this.mountedAt < startGuardMs * 5) {
      this.startedFor = itemKey;
      if (this.isLocal()) {
        this.emit("start");
      }
      return;
    }
    if (this.isLocal()) {
      this.emit(action);
    }
  }

  private onSeeking(): void {
    const media = this.media;
    if (!media) return;
    if (this.seekFrom === null) {
      this.seekFrom = this.lastSeconds;
    }
    if (this.seekTimer) clearTimeout(this.seekTimer);
    this.seekTimer = null;
  }

  private onSeeked(): void {
    const media = this.media;
    if (!media) return;
    if (this.seekTimer) clearTimeout(this.seekTimer);
    this.seekTimer = setTimeout(() => {
      this.seekTimer = null;
      const from = this.seekFrom;
      this.seekFrom = null;
      const to = media.currentTime;
      this.lastSeconds = to;
      if (from === null || Math.abs(to - from) < seekThresholdSeconds || !this.isLocal()) return;
      this.emit("seek", { fromSeconds: from });
    }, seekDebounceMs);
  }
}
