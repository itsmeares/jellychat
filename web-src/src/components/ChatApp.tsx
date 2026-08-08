import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChatDrawer } from "./ChatDrawer";
import { ChatButton } from "./ChatButton";
import { ReactionOverlay } from "./ReactionOverlay";
import { actions, getState, subscribe } from "../runtime/store";
import { resolveTriggerMount, type TriggerMount } from "../runtime/trigger";

export function ChatApp() {
  const [state, setState] = useState(getState);
  const [triggerMount, setTriggerMount] = useState<TriggerMount>(() => ({
    host: null,
    mode: "native-missing",
    hostFound: false,
    selector: ""
  }));

  useEffect(() => subscribe(setState), []);

  useEffect(() => {
    if (window.JellyChatDebug) {
      window.JellyChatDebug.reactMounted = true;
    }
  }, []);

  useEffect(() => {
    let triggerUpdateTimer = 0;
    const updateTriggerMount = (reason: string) => {
      if (window.JellyChatDebug) {
        window.JellyChatDebug.triggerObserverLastReason = reason;
        window.JellyChatDebug.triggerObserverLastUpdateAt = new Date().toISOString();
        window.JellyChatDebug.triggerObserverUpdateCount = Number(window.JellyChatDebug.triggerObserverUpdateCount || 0) + 1;
      }
      setTriggerMount(resolveTriggerMount());
    };
    const scheduleTriggerMount = (reason: string) => {
      if (triggerUpdateTimer) {
        window.clearTimeout(triggerUpdateTimer);
      }
      triggerUpdateTimer = window.setTimeout(() => {
        triggerUpdateTimer = 0;
        updateTriggerMount(reason);
      }, 80);
    };

    updateTriggerMount("mount");
    const observer = typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => scheduleTriggerMount("mutation"))
      : null;
    observer?.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"]
    });

    const resizeHandler = () => scheduleTriggerMount("resize");
    const hashHandler = () => scheduleTriggerMount("hashchange");
    const popstateHandler = () => scheduleTriggerMount("popstate");
    const routeHandler = () => scheduleTriggerMount("routechange");
    const fullscreenHandler = () => scheduleTriggerMount("fullscreenchange");
    const visualViewportResizeHandler = () => scheduleTriggerMount("visualViewport.resize");
    const visualViewportScrollHandler = () => scheduleTriggerMount("visualViewport.scroll");

    window.addEventListener("resize", resizeHandler);
    window.addEventListener("hashchange", hashHandler);
    window.addEventListener("popstate", popstateHandler);
    window.addEventListener("jellychat-routechange", routeHandler);
    document.addEventListener("fullscreenchange", fullscreenHandler);
    window.visualViewport?.addEventListener("resize", visualViewportResizeHandler);
    window.visualViewport?.addEventListener("scroll", visualViewportScrollHandler);
    return () => {
      if (triggerUpdateTimer) {
        window.clearTimeout(triggerUpdateTimer);
      }
      observer?.disconnect();
      window.removeEventListener("resize", resizeHandler);
      window.removeEventListener("hashchange", hashHandler);
      window.removeEventListener("popstate", popstateHandler);
      window.removeEventListener("jellychat-routechange", routeHandler);
      document.removeEventListener("fullscreenchange", fullscreenHandler);
      window.visualViewport?.removeEventListener("resize", visualViewportResizeHandler);
      window.visualViewport?.removeEventListener("scroll", visualViewportScrollHandler);
    };
  }, []);

  const triggerHost = triggerMount.hostFound && triggerMount.host && triggerMount.host.isConnected
    ? triggerMount.host
    : null;
  const nativeButtonClassName = triggerHost
    ?.querySelector<HTMLElement>(":scope > .MuiIconButton-root:not([data-jellychat-button])")
    ?.className || "";

  return (
    <>
      {triggerHost ? createPortal(
        <ChatButton
          isOpen={state.drawerOpen}
          actions={actions}
          mode={triggerMount.mode}
          indicator={state.triggerIndicator}
          nativeButtonClassName={nativeButtonClassName}
        />,
        triggerHost
      ) : null}
      <ReactionOverlay />
      <ChatDrawer state={state} actions={actions} />
    </>
  );
}
