import type { ChatActions, ChatState } from "../types";
import { closeButtonId, drawerId, sideToggleButtonId, statusId, titleId } from "../runtime/util";
import { getCurrentGroupLabel } from "../runtime/store";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { ReactionBar } from "./ReactionBar";

type Props = {
  state: ChatState;
  actions: ChatActions;
};

export function ChatDrawer({ state, actions }: Props) {
  const statusText = state.syncPlay.inGroup
    ? "In SyncPlay group: " + getCurrentGroupLabel()
    : "Not in a SyncPlay group";
  const controls = (
    <div className="jellyChatHeaderControls">
      <button
        id={closeButtonId}
        type="button"
        aria-label="Close JellyChat"
        onClick={actions.closeDrawer}
      >
        &times;
      </button>
      <button
        id={sideToggleButtonId}
        type="button"
        aria-label={state.drawerSide === "right" ? "Move JellyChat drawer to left" : "Move JellyChat drawer to right"}
        title={state.drawerSide === "right" ? "Move left" : "Move right"}
        onClick={actions.toggleDrawerSide}
      >
        {state.drawerSide === "right" ? "L" : "R"}
      </button>
    </div>
  );

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
      <div className={"jellyChatHeader is-" + state.drawerSide}>
        {state.drawerSide === "right" ? controls : null}
        <h2 id={titleId}>JellyChat</h2>
        {state.drawerSide === "left" ? controls : null}
      </div>
      <div id={statusId} className={state.syncPlay.inGroup ? "is-active" : ""}>
        {statusText}
      </div>
      <MessageList timelineItems={state.timelineItems} syncPlay={state.syncPlay} />
      <ReactionBar actions={actions} syncPlay={state.syncPlay} />
      <Composer actions={actions} sending={state.sending} syncPlay={state.syncPlay} />
    </aside>
  );
}
