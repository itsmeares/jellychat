import { useEffect, useRef } from "react";
import type { MessageGroupModel, SyncPlayContext } from "../types";
import { emptyStateId, messagesId } from "../runtime/util";
import { MessageGroup } from "./MessageGroup";

type Props = {
  groups: MessageGroupModel[];
  syncPlay: SyncPlayContext;
};

export function MessageList({ groups, syncPlay }: Props) {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottom = useRef(true);

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) {
      return;
    }

    if (shouldStickToBottom.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [groups]);

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
      }}
    >
      <div
        id={emptyStateId}
        className="jellyChatEmptyState"
        style={{ display: groups.length > 0 ? "none" : "flex" }}
      >
        {syncPlay.inGroup ? "No messages yet." : "Join or create a SyncPlay group to send chat messages."}
      </div>
      {groups.map((group) => (
        <MessageGroup key={group.key} group={group} />
      ))}
    </div>
  );
}
