import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { buttonId, markerClass } from "../runtime/util";
import { rememberTriggerFocus } from "../runtime/trigger";
import type { ChatActions, TriggerIndicatorState, TriggerMode } from "../types";

type Props = {
  isOpen: boolean;
  actions: ChatActions;
  mode: TriggerMode;
  indicator: TriggerIndicatorState;
  nativeButtonClassName: string;
};

function prefersReducedMotion(): boolean {
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

export function ChatButton({ isOpen, actions, mode, indicator, nativeButtonClassName }: Props) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [activityStep, setActivityStep] = useState(0);
  const activityVisible = indicator.playbackActivityIndicatorActive && !indicator.unreadChatIndicatorActive;
  const triggerClass = mode === "desktop-overlay-fallback" ? " is-desktop-overlay-trigger" : (mode === "native-missing" ? " is-native-missing" : " is-native-trigger");
  const legacyNativeClass = !nativeButtonClassName && (mode === "native-header" || mode === "native-video-osd") ? " paper-icon-button-light headerButton headerButtonRight" : "";

  useLayoutEffect(() => {
    const button = buttonRef.current;
    const parent = button?.parentElement;
    if (mode === "native-header" && button && parent && parent.firstElementChild !== button) {
      parent.prepend(button);
    }
  }, [mode]);

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
  const label = isOpen
    ? "Close JellyChat"
    : indicator.unreadChatIndicatorActive
      ? "Open JellyChat, unread messages"
      : "Open JellyChat";

  return (
    <button
      ref={buttonRef}
      id={buttonId}
      type="button"
      className={(nativeButtonClassName || "emby-button") + " " + markerClass + triggerClass + legacyNativeClass + (isOpen ? " is-open" : "") + (indicator.unreadChatIndicatorActive ? " has-unread" : "")}
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
      {activityVisible ? <span className="jellyChatActivityDots" aria-hidden="true">{activityText}</span> : null}
    </button>
  );
}
