import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../core/types";
import { EmojiPicker } from "./EmojiPicker";
import { Icon } from "./icons";
import { useServices } from "./context";
import { useStore } from "./hooks";

type Props = {
  reply: ChatMessage | null;
  onClearReply: () => void;
  onSend: (text: string) => void;
  onReact: (emoji: string) => void;
  autoFocus?: boolean;
  compact?: boolean;
};

export function Composer({ reply, onClearReply, onSend, onReact, autoFocus, compact }: Props) {
  const { room, prefs } = useServices();
  const user = useStore(prefs).user;
  const [text, setText] = useState("");
  const [picker, setPicker] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (reply) input.current?.focus();
  }, [reply]);

  const submit = () => {
    if (!text.trim()) return;
    onSend(text);
    setText("");
    setPicker(false);
  };

  const insert = (emoji: string) => {
    prefs.recordRecent(emoji);
    setText((value) => value + emoji);
    input.current?.focus();
  };

  const toggleFavorite = (emoji: string) => {
    const has = user.favorites.includes(emoji);
    prefs.updateUser({ favorites: has ? user.favorites.filter((item) => item !== emoji) : [emoji, ...user.favorites].slice(0, 40) });
  };

  return (
    <div className="jc-comp">
      {!compact && (
        <div className="jc-qr" role="group" aria-label="Quick reactions">
          {user.quick.map((emoji) => (
            <button key={emoji} type="button" onClick={() => { onReact(emoji); prefs.recordRecent(emoji); }} aria-label={"React " + emoji}>{emoji}</button>
          ))}
        </div>
      )}
      {reply && (
        <div className="jc-chip">
          <span>Replying to <b>{reply.userName}</b>: {reply.text}</span>
          <button className="jc-ib" type="button" aria-label="Cancel reply" onClick={onClearReply}><Icon name="x" /></button>
        </div>
      )}
      {picker && (
        <div className="jc-pop">
          <div className="row" role="group" aria-label="Send as reaction">
            {user.quick.map((emoji) => (
              <button key={emoji} type="button" onClick={() => onReact(emoji)} aria-label={"React " + emoji}>{emoji}</button>
            ))}
          </div>
          <EmojiPicker recent={user.recent} favorites={user.favorites} onPick={insert} onToggleFavorite={toggleFavorite} autoFocus />
        </div>
      )}
      <div className="jc-bar">
        <div className="jc-inp">
          <button className="jc-ib" type="button" aria-label="Emoji" aria-pressed={picker} onClick={() => setPicker((open) => !open)}><Icon name="smile" /></button>
          <input
            ref={input}
            value={text}
            maxLength={500}
            placeholder="Message the room"
            aria-label="Message"
            enterKeyHint="send"
            onChange={(event) => { setText(event.target.value); if (event.target.value) room.notifyTyping(); }}
            onBlur={() => room.stopTyping()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
              if (event.key === "Escape") { if (picker) setPicker(false); else if (reply) onClearReply(); }
            }}
            onKeyUp={(event) => event.stopPropagation()}
          />
        </div>
        <button className="jc-go" type="button" aria-label="Send" aria-disabled={!text.trim()} onClick={submit}><Icon name="send" /></button>
      </div>
    </div>
  );
}
