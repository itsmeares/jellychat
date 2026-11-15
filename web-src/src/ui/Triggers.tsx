import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { headerHost, syncPlayButton } from "../core/host";
import { Icon } from "./icons";

export type HeaderSlot = { slot: HTMLElement | null; hostClass: string };

// Jellyfin state classes like Mui-focusVisible belong to the SyncPlay button's own state.
function hostButtonClass(anchor: Element): string {
  return [...anchor.classList].filter((name) => !name.startsWith("Mui-")).join(" ");
}

export function useHeaderSlot(enabled: boolean): HeaderSlot {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [hostClass, setHostClass] = useState("");

  useEffect(() => {
    if (!enabled) {
      setSlot(null);
      return;
    }
    const element = document.createElement("span");
    element.id = "jellychat-header-slot";
    element.style.display = "contents";
    let frame = 0;
    const place = () => {
      frame = 0;
      const host = headerHost();
      if (!host) {
        if (element.isConnected) element.remove();
        return;
      }
      const anchor = host.querySelector(syncPlayButton);
      if (element.parentElement !== host || (anchor && element.nextElementSibling !== anchor)) {
        host.insertBefore(element, anchor || host.firstChild);
      }
      if (anchor) {
        element.style.color = getComputedStyle(anchor).color;
        setHostClass(hostButtonClass(anchor));
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    place();
    setSlot(element);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      element.remove();
      setSlot(null);
    };
  }, [enabled]);

  return { slot, hostClass };
}

// Jellyfin's header buttons use a 100 ms delayed tooltip under the button. This copies that behavior.
function useTooltip() {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hide = () => {
    clearTimeout(timer.current);
    setAt(null);
  };
  const show = (button: HTMLElement) => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const rect = button.getBoundingClientRect();
      setAt({ x: rect.left + rect.width / 2, y: rect.bottom });
    }, 100);
  };
  return { at, hide, show };
}

export function HeaderButton({ slot, hostClass, unread, open, idle, onClick }: HeaderSlot & { unread: number; open: boolean; idle?: boolean; onClick: () => void }) {
  const tip = useTooltip();
  if (!slot) return null;
  const label = idle ? "JellyChat. Join a SyncPlay group to chat." : unread ? `JellyChat, ${unread} new` : "JellyChat";
  return createPortal(
    <>
      <button
        className={`${hostClass} jc-hbtn`.trim()}
        data-idle={idle ? "1" : undefined}
        type="button"
        aria-label={label}
        aria-pressed={idle ? undefined : open}
        onMouseEnter={(event) => tip.show(event.currentTarget)}
        onMouseLeave={tip.hide}
        onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) tip.show(event.currentTarget); }}
        onBlur={tip.hide}
        onClick={() => { tip.hide(); onClick(); }}
      >
        <Icon name="chat" />
        {unread > 0 && <span className="jc-count">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {tip.at && createPortal(
        <div className="MuiTooltip-tooltip jc-tip" role="tooltip" aria-hidden="true" style={{ left: tip.at.x, top: tip.at.y }}>{idle ? label : "JellyChat (C)"}</div>,
        document.body
      )}
    </>,
    slot
  );
}

export function EdgeTab({ side, unread, onClick }: { side: "left" | "right"; unread: number; onClick: () => void }) {
  return (
    <button className="jc-edge" data-edge={side} type="button" aria-label={unread ? `Open chat, ${unread} new` : "Open chat"} onClick={onClick}>
      <Icon name="chat" />
      Chat
      {unread > 0 && <span className="jc-count">{unread > 9 ? "9+" : unread}</span>}
    </button>
  );
}
