import { useState } from "react";
import { api } from "../core/api";
import type { ChatMessage, RoomInfo } from "../core/types";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { Icon } from "./icons";
import { MessageList } from "./MessageList";
import { Settings } from "./Settings";
import { useServices } from "./context";
import { useStore } from "./hooks";

type Props = {
  onClose: () => void;
  onHide?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
};

function LockedRoom({ onUnlocked }: { onUnlocked: (room: RoomInfo) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async () => {
    try {
      onUnlocked(await api.unlock(password));
    } catch {
      setError("That password is not right.");
    }
  };
  return (
    <div className="jc-locked">
      <p>This room is protected. Enter the password to read and write.</p>
      <div className="jc-pwd">
        <input type="password" value={password} aria-label="Room password" placeholder="Password" autoComplete="off" onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") void submit(); }} onKeyUp={(event) => event.stopPropagation()} />
        <button className="jc-btn pri" type="button" onClick={() => void submit()}>Unlock</button>
      </div>
      {error && <p className="jc-err">{error}</p>}
    </div>
  );
}

export function Panel({ onClose, onHide, autoFocus, compact }: Props) {
  const { room: store } = useServices();
  const state = useStore(store);
  const [view, setView] = useState<"chat" | "settings">("chat");
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const room = state.room;
  const names = room?.participants || [];

  if (!room) return null;

  return (
    <>
      <div className="jc-head">
        {view === "settings" ? (
          <button className="jc-ib" type="button" aria-label="Back to chat" onClick={() => setView("chat")}><Icon name="back" /></button>
        ) : (
          <div className="jc-stack">{names.slice(0, 3).map((name) => <Avatar key={name} name={name} />)}</div>
        )}
        <div className="t">
          <b>{view === "settings" ? "Settings" : room.groupName || "Watch party"}</b>
          {view === "chat" && <span>{names.length} watching{room.passwordProtected ? ", password protected" : ""}</span>}
        </div>
        {view === "chat" && <button className="jc-ib" type="button" aria-label="Settings" onClick={() => setView("settings")}><Icon name="gear" /></button>}
        {onHide && <button className="jc-ib" type="button" aria-label="Hide chat" title="Hide chat" onClick={onHide}><Icon name="chevron" /></button>}
        <button className="jc-ib" type="button" aria-label="Close chat" onClick={onClose}><Icon name="x" /></button>
      </div>
      {room.passwordProtected && !room.authorized ? (
        <LockedRoom onUnlocked={(next) => store.setRoom(next)} />
      ) : view === "settings" ? (
        <Settings room={room} onRoom={(next) => store.setRoom(next)} />
      ) : (
        <>
          <MessageList items={state.items} typing={state.typing} onReply={setReply} onRetry={(key) => void store.retry(key)} />
          <Composer
            reply={reply}
            compact={compact}
            autoFocus={autoFocus}
            onClearReply={() => setReply(null)}
            onSend={(text) => { void store.sendMessage(text, reply); setReply(null); }}
            onReact={(emoji) => void store.sendReaction(emoji)}
          />
        </>
      )}
    </>
  );
}
