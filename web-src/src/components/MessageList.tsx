import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ChatActions, MessageActionMenuState, SyncPlayContext, TimelineItem, TypingRemoteUser } from "../types";
import { emptyStateId, messagesId } from "../runtime/util";
import { MessageGroup } from "./MessageGroup";
import { PlaybackTimelineRow } from "./PlaybackTimelineRow";

type Props = {
  timelineItems: TimelineItem[];
  syncPlay: SyncPlayContext;
  statusText: string;
  statusActive: boolean;
  typingUsers: TypingRemoteUser[];
  actions: ChatActions;
  messageActionMenu: MessageActionMenuState;
  highlightedMessageId: string | null;
};

function typingText(users: TypingRemoteUser[]): string {
  if (users.length === 1) {
    return users[0].userName + " is typing...";
  }

  if (users.length === 2) {
    return users[0].userName + " and " + users[1].userName + " are typing...";
  }

  return "Several people are typing...";
}

function getMessageIds(timelineItems: TimelineItem[]): Set<string> {
  const ids = new Set<string>();
  timelineItems.forEach((item) => {
    if (item.kind !== "messageGroup") {
      return;
    }

    item.group.messages.forEach((message) => ids.add(message.id));
  });
  return ids;
}

function MessageActionMenu({ menu, actions }: { menu: MessageActionMenuState; actions: ChatActions }) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu.open) {
      return;
    }

    const focusTarget = window.setTimeout(() => {
      menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    }, 0);

    function closeOnOutsideClick(event: Event) {
      const target = event.target as Node | null;
      if (target && menuRef.current?.contains(target)) {
        return;
      }

      actions.closeMessageActionMenu("outside-click");
    }

    document.addEventListener("pointerdown", closeOnOutsideClick as EventListener);
    return () => {
      window.clearTimeout(focusTarget);
      document.removeEventListener("pointerdown", closeOnOutsideClick as EventListener);
    };
  }, [actions, menu.open]);

  const menuContent = (
    <>
      {menu.open && menu.message ? (
        <div
          ref={menuRef}
          className="jellyChatMessageActionMenu"
          role="menu"
          aria-label="Message actions"
          style={{ left: menu.x, top: menu.y }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              actions.closeMessageActionMenu("escape");
            }
          }}
        >
          <button type="button" role="menuitem" onClick={() => actions.startReply(menu.message!)}>
            Reply
          </button>
          <button type="button" role="menuitem" onClick={() => void actions.copyMessage(menu.message!)}>
            Copy
          </button>
        </div>
      ) : null}
      {menu.feedback ? (
        <div className="jellyChatCopyFeedback" role="status" aria-live="polite">
          {menu.feedback}
        </div>
      ) : null}
    </>
  );

  const portalHost = (document.fullscreenElement || document.body) as Element | null;
  return portalHost ? createPortal(menuContent, portalHost) : menuContent;
}

export function MessageList({ timelineItems, syncPlay, statusText, statusActive, typingUsers, actions, messageActionMenu, highlightedMessageId }: Props) {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottom = useRef(true);
  const originalMessageIds = getMessageIds(timelineItems);

  useEffect(() => {
    if (window.JellyChatDebug) {
      window.JellyChatDebug.timelineContainerRemountCount = Number(window.JellyChatDebug.timelineContainerRemountCount || 0) + 1;
    }
  }, []);

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) {
      return;
    }

    if (shouldStickToBottom.current) {
      node.scrollTop = node.scrollHeight;
      if (window.JellyChatDebug) {
        window.JellyChatDebug.timelinePinnedToBottom = true;
        window.JellyChatDebug.lastScrollPreservedAt = new Date().toISOString();
        window.JellyChatDebug.lastAutoScrollReason = "pinned-to-bottom";
      }
    }
  }, [timelineItems, typingUsers]);

  return (
    <div
      id={messagesId}
      ref={messagesRef}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      onScroll={(event) => {
        const node = event.currentTarget;
        shouldStickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
        if (window.JellyChatDebug) {
          window.JellyChatDebug.timelinePinnedToBottom = shouldStickToBottom.current;
        }
      }}
    >
      <div className={statusActive ? "jellyChatInlineStatus is-active" : "jellyChatInlineStatus"} role="status" aria-live="polite">
        {statusText}
      </div>
      <div
        id={emptyStateId}
        className="jellyChatEmptyState"
        style={{ display: timelineItems.length > 0 ? "none" : "flex" }}
      >
        {syncPlay.inGroup ? "No messages yet. Start the chat when you are ready." : "Join a SyncPlay group to chat here."}
      </div>
      {timelineItems.map((item) => (
        item.kind === "messageGroup"
          ? <MessageGroup key={item.key} group={item.group} actions={actions} originalMessageIds={originalMessageIds} highlightedMessageId={highlightedMessageId} />
          : <PlaybackTimelineRow key={item.key} item={item} />
      ))}
      {typingUsers.length > 0 ? (
        <div className="jellyChatTypingIndicator" aria-live="polite">
          {typingText(typingUsers)}
        </div>
      ) : null}
      <MessageActionMenu menu={messageActionMenu} actions={actions} />
    </div>
  );
}
