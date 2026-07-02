import { useEffect, useRef } from "react";
import type { SyncPlayContext, TimelineItem, TypingRemoteUser } from "../types";
import { emptyStateId, messagesId } from "../runtime/util";
import { MessageGroup } from "./MessageGroup";
import { PlaybackTimelineRow } from "./PlaybackTimelineRow";

type Props = {
  timelineItems: TimelineItem[];
  syncPlay: SyncPlayContext;
  typingUsers: TypingRemoteUser[];
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

export function MessageList({ timelineItems, syncPlay, typingUsers }: Props) {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottom = useRef(true);

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
      <div
        id={emptyStateId}
        className="jellyChatEmptyState"
        style={{ display: timelineItems.length > 0 ? "none" : "flex" }}
      >
        {syncPlay.inGroup ? "No messages yet." : "Join or create a SyncPlay group to send chat messages."}
      </div>
      {timelineItems.map((item) => (
        item.kind === "messageGroup"
          ? <MessageGroup key={item.key} group={item.group} />
          : <PlaybackTimelineRow key={item.key} item={item} />
      ))}
      {typingUsers.length > 0 ? (
        <div className="jellyChatTypingIndicator" aria-live="polite">
          {typingText(typingUsers)}
        </div>
      ) : null}
    </div>
  );
}
