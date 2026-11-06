import { ApiError } from "./api";
import type { SyncQuery } from "./api";
import type { SyncResponse } from "./types";

export type SyncDeps = {
  signedIn: () => boolean;
  fetchSync: (query: SyncQuery, signal: AbortSignal) => Promise<SyncResponse>;
  onResponse: (response: SyncResponse) => void;
  cursor: () => { afterSequence: number; roomVersion: string };
  isHidden: () => boolean;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  holdSeconds?: number;
};

export function backoffMs(error: unknown, failures: number): number {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return 15000;
    }
    if (error.status === 409) {
      return 5000;
    }
  }
  return Math.min(30000, 1000 * 2 ** Math.max(0, failures - 1));
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export class SyncLoop {
  private controller: AbortController | null = null;
  private running = false;
  private failures = 0;
  private first = true;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;

  constructor(private readonly deps: SyncDeps) {
    this.sleep = deps.sleep || defaultSleep;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    void this.run();
  }

  stop(): void {
    this.running = false;
    this.controller?.abort();
  }

  /** Cut the current wait short, for example when the tab becomes visible again. */
  wake(): void {
    this.controller?.abort();
  }

  private async run(): Promise<void> {
    while (this.running) {
      const controller = new AbortController();
      this.controller = controller;
      try {
        if (!this.deps.signedIn()) {
          this.first = true;
          await this.sleep(3000, controller.signal);
          continue;
        }
        if (this.deps.isHidden()) {
          await this.sleep(5000, controller.signal);
          continue;
        }
        const cursor = this.deps.cursor();
        const response = await this.deps.fetchSync(
          { afterSequence: cursor.afterSequence, roomVersion: cursor.roomVersion, waitSeconds: this.first ? 0 : this.deps.holdSeconds ?? 25 },
          controller.signal
        );
        this.first = false;
        this.failures = 0;
        this.deps.onResponse(response);
        if (!response.room.inGroup) {
          await this.sleep(2000, controller.signal);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          continue;
        }
        this.failures += 1;
        await this.sleep(backoffMs(error, this.failures), controller.signal);
      }
    }
  }
}
