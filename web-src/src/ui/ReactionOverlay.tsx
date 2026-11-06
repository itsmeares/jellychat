import { useEffect, useState } from "react";
import { useServices } from "./context";

type Float = { id: number; emoji: string; left: number; dx: number };

export function ReactionOverlay() {
  const { room } = useServices();
  const [floats, setFloats] = useState<Float[]>([]);

  useEffect(() => {
    let next = 0;
    return room.onSignal((signal) => {
      if (signal.kind !== "reaction" || !signal.event.emoji) return;
      const id = next++;
      const float = { id, emoji: signal.event.emoji, left: 10 + Math.random() * 70, dx: Math.round(Math.random() * 80 - 40) };
      setFloats((list) => [...list.slice(-14), float]);
      setTimeout(() => setFloats((list) => list.filter((item) => item.id !== id)), 2700);
    });
  }, [room]);

  if (!floats.length) return null;
  return (
    <div className="jc-react" aria-hidden="true">
      {floats.map((float) => (
        <span key={float.id} className="jc-fl" style={{ left: float.left + "%", ["--dx" as string]: float.dx + "px" }}>{float.emoji}</span>
      ))}
    </div>
  );
}
