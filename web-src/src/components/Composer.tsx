import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import type { ChatActions, ReplyTarget, SyncPlayContext } from "../types";
import { formId, inputId, sendButtonId } from "../runtime/util";

type Props = {
  actions: ChatActions;
  sending: boolean;
  syncPlay: SyncPlayContext;
  replyTarget: ReplyTarget | null;
  replyTargetFound: boolean;
};

export function Composer({ actions, sending, syncPlay, replyTarget, replyTargetFound }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const disabled = !syncPlay.inGroup;

  function focusInput() {
    const input = inputRef.current;
    if (!input || input.disabled) {
      return;
    }

    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
  }

  function resizeInput() {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    input.style.height = "auto";
    const style = window.getComputedStyle(input);
    const minHeight = Number.parseFloat(style.minHeight) || 0;
    const maxHeight = Number.parseFloat(style.maxHeight) || Number.POSITIVE_INFINITY;
    const borderHeight = (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0);
    const contentHeight = input.scrollHeight + borderHeight;
    input.style.height = Math.max(minHeight, Math.min(maxHeight, contentHeight)) + "px";
    input.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const sent = await actions.sendMessage(value);
    if (sent) {
      setValue("");
      actions.stopTyping("message-sent");
    }

    window.setTimeout(() => {
      resizeInput();
      focusInput();
    }, 0);
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
      if (replyTarget) {
        actions.cancelReply("composer-escape");
        return;
      }

      actions.closeDrawer();
    }
  }

  return (
    <div className="jellyChatComposerArea">
      {replyTarget ? (
        <div className="jellyChatComposerReply" role="status" aria-live="polite">
          <div className="jellyChatComposerReplyText">
            <span className="jellyChatComposerReplyLabel">Replying to {replyTarget.userName}</span>
            <span className="jellyChatComposerReplyPreview">
              {replyTargetFound ? replyTarget.messagePreview : replyTarget.messagePreview || "Original message unavailable"}
            </span>
          </div>
          <button type="button" aria-label="Cancel reply" title="Cancel reply" onClick={() => actions.cancelReply("button")}>
            ×
          </button>
        </div>
      ) : null}
      <form id={formId} autoComplete="off" onSubmit={submit}>
        <textarea
          id={inputId}
          ref={inputRef}
          rows={1}
          placeholder={syncPlay.inGroup ? "Type a message" : "Join a SyncPlay group to chat"}
          aria-label="JellyChat message"
          wrap="soft"
          disabled={disabled}
          readOnly={sending}
          aria-busy={sending ? "true" : "false"}
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
        <button
          id={sendButtonId}
          type="submit"
          disabled={disabled || sending || value.trim().length === 0}
          aria-label={sending ? "Sending message" : "Send message"}
          title={sending ? "Sending message" : "Send message"}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M12 4 10.6 5.4l5.6 5.6H4v2h12.2l-5.6 5.6L12 20l8-8-8-8Z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
