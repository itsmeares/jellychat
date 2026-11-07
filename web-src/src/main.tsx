import { createRoot } from "react-dom/client";
import { api, currentUserId, isSignedIn } from "./core/api";
import { PrefsStore } from "./core/prefs";
import { RoomStore } from "./core/room";
import { SyncLoop } from "./core/sync";
import { App } from "./ui/App";
import { ServicesContext } from "./ui/context";
import "./theme/jellychat.css";

declare global {
  interface Window {
    JellyChat?: { version: string; debug: () => Record<string, unknown> };
  }
}

function start(): void {
  if (window.JellyChat || !document.body) {
    return;
  }

  const prefs = new PrefsStore();
  const room = new RoomStore({ send: (event) => api.send(event), selfUserId: currentUserId });
  const loop = new SyncLoop({
    signedIn: isSignedIn,
    fetchSync: (query, signal) => api.sync(query, signal),
    onResponse: (response) => room.applySync(response),
    cursor: () => ({ afterSequence: room.getState().lastSequence, roomVersion: room.getState().roomVersion }),
    isHidden: () => document.hidden
  });

  let loadedFor = "";
  const watchSession = () => {
    const userId = isSignedIn() ? currentUserId() : "";
    if (userId === loadedFor) {
      return;
    }
    if (loadedFor) {
      prefs.reset();
      room.reset();
      loop.wake();
    }
    loadedFor = userId;
    if (userId) {
      void prefs.load();
    }
  };
  watchSession();
  setInterval(watchSession, 2000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loop.wake(); });
  window.addEventListener("pagehide", () => void prefs.flush());
  loop.start();

  window.JellyChat = {
    version: "3.0.0",
    debug: () => {
      const { room: info, lastSequence, roomVersion, items } = room.getState();
      return { signedIn: isSignedIn(), userId: currentUserId(), room: info, lastSequence, roomVersion, timelineItems: items.length, prefs: prefs.getState().resolved, serverConfig: prefs.getState().server };
    }
  };

  const host = document.createElement("div");
  host.id = "jellychat-root";
  document.body.appendChild(host);
  createRoot(host).render(
    <ServicesContext.Provider value={{ room, prefs }}>
      <App />
    </ServicesContext.Provider>
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
