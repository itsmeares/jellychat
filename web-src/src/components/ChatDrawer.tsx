import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { ChatActions, ChatState } from "../types";
import { closeButtonId, drawerId, sideToggleButtonId, statusId, titleId } from "../runtime/util";
import { getCurrentGroupLabel } from "../runtime/store";
import { clampDrawerBackgroundAlpha, drawerBackgroundAlphaMax, drawerBackgroundAlphaMin } from "../runtime/preferences";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { ReactionBar } from "./ReactionBar";

type Props = {
  state: ChatState;
  actions: ChatActions;
};

function DrawerResizeHandle({ state, actions }: Props) {
  const activePointerId = useRef<number | null>(null);

  function widthFromClientX(clientX: number): number {
    return state.drawerSide === "right" ? window.innerWidth - clientX : clientX;
  }

  function stopResize(target: EventTarget & HTMLElement) {
    if (activePointerId.current !== null && target.hasPointerCapture(activePointerId.current)) {
      target.releasePointerCapture(activePointerId.current);
    }
    activePointerId.current = null;
    actions.setDrawerResizeActive(false);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!state.drawerOpen || event.button !== 0) {
      return;
    }

    activePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    actions.setDrawerResizeActive(true);
    actions.setDrawerWidth(widthFromClientX(event.clientX), "resize-start");
    event.preventDefault();
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointerId.current !== event.pointerId) {
      return;
    }

    actions.setDrawerWidth(widthFromClientX(event.clientX), "resize");
    event.preventDefault();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const largeStep = event.shiftKey ? 48 : 16;
    let nextWidth = state.drawerWidth;
    if (event.key === "ArrowLeft") {
      nextWidth += state.drawerSide === "right" ? largeStep : -largeStep;
    } else if (event.key === "ArrowRight") {
      nextWidth += state.drawerSide === "right" ? -largeStep : largeStep;
    } else if (event.key === "Home") {
      nextWidth = state.drawerWidthMin;
    } else if (event.key === "End") {
      nextWidth = state.drawerWidthMax;
    } else {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    actions.setDrawerWidth(nextWidth, "keyboard");
  }

  return (
    <div
      className={"jellyChatResizeHandle is-" + state.drawerSide}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize JellyChat drawer"
      aria-valuemin={state.drawerWidthMin}
      aria-valuemax={state.drawerWidthMax}
      aria-valuenow={state.drawerWidth}
      tabIndex={state.drawerOpen ? 0 : -1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => stopResize(event.currentTarget)}
      onPointerCancel={(event) => stopResize(event.currentTarget)}
      onKeyDown={onKeyDown}
    />
  );
}

function DrawerSettingsPopover({ state, actions, open, onClose }: Props & { open: boolean; onClose: () => void }) {
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const focusTarget = window.setTimeout(() => {
      const target = popoverRef.current?.querySelector<HTMLElement>("input, button");
      target?.focus({ preventScroll: true });
    }, 0);

    function closeOnOutsideClick(event: Event) {
      const target = event.target as Node | null;
      if (target instanceof Element && target.closest("#jellyChatSettingsButton")) {
        return;
      }
      if (target && popoverRef.current && popoverRef.current.contains(target)) {
        return;
      }

      onClose();
    }

    function closeFromEvent() {
      onClose();
    }

    document.addEventListener("pointerdown", closeOnOutsideClick as EventListener);
    window.addEventListener("jellychat-close-settings", closeFromEvent);
    return () => {
      window.clearTimeout(focusTarget);
      document.removeEventListener("pointerdown", closeOnOutsideClick as EventListener);
      window.removeEventListener("jellychat-close-settings", closeFromEvent);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={popoverRef}
      className="jellyChatSettingsPopover"
      data-jellychat-settings-popover="true"
      role="dialog"
      aria-label="JellyChat drawer settings"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <label className="jellyChatSetting">
        <span>Width</span>
        <input
          type="range"
          min={state.drawerWidthMin}
          max={state.drawerWidthMax}
          step="8"
          value={state.drawerWidth}
          onChange={(event) => actions.setDrawerWidth(Number(event.target.value), "settings")}
        />
        <output>{state.drawerWidth}px</output>
      </label>
      <label className="jellyChatSetting">
        <span>Background</span>
        <input
          type="range"
          min={drawerBackgroundAlphaMin}
          max={drawerBackgroundAlphaMax}
          step="0.01"
          value={state.drawerBackgroundAlpha}
          onChange={(event) => actions.setDrawerBackgroundAlpha(clampDrawerBackgroundAlpha(Number(event.target.value)))}
        />
        <output>{Math.round(state.drawerBackgroundAlpha * 100)}%</output>
      </label>
      <div className="jellyChatSettingsActions">
        <button type="button" onClick={actions.resetDrawerWidth}>Reset width</button>
        <button type="button" onClick={actions.resetDrawerBackgroundAlpha}>Reset background</button>
        <button type="button" onClick={actions.resetDrawerPreferences}>Reset all</button>
      </div>
    </div>
  );
}

export function ChatDrawer({ state, actions }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const statusText = state.syncPlay.inGroup
    ? "In SyncPlay group: " + getCurrentGroupLabel()
    : "Not in a SyncPlay group";
  const controls = (
    <div className="jellyChatHeaderControls">
      <button
        id="jellyChatSettingsButton"
        type="button"
        aria-label="JellyChat drawer settings"
        aria-expanded={settingsOpen}
        title="Drawer settings"
        onClick={() => setSettingsOpen((open) => !open)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path fill="currentColor" d="M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.5-2-3.4-2.4 1c-.8-.6-1.6-1-2.6-1.3L14 2.8h-4l-.4 2.5c-1 .3-1.8.7-2.6 1.3l-2.4-1-2 3.4 2 1.5c-.1.5-.1 1-.1 1.5s0 1 .1 1.5l-2 1.5 2 3.4 2.4-1c.8.6 1.6 1 2.6 1.3l.4 2.5h4l.4-2.5c1-.3 1.8-.7 2.6-1.3l2.4 1 2-3.4-2-1.5ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
        </svg>
      </button>
      <button
        id={sideToggleButtonId}
        type="button"
        aria-label={state.drawerSide === "right" ? "Move JellyChat drawer to left" : "Move JellyChat drawer to right"}
        title={state.drawerSide === "right" ? "Move left" : "Move right"}
        onClick={actions.toggleDrawerSide}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d={state.drawerSide === "right"
              ? "M14.8 6.2 9 12l5.8 5.8-1.4 1.4L6.2 12l7.2-7.2 1.4 1.4Z"
              : "M9.2 17.8 15 12 9.2 6.2l1.4-1.4 7.2 7.2-7.2 7.2-1.4-1.4Z"}
          />
        </svg>
      </button>
      <button
        id={closeButtonId}
        type="button"
        aria-label="Close JellyChat"
        title="Close"
        onClick={actions.closeDrawer}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path fill="currentColor" d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4 6.4 5Zm12.6 1.4L6.4 19 5 17.6 17.6 5 19 6.4Z" />
        </svg>
      </button>
    </div>
  );

  useEffect(() => {
    if (!state.drawerOpen) {
      setSettingsOpen(false);
    }
  }, [state.drawerOpen]);

  return (
    <aside
      id={drawerId}
      className={state.drawerOpen ? "is-open" : ""}
      data-jellychat-drawer="true"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-hidden={state.drawerOpen ? "false" : "true"}
      inert={!state.drawerOpen}
    >
      <DrawerResizeHandle state={state} actions={actions} />
      <div className={"jellyChatHeader is-" + state.drawerSide}>
        <h2 id={titleId}>JellyChat</h2>
        {controls}
        <DrawerSettingsPopover state={state} actions={actions} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
      <div id={statusId} className={state.syncPlay.inGroup ? "is-active" : ""} role="status" aria-live="polite">
        {statusText}
      </div>
      <MessageList
        timelineItems={state.timelineItems}
        syncPlay={state.syncPlay}
        typingUsers={state.typingRemoteUsers}
        actions={actions}
        messageActionMenu={state.messageActionMenu}
        highlightedMessageId={state.highlightedMessageId}
      />
      <ReactionBar actions={actions} syncPlay={state.syncPlay} />
      <Composer actions={actions} sending={state.sending} syncPlay={state.syncPlay} replyTarget={state.replyTarget} replyTargetFound={state.replyTargetFound} />
    </aside>
  );
}
