import { createRoot } from "react-dom/client";
import { ChatApp } from "./components/ChatApp";
import { getActiveMountHost, updateLayout } from "./runtime/layout";
import { cleanupDuplicateRoots, countDebugNodes, recordError, rootId, waitForStylesheet } from "./runtime/util";
import { startRuntime } from "./runtime/store";
import "./styles.css";

function initializeDebug(): void {
  window.JellyChatDebug = {
    ...(window.JellyChatDebug || {}),
    loaded: true,
    frontend: "react",
    mounted: false,
    reactMounted: false,
    mountCount: 0,
    rootCount: 0,
    buttonCount: 0,
    listenerCount: 0,
    intervalCount: 0,
    currentGroupId: "",
    apiMode: "events",
    lastSequence: 0,
    eventCount: 0,
    supportedEventTypes: ["chat.message", "reaction.emoji", "playback.play", "playback.pause", "playback.seek", "system.notice"],
    lastEventPollAt: null,
    lastEventPostAt: null,
    inputFocused: false,
    submitCount: 0,
    keydownListenerCount: 0,
    composerMountCount: 0,
    lastFocusReason: "",
    messageCount: 0,
    groupCount: 0,
    groupingWindowMs: 5 * 60 * 1000,
    lastGroupedAt: null,
    layoutMode: "normal-docked",
    isVideoRoute: false,
    isFullscreen: false,
    drawerOpen: false,
    triggerPlacement: "normal",
    drawerWidth: 340,
    fullscreenPlayerSurfaceSelector: "",
    fullscreenPlayerSurfaceTag: "",
    fullscreenPlayerSurfaceId: "",
    fullscreenPlayerSurfaceClass: "",
    videoReservedWidth: 0,
    videoElementFound: false,
    controlsElementFound: false,
    videoParentChain: "",
    controlsParentChain: "",
    lastLayoutUpdateAt: null,
    lastFullscreenLayoutAt: null,
    fullscreenElementTag: "",
    fullscreenHostTag: "",
    fullscreenHostId: "",
    fullscreenHostClass: "",
    rootParentTag: "",
    rootParentClass: "",
    rootMoveCount: 0,
    lastFullscreenChangeAt: null,
    controlsOverlapAvoided: false,
    lastError: null
  };
}

async function start(): Promise<void> {
  if (!document.body) {
    return;
  }

  if (window.__JELLYCHAT_LOADED__ === true) {
    if (window.console && typeof window.console.info === "function") {
      window.console.info("[JellyChat] duplicate script ignored");
    }
    return;
  }

  window.__JELLYCHAT_LOADED__ = true;
  initializeDebug();
  await waitForStylesheet();

  const activeHost = getActiveMountHost();
  let rootElement = cleanupDuplicateRoots(activeHost) || document.getElementById(rootId);
  if (!rootElement) {
    rootElement = document.createElement("div");
    rootElement.id = rootId;
    rootElement.setAttribute("data-jellychat-root", "true");
    activeHost.appendChild(rootElement);
  }

  const root = createRoot(rootElement);
  root.render(<ChatApp />);
  if (window.JellyChatDebug) {
    window.JellyChatDebug.mounted = true;
    window.JellyChatDebug.reactMounted = true;
    window.JellyChatDebug.mountCount = 1;
    window.JellyChatDebug.rootCount = 1;
  }
  countDebugNodes();
  updateLayout("react-mount");
  startRuntime();
}

function boot(): void {
  start().catch((error) => {
    recordError(error);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
