import { buttonId, markerClass } from "../runtime/util";
import { setFloatingButtonPointerInside } from "../runtime/layout";
import type { ChatActions } from "../types";

type Props = {
  isOpen: boolean;
  actions: ChatActions;
};

export function ChatButton({ isOpen, actions }: Props) {
  return (
    <button
      id={buttonId}
      type="button"
      className={"emby-button " + markerClass}
      data-jellychat-button="true"
      aria-label="JellyChat"
      aria-controls="jellyChatDrawer"
      aria-expanded={isOpen ? "true" : "false"}
      title="JellyChat"
      onClick={actions.toggleDrawer}
      onPointerEnter={() => setFloatingButtonPointerInside(true)}
      onPointerLeave={() => setFloatingButtonPointerInside(false)}
      onMouseEnter={() => setFloatingButtonPointerInside(true)}
      onMouseLeave={() => setFloatingButtonPointerInside(false)}
    >
      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M4 4h16v11H8l-4 4V4z" />
      </svg>
    </button>
  );
}
