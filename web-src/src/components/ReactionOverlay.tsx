import { useEffect, useState } from "react";
import type { ReactionOverlayItem } from "../types";
import { subscribeReactionOverlays } from "../runtime/reactions";

export function ReactionOverlay() {
  const [items, setItems] = useState<ReactionOverlayItem[]>([]);

  useEffect(() => subscribeReactionOverlays(setItems), []);

  return (
    <div id="jellyChatReactionOverlayHost" aria-hidden="true">
      {items.map((item) => (
        <span
          key={item.id}
          className="jellyChatReactionFloat"
          style={{
            left: item.left + "px",
            top: item.top + "px",
            ["--jellychat-reaction-dx" as string]: item.dx + "px",
            ["--jellychat-reaction-rise" as string]: item.rise + "px",
            ["--jellychat-reaction-mid-dx" as string]: Math.round(item.dx * 0.58) + "px",
            ["--jellychat-reaction-mid-rise" as string]: Math.round(item.rise * -0.58) + "px",
            ["--jellychat-reaction-rise-y" as string]: Math.round(item.rise * -1) + "px",
            ["--jellychat-reaction-duration" as string]: item.durationMs + "ms",
            ["--jellychat-reaction-scale" as string]: String(item.scale)
          }}
        >
          {item.emoji}
        </span>
      ))}
    </div>
  );
}
