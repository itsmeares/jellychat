import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { headerHost } from "../core/host";
import { Icon } from "./icons";

export function useHeaderSlot(enabled: boolean): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

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
      const anchor = host.querySelector('button[aria-label="SyncPlay"]');
      if (element.parentElement !== host || (anchor && element.nextElementSibling !== anchor)) {
        host.insertBefore(element, anchor || host.firstChild);
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

  return slot;
}

export function HeaderButton({ slot, unread, open, onClick }: { slot: HTMLElement | null; unread: number; open: boolean; onClick: () => void }) {
  if (!slot) return null;
  return createPortal(
    <button className="jc-hbtn" type="button" aria-label={unread ? `JellyChat, ${unread} new` : "JellyChat"} aria-pressed={open} title="JellyChat (C)" onClick={onClick}>
      <Icon name="chat" />
      {unread > 0 && <span className="jc-count">{unread > 9 ? "9+" : unread}</span>}
    </button>,
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
