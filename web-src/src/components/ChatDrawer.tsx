import type { ChatActions, ChatState } from "../types";
import { closeButtonId, drawerId, statusId, titleId } from "../runtime/util";
import { getCurrentGroupLabel } from "../runtime/store";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";

type Props = {
  state: ChatState;
  actions: ChatActions;
};

export function ChatDrawer({ state, actions }: Props) {
  const statusText = state.syncPlay.inGroup
    ? "In SyncPlay group: " + getCurrentGroupLabel()
    : "Not in a SyncPlay group";

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
      <div className="jellyChatHeader">
        <h2 id={titleId}>JellyChat</h2>
        <button
          id={closeButtonId}
          type="button"
          aria-label="Close SyncPlay chat"
          onClick={actions.closeDrawer}
        >
          &times;
        </button>
      </div>
      <div id={statusId} className={state.syncPlay.inGroup ? "is-active" : ""}>
        {statusText}
      </div>
      <MessageList groups={state.groups} syncPlay={state.syncPlay} />
      <Composer actions={actions} sending={state.sending} syncPlay={state.syncPlay} />
    </aside>
  );
}
