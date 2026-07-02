import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import type { ChatActions, SyncPlayContext } from "../types";
import { formId, inputId, sendButtonId } from "../runtime/util";

type Props = {
  actions: ChatActions;
  sending: boolean;
  syncPlay: SyncPlayContext;
};

export function Composer({ actions, sending, syncPlay }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const disabled = sending || !syncPlay.inGroup;

  function resizeInput() {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    input.style.height = "auto";
    input.style.height = Math.max(32, Math.min(112, input.scrollHeight)) + "px";
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const sent = await actions.sendMessage(value);
    if (sent) {
      setValue("");
      actions.stopTyping("message-sent");
      window.setTimeout(resizeInput, 0);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    event.stopPropagation();
    if (window.JellyChatDebug) {
      window.JellyChatDebug.keydownListenerCount = 1;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      actions.closeDrawer();
    }
  }

  return (
    <form id={formId} autoComplete="off" onSubmit={submit}>
      <textarea
        id={inputId}
        ref={inputRef}
        rows={1}
        placeholder={syncPlay.inGroup ? "Type a message" : "Join a SyncPlay group to chat"}
        aria-label="JellyChat message"
        wrap="soft"
        disabled={disabled}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          actions.noteComposerInput(event.target.value);
          window.setTimeout(resizeInput, 0);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => event.stopPropagation()}
        onFocus={() => actions.setInputFocused(true)}
        onBlur={() => {
          actions.stopTyping("composer-blur");
          actions.setInputFocused(false);
        }}
      />
      <button id={sendButtonId} type="submit" disabled={disabled || value.trim().length === 0}>
        {sending ? "Sending..." : "Send"}
      </button>
    </form>
  );
}
