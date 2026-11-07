import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { currentUserId } from "../core/api";
import { isEditable, portalTarget, syncPlayButton } from "../core/host";
import type { PlaybackReport } from "../core/playback";
import { Dock } from "./Dock";
import { Floating, type FloatMode } from "./Floating";
import { ReactionOverlay } from "./ReactionOverlay";
import { EdgeTab, HeaderButton, useHeaderSlot } from "./Triggers";
import { useServices } from "./context";
import { useStore } from "./hooks";
import { usePlayer } from "./player";

const toastMs = 5000;
const peekMs = 9000;
const idleHideMs = 7000;

type Latest = { name: string; text: string; recent: Array<{ name: string; text: string }> };

export function App() {
  const { room, prefs } = useServices();
  const roomState = useStore(room);
  const { resolved } = useStore(prefs);
  const inGroup = !!roomState.room?.inGroup;
  const [mode, setMode] = useState<FloatMode>("quiet");
  const [unread, setUnread] = useState(0);
  const [latest, setLatest] = useState<Latest | null>(null);
  const [target, setTarget] = useState<HTMLElement>(portalTarget);
  const lastActivity = useRef(Date.now());
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const recent = useRef<Array<{ name: string; text: string }>>([]);

  const report = useCallback((item: PlaybackReport) => {
    void room.sendPlayback(`playback.${item.action}`, {
      itemId: item.itemId,
      itemName: item.itemName,
      positionSeconds: item.positionSeconds,
      fromPositionTicks: item.fromSeconds === undefined ? undefined : Math.round(item.fromSeconds * 10_000_000),
      toPositionTicks: Math.round(item.positionSeconds * 10_000_000)
    });
  }, [room]);
  const player = usePlayer(report, inGroup);
  const floating = resolved.layout === "floating";
  const open = mode === "open";

  const openChat = useCallback(() => { setMode("open"); setUnread(0); lastActivity.current = Date.now(); }, []);
  const closeChat = useCallback(() => setMode("quiet"), []);
  const toggle = useCallback(() => (modeRef.current === "open" ? closeChat() : openChat()), [openChat, closeChat]);

  useEffect(() => {
    const sync = () => setTarget(portalTarget());
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    if (!inGroup) { setMode("quiet"); setUnread(0); setLatest(null); recent.current = []; }
  }, [inGroup]);

  useEffect(() => room.onSignal((signal) => {
    if (signal.kind !== "message" || signal.mine) return;
    const name = signal.event.userName || "Someone";
    const line = { name, text: signal.event.text };
    recent.current = [...recent.current, line].slice(-3);
    if (modeRef.current === "open") return;
    setUnread((count) => count + 1);
    setLatest({ ...line, recent: recent.current });
    if (!floating) return;
    const toMe = !!signal.event.replyTo && signal.event.replyTo.userId === currentUserId();
    setMode(toMe ? "peek" : "toast");
    lastActivity.current = Date.now();
  }), [room, floating]);

  useEffect(() => {
    if (mode !== "toast" && mode !== "peek") return;
    const limit = mode === "toast" ? toastMs : peekMs;
    const timer = setInterval(() => { if (Date.now() - lastActivity.current >= limit) setMode("quiet"); }, 500);
    return () => clearInterval(timer);
  }, [mode, latest]);

  useEffect(() => {
    if (!floating || mode !== "open" || !resolved.autoHide || !player.playing) return;
    const timer = setInterval(() => {
      const active = document.activeElement;
      const typing = active instanceof HTMLInputElement && active.closest(".jc-card") && active.value.length > 0;
      if (!typing && Date.now() - lastActivity.current > idleHideMs) setMode("quiet");
    }, 1000);
    return () => clearInterval(timer);
  }, [floating, mode, resolved.autoHide, player.playing]);

  useEffect(() => {
    if (!inGroup || !resolved.shortcut) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "c" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return;
      if (isEditable(event.target) || (event.target as HTMLElement | null)?.closest?.(".jc")) return;
      event.preventDefault();
      event.stopPropagation();
      toggle();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [inGroup, resolved.shortcut, toggle]);

  const slot = useHeaderSlot(true);

  if (!inGroup) return <HeaderButton slot={slot} unread={0} open={false} idle onClick={() => document.querySelector<HTMLElement>(syncPlayButton)?.click()} />;

  const tree = (
    <div className="jc" data-theme={resolved.theme} data-style={resolved.messageStyle} data-side={resolved.messageSide} data-layout={resolved.layout} data-corners={resolved.theme === "custom" ? resolved.customCorners : undefined} data-glass={resolved.theme === "custom" && resolved.customGlass ? "1" : undefined} style={{ ["--jc-w" as string]: resolved.width + "px" }}>
      <ReactionOverlay />
      {floating ? (
        <Floating mode={mode} side={resolved.side} visible={player.onVideo && player.controls} unread={player.onVideo ? unread : 0} latest={latest} onOpen={openChat} onClose={closeChat} onActivity={() => { lastActivity.current = Date.now(); }} />
      ) : (
        <>
          <Dock open={open} side={resolved.side} width={resolved.width} onClose={closeChat} />
          {!open && player.onVideo && (player.controls || unread > 0) && <EdgeTab side={resolved.side} unread={unread} onClick={openChat} />}
        </>
      )}
    </div>
  );

  return (
    <>
      <HeaderButton slot={slot} unread={unread} open={open} onClick={toggle} />
      {createPortal(tree, target)}
    </>
  );
}
