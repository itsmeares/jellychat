import { useEffect, useState } from "react";
import { buttonId, markerClass } from "../runtime/util";
import { rememberTriggerFocus } from "../runtime/trigger";
import type { ChatActions, TriggerIndicatorState, TriggerMode } from "../types";

type Props = {
  isOpen: boolean;
  actions: ChatActions;
  mode: TriggerMode;
  indicator: TriggerIndicatorState;
};

function prefersReducedMotion(): boolean {
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

export function ChatButton({ isOpen, actions, mode, indicator }: Props) {
  const [activityStep, setActivityStep] = useState(0);
  const activityVisible = indicator.playbackActivityIndicatorActive && !indicator.unreadChatIndicatorActive;
  const nativeMounted = mode !== "floating-fallback";

  useEffect(() => {
    if (!activityVisible || prefersReducedMotion()) {
      setActivityStep(0);
      return;
    }

    let active = true;
    let timeout = 0;
    const scheduleNextStep = () => {
      timeout = window.setTimeout(() => {
        if (!active) {
          return;
        }

        setActivityStep((step) => (step + 1) % 3);
        scheduleNextStep();
      }, 520);
    };

    scheduleNextStep();
    return () => {
      active = false;
      if (timeout) {
        window.clearTimeout(timeout);
      }
    };
  }, [activityVisible]);

  const activityText = prefersReducedMotion() ? "..." : ".".repeat(activityStep + 1);
  const label = isOpen ? "Close JellyChat" : "Open JellyChat";

  return (
    <button
      id={buttonId}
      type="button"
      className={"emby-button " + markerClass + (nativeMounted ? " is-native-trigger" : " is-floating-trigger") + (isOpen ? " is-open" : "")}
      data-jellychat-button="true"
      data-jellychat-trigger="true"
      data-jellychat-trigger-mode={mode}
      aria-label={label}
      aria-controls="jellyChatDrawer"
      aria-expanded={isOpen ? "true" : "false"}
      title={label}
      onClick={(event) => {
        rememberTriggerFocus(event.currentTarget);
        actions.toggleDrawer();
      }}
    >
      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M4 4h16v11H8l-4 4V4z" />
      </svg>
      {indicator.unreadChatIndicatorActive ? <span className="jellyChatUnreadDot" aria-hidden="true" /> : null}
      {activityVisible ? <span className="jellyChatActivityDots" aria-hidden="true">{activityText}</span> : null}
    </button>
  );
}
