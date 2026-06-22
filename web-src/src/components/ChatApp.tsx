import { useEffect, useState } from "react";
import { ChatDrawer } from "./ChatDrawer";
import { ChatButton } from "./ChatButton";
import { actions, getState, subscribe } from "../runtime/store";
import { floatingHostId } from "../runtime/util";

export function ChatApp() {
  const [state, setState] = useState(getState);

  useEffect(() => subscribe(setState), []);

  useEffect(() => {
    if (window.JellyChatDebug) {
      window.JellyChatDebug.reactMounted = true;
    }
  }, []);

  return (
    <>
      <div id={floatingHostId} data-jellychat-host="true">
        <ChatButton isOpen={state.drawerOpen} actions={actions} />
      </div>
      <ChatDrawer state={state} actions={actions} />
    </>
  );
}
