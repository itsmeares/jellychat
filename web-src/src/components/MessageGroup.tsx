import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { ChatActions, ChatMessage, MessageGroupModel } from "../types";
import { resolveJellyfinUrl } from "../runtime/urls";
import { formatClockTime, formatFullTimestamp } from "../runtime/util";

type Props = {
  group: MessageGroupModel;
  actions: ChatActions;
  originalMessageIds: Set<string>;
  highlightedMessageId: string | null;
};

function findMessageElement(messageId: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-jellychat-message-id]"));
  return nodes.find((node) => node.dataset.jellychatMessageId === messageId) || null;
}

function MessageQuote({ message, actions, originalMessageIds }: {
  message: ChatMessage;
  actions: ChatActions;
  originalMessageIds: Set<string>;
}) {
  if (!message.replyTo) {
    return null;
  }

  const targetAvailable = originalMessageIds.has(message.replyTo.eventId);
  const label = targetAvailable
    ? message.replyTo.userName + ": " + message.replyTo.messagePreview
    : "Original message unavailable";

  function jumpToOriginal() {
    if (!message.replyTo || !targetAvailable) {
      return;
    }

    const target = findMessageElement(message.replyTo.eventId);
    if (!target) {
      return;
    }

    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
    actions.highlightMessage(message.replyTo.eventId);
  }

  return (
    <button
      type="button"
      className="jellyChatReplyQuote"
      disabled={!targetAvailable}
      aria-label={targetAvailable ? "Jump to replied message, " + label : label}
      title={targetAvailable ? "Jump to original message" : label}
      onClick={jumpToOriginal}
    >
      {targetAvailable ? (
        <>
          <span className="jellyChatReplyQuoteAuthor">{message.replyTo.userName}</span>
          <span className="jellyChatReplyQuotePreview">{message.replyTo.messagePreview}</span>
        </>
      ) : (
        <span className="jellyChatReplyQuotePreview">{label}</span>
      )}
    </button>
  );
}

export function MessageGroup({ group, actions, originalMessageIds, highlightedMessageId }: Props) {
  const longPressTimer = useRef<number>(0);
  const longPressStart = useRef<{ x: number; y: number; message: ChatMessage } | null>(null);
  const profileImageUrl = resolveJellyfinUrl("UserImage?userId=" + encodeURIComponent(group.messages[0]?.userId || "") + "&format=jpg", false);
  const fallbackInitial = group.userName.trim().charAt(0).toUpperCase() || "?";

  function clearLongPress() {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = 0;
    }
    longPressStart.current = null;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>, message: ChatMessage) {
    if (message.optimistic || event.pointerType !== "touch") {
      return;
    }

    longPressStart.current = { x: event.clientX, y: event.clientY, message };
    longPressTimer.current = window.setTimeout(() => {
      const start = longPressStart.current;
      if (!start) {
        return;
      }

      actions.openMessageActionMenu(start.message, start.x, start.y);
      clearLongPress();
    }, 520);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = longPressStart.current;
    if (!start) {
      return;
    }

    if (Math.abs(event.clientX - start.x) > 10 || Math.abs(event.clientY - start.y) > 10) {
      clearLongPress();
    }
  }

  return (
    <div className="jellyChatMessageGroup" data-jellychat-group-key={group.key}>
      {group.messages.map((message, index) => (
        <div
          key={message.eventKey}
          className={[
            "jellyChatMessage",
            index > 0 ? "is-continuation" : "",
            highlightedMessageId === message.id ? "is-highlighted" : "",
            message.optimistic ? "is-optimistic" : ""
          ].filter(Boolean).join(" ")}
          data-jellychat-message-key={message.eventKey}
          data-jellychat-message-id={message.id}
          onContextMenu={(event) => {
            if (message.optimistic) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            actions.openMessageActionMenu(message, event.clientX, event.clientY);
          }}
          onPointerDown={(event) => onPointerDown(event, message)}
          onPointerMove={onPointerMove}
          onPointerUp={clearLongPress}
          onPointerCancel={clearLongPress}
        >
          <div className="jellyChatMessageGutter">
            {index === 0 ? (
              <span className="jellyChatMessageAvatar" aria-hidden="true">
                <span>{fallbackInitial}</span>
                <img src={profileImageUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />
              </span>
            ) : (
              <time className="jellyChatContinuationTime" dateTime={message.createdAtUtc} title={formatFullTimestamp(message)}>
                {formatClockTime(message)}
              </time>
            )}
          </div>
          <div className="jellyChatMessageContent">
            {index === 0 ? (
              <div className="jellyChatMessageMeta">
                <span className="jellyChatMessageAuthor">{group.userName}</span>
                <time dateTime={message.createdAtUtc} title={formatFullTimestamp(message)}>{formatClockTime(message)}</time>
              </div>
            ) : null}
            <button
              type="button"
              className="jellyChatMessageReplyButton"
              title="Reply to message"
              aria-label="Reply to message"
              disabled={message.optimistic}
              onClick={() => actions.startReply(message)}
            >
              ↩
            </button>
            <MessageQuote message={message} actions={actions} originalMessageIds={originalMessageIds} />
            <div className="jellyChatMessageBody">{message.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
