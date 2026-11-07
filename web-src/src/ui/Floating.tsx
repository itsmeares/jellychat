import { useState } from "react";
import type { Side } from "../core/types";
import { Avatar } from "./Avatar";
import { Icon } from "./icons";
import { Panel } from "./Panel";
import { useServices } from "./context";

export type FloatMode = "quiet" | "toast" | "peek" | "open";

type Props = {
  mode: FloatMode;
  side: Side;
  visible: boolean;
  unread: number;
  latest: { name: string; text: string; recent: Array<{ name: string; text: string }> } | null;
  onOpen: () => void;
  onClose: () => void;
  onActivity: () => void;
};

function PeekReply({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (text.trim()) { onSend(text); setText(""); }
  };
  return (
    <div className="jc-bar">
      <div className="jc-inp" style={{ height: 36, paddingLeft: 14 }}>
        <input value={text} placeholder="Reply" aria-label="Reply" onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") submit(); }} onKeyUp={(event) => event.stopPropagation()} />
      </div>
      <button className="jc-go" style={{ width: 36, height: 36 }} type="button" aria-label="Send" aria-disabled={!text.trim()} onClick={submit}><Icon name="send" /></button>
    </div>
  );
}

export function Floating({ mode, side, visible, unread, latest, onOpen, onClose, onActivity }: Props) {
  const { room } = useServices();
  const pillShown = mode === "quiet" && (visible || unread > 0);
  return (
    <>
      <div className="jc-f" data-side={side} data-on={pillShown ? "1" : "0"} inert={!pillShown}>
        <button className="jc-pill jc-surface" type="button" aria-label={unread ? `Open chat, ${unread} new` : "Open chat"} onClick={onOpen} style={{ position: "relative" }}>
          <Icon name="chat" />
          {unread > 0 && <span className="jc-count">{unread > 9 ? "9+" : unread}</span>}
        </button>
      </div>
      <div className="jc-f" data-side={side} data-on={mode === "toast" ? "1" : "0"} inert={mode !== "toast"}>
        {latest && (
          <button className="jc-toast jc-surface" type="button" onClick={onOpen}>
            <Avatar name={latest.name} small />
            <span className="t"><b>{latest.name}</b>{latest.text}</span>
          </button>
        )}
      </div>
      <div className="jc-f" data-side={side} data-on={mode === "peek" ? "1" : "0"} inert={mode !== "peek"}>
        {mode === "peek" && latest && (
          <div className="jc-peek jc-surface" onPointerMove={onActivity}>
            <div className="pl">
              {latest.recent.map((line, index) => (
                <div key={index} className={index < latest.recent.length - 1 ? "f" : ""}><b>{line.name}</b>{line.text}</div>
              ))}
            </div>
            <PeekReply onSend={(text) => void room.sendMessage(text)} />
            <div className="jc-bar" style={{ justifyContent: "space-between" }}>
              <button className="jc-btn" type="button" onClick={onOpen}>Open chat</button>
              <button className="jc-ib" type="button" aria-label="Dismiss" onClick={onClose}><Icon name="x" /></button>
            </div>
          </div>
        )}
      </div>
      <div className="jc-f jc-card jc-surface" data-side={side} data-on={mode === "open" ? "1" : "0"} onPointerMove={onActivity} onKeyDown={onActivity} style={{ bottom: 112 }} role="dialog" aria-label="JellyChat" inert={mode !== "open"}>
        {mode === "open" && <Panel onClose={onClose} autoFocus />}
      </div>
    </>
  );
}
