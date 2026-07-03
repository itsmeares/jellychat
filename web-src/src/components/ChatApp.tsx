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
    const updateTriggerMount = () => {
      setTriggerMount(resolveTriggerMount());
    };

    updateTriggerMount();
    const observer = typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => window.setTimeout(updateTriggerMount, 0))
      : null;
    observer?.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"]
    });

    window.addEventListener("resize", updateTriggerMount);
    window.addEventListener("hashchange", updateTriggerMount);
    window.addEventListener("popstate", updateTriggerMount);
    window.addEventListener("jellychat-routechange", updateTriggerMount);
    document.addEventListener("fullscreenchange", updateTriggerMount);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateTriggerMount);
      window.removeEventListener("hashchange", updateTriggerMount);
      window.removeEventListener("popstate", updateTriggerMount);
      window.removeEventListener("jellychat-routechange", updateTriggerMount);
      document.removeEventListener("fullscreenchange", updateTriggerMount);
    };
  }, []);

  const triggerHost = triggerMount.hostFound && triggerMount.host && triggerMount.host.isConnected
    ? triggerMount.host
    : null;

  return (
    <>
      {triggerHost ? createPortal(
        <ChatButton
          isOpen={state.drawerOpen}
          actions={actions}
          mode={triggerMount.mode}
          indicator={state.triggerIndicator}
        />,
        triggerHost
      ) : null}
      <ReactionOverlay />
      <ChatDrawer state={state} actions={actions} />
    </>
  );
}
