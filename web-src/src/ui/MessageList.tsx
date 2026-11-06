import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage, TimelineItem } from "../core/types";
import { Avatar } from "./Avatar";
import { clock, ticksToClock } from "./format";
import { Icon } from "./icons";
import { useServices } from "./context";
import { useStore } from "./hooks";

type Props = {
  items: TimelineItem[];
  typing: string[];
  onReply: (message: ChatMessage) => void;
  onRetry: (key: string) => void;
};

const playbackIcon = { start: "play", play: "play", pause: "pause", seek: "seek" } as const;

function playbackText(item: Extract<TimelineItem, { kind: "playback" }>): string {
  const { notice } = item;
  const name = notice.userName;
  if (notice.action === "pause") return `${name} paused at ${ticksToClock(notice.toTicks)}`;
  if (notice.action === "seek") return `${name} jumped to ${ticksToClock(notice.toTicks)}`;
  if (notice.action === "start") return `${name} started ${notice.itemName || "playback"}`;
  return `${name} resumed at ${ticksToClock(notice.toTicks)}`;
}

export function typingLabel(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return "Several people are typing";
}

export function MessageList({ items, typing, onReply, onRetry }: Props) {
  const { prefs } = useServices();
  const { messageSide, messageStyle } = useStore(prefs).resolved;
  const mineRight = messageSide === "right" && messageStyle === "bubbles";
  const logRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [unseen, setUnseen] = useState(0);
  const [highlight, setHighlight] = useState("");
  const lastCount = useRef(0);

  const messageCount = items.reduce((total, item) => total + (item.kind === "group" ? item.messages.length : 1), 0);

  useLayoutEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const added = messageCount - lastCount.current;
    lastCount.current = messageCount;
    if (stick.current) {
      log.scrollTop = log.scrollHeight;
      setUnseen(0);
    } else if (added > 0) {
      setUnseen((count) => count + added);
    }
  }, [messageCount, items]);

  const onScroll = useCallback(() => {
    const log = logRef.current;
    if (!log) return;
    stick.current = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
    if (stick.current) setUnseen(0);
  }, []);

  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(""), 1600);
    return () => clearTimeout(timer);
  }, [highlight]);

  const jumpTo = (eventId: string) => {
    const target = logRef.current?.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(eventId)}"]`);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlight(eventId);
  };

  const scrollDown = () => {
    const log = logRef.current;
    if (log) log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
  };

  return (
    <div className="jc-body">
      <div className="jc-log" ref={logRef} onScroll={onScroll} role="log" aria-live="polite" aria-label="Chat messages">
        {items.length === 0 && <div className="jc-empty">No messages yet. Say hi to the room.</div>}
        {items.map((item) =>
          item.kind === "playback" ? (
            <div className="jc-sys" key={item.key}>
              <Icon name={playbackIcon[item.notice.action]} />
              {playbackText(item)}
            </div>
          ) : (
            <div className={"jc-g" + (item.mine ? " mine" : "") + (item.mine && mineRight ? " r" : "")} key={item.key} data-mine={item.mine ? "1" : "0"}>
              <Avatar name={item.userName} small />
              <div className="jc-gb">
                <div className="jc-gh">
                  <b>{item.mine ? "You" : item.userName}</b>
                  <time>{clock(item.createdAt)}</time>
                </div>
                {item.messages.map((message, index) => (
                  <div
                    key={message.key}
                    className={"jc-m" + (index === 0 ? " first" : "") + (index === item.messages.length - 1 ? " last" : "") + (highlight && highlight === message.id ? " hl" : "")}
                    data-event-id={message.id}
                    data-status={message.status}
                  >
                    {message.replyTo && (
                      <button className="jc-quote" type="button" onClick={() => jumpTo(message.replyTo!.eventId)}>
                        <b>{message.replyTo.userName}</b>
                        {message.replyTo.messagePreview}
                      </button>
                    )}
                    <p>{message.text}</p>
                    {message.status === "failed" && (
                      <button className="jc-fail" type="button" onClick={() => onRetry(message.key)}>
                        Not sent. Tap to retry
                      </button>
                    )}
                    {message.status === "sent" && (
                      <div className="jc-tb">
                        <button type="button" aria-label="Reply" title="Reply" onClick={() => onReply(message)}>
                          <Icon name="reply" />
                        </button>
                        <button type="button" aria-label="Copy" title="Copy" onClick={() => void navigator.clipboard?.writeText(message.text)}>
                          <Icon name="copy" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
      {unseen > 0 && (
        <button className="jc-jump" type="button" onClick={scrollDown}>
          <Icon name="down" />
          {unseen} new
        </button>
      )}
      <div className={"jc-typing" + (typing.length ? " on" : "")} aria-live="polite">
        {typing.length > 0 && (
          <>
            <span className="jc-dots"><i /><i /><i /></span>
            {typingLabel(typing)}
          </>
        )}
      </div>
    </div>
  );
}
