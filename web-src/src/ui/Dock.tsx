import { useEffect, useRef, useState } from "react";
import { isPhonePortrait } from "../core/host";
import { clampWidth } from "../core/settings";
import type { Side } from "../core/types";
import { Panel } from "./Panel";
import { useServices } from "./context";

type Props = { open: boolean; side: Side; width: number; onClose: () => void };

export function Dock({ open, side, width, onClose }: Props) {
  const { prefs } = useServices();
  const [live, setLive] = useState<number | null>(null);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const shown = live ?? width;

  useEffect(() => {
    const root = document.documentElement;
    if (!open || isPhonePortrait()) return;
    root.dataset.jcDock = side;
    root.style.setProperty("--jc-dock", shown + "px");
    return () => {
      delete root.dataset.jcDock;
      root.style.removeProperty("--jc-dock");
    };
  }, [open, side, shown]);

  const onDown = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { startX: event.clientX, startWidth: width };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("on");
  };
  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const delta = event.clientX - drag.current.startX;
    setLive(clampWidth(drag.current.startWidth + (side === "right" ? -delta : delta)));
  };
  const onUp = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.classList.remove("on");
    drag.current = null;
    if (live !== null) prefs.updateDevice({ width: live });
    setLive(null);
  };

  return (
    <aside
      className="jc-dock"
      data-edge={side}
      data-hidden={open ? "0" : "1"}
      aria-hidden={!open}
      aria-label="JellyChat"
      style={{ ["--jc-w" as string]: shown + "px" }}
      onKeyDown={(event) => { if (event.key === "Escape" && open) onClose(); }}
    >
      <div className="jc-resize" role="separator" aria-orientation="vertical" aria-label="Resize chat" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      {open && <Panel onClose={onClose} autoFocus />}
    </aside>
  );
}
