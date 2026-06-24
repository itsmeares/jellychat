import { useEffect, useRef } from "react";
import type { SyncPlayContext, TimelineItem } from "../types";
import { emptyStateId, messagesId } from "../runtime/util";
import { MessageGroup } from "./MessageGroup";
import { PlaybackTimelineRow } from "./PlaybackTimelineRow";

type Props = {
  timelineItems: TimelineItem[];
  syncPlay: SyncPlayContext;
};

export function MessageList({ timelineItems, syncPlay }: Props) {
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
  }, [timelineItems]);

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
    </div>
  );
}
