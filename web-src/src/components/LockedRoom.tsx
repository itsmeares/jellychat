import { FormEvent, useRef, useState } from "react";
import type { ChatActions } from "../types";

type Props = {
  actions: ChatActions;
  checking?: boolean;
};

export function LockedRoom({ actions, checking = false }: Props) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password || submitting || checking) {
      return;
    }

    setSubmitting(true);
    setFeedback("");
    const result = await actions.unlockRoom(password);
    setPassword("");
    setSubmitting(false);
    setFeedback(result.message);
    if (!result.success) {
      window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
    }
  }

  return (
    <div className="jellyChatLockedRoom" role="region" aria-label={checking ? "Checking JellyChat room access" : "Locked JellyChat room"}>
      <div className="jellyChatLockedRoomIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24" focusable="false">
          <path fill="currentColor" d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Zm-7-2a2 2 0 1 1 4 0v2h-4V6Zm3 9.73V18h-2v-2.27a2 2 0 1 1 2 0Z" />
        </svg>
      </div>
      <h3>{checking ? "Checking room access" : "This JellyChat room is locked"}</h3>
      <p>{checking ? "Confirming access with Jellyfin." : "Enter the room password to open JellyChat. SyncPlay remains available."}</p>
      {!checking ? (
        <form onSubmit={submit} autoComplete="off">
          <label htmlFor="jellyChatRoomUnlockPassword">Room password</label>
          <div className="jellyChatLockedRoomControls">
            <input
              id="jellyChatRoomUnlockPassword"
              ref={inputRef}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              disabled={submitting}
              autoFocus
            />
            <button type="submit" disabled={submitting || password.length === 0}>
              {submitting ? "Unlocking…" : "Unlock"}
            </button>
          </div>
          {feedback ? <div className="jellyChatRoomFeedback" role="status" aria-live="polite">{feedback}</div> : null}
        </form>
      ) : null}
    </div>
  );
}
