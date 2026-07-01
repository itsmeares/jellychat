import { createRoot } from "react-dom/client";
import { ChatApp } from "./components/ChatApp";
import { initializeJellyChatDebug } from "./runtime/debug";
import { getActiveMountHost, updateLayout } from "./runtime/layout";
import { cleanupDuplicateRoots, countDebugNodes, recordError, rootId, waitForStylesheet } from "./runtime/util";
import { startRuntime } from "./runtime/store";
import "./styles.css";

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
  initializeJellyChatDebug();
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
