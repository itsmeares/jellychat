import { useState } from "react";
import { api } from "../core/api";
import { quickDefault, widthMax, widthMin } from "../core/settings";
import type { Layout, MessageStyle, RoomInfo, Side, UserTheme } from "../core/types";
import { Row, Seg, Toggle } from "./Controls";
import { EmojiPicker } from "./EmojiPicker";
import { useServices } from "./context";
import { useStore } from "./hooks";

export function Settings({ room, onRoom }: { room: RoomInfo; onRoom: (room: RoomInfo) => void }) {
  const { prefs } = useServices();
  const { user, resolved, server } = useStore(prefs);
  const device = useStore(prefs).device;
  const [slot, setSlot] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const lock = resolved.locked;

  const savePassword = async () => {
    try {
      onRoom(await api.setPassword(password));
      setPassword("");
      setError("");
    } catch {
      setError("Could not save the password.");
    }
  };
  const removePassword = async () => {
    try { onRoom(await api.disablePassword()); } catch { setError("Could not remove the password."); }
  };

  return (
    <div className="jc-set">
      <h5>Look</h5>
      {lock && <p className="lock">The server owner set the look for everyone. You can still change width, side and quick emoji.</p>}
      <div className="stack">
        <Seg<UserTheme> full disabled={lock} value={lock ? server.theme : user.theme} onChange={(theme) => prefs.updateUser({ theme })} options={[["violet", "Violet"], ["glass", "Glass"], ["server", "Server default"]]} />
        <Seg<Layout> full disabled={lock} value={resolved.layout} onChange={(layout) => prefs.updateUser({ layout })} options={[["docked", "Docked"], ["floating", "Floating"]]} />
      </div>
      <Row label="My messages"><Seg<Side> disabled={lock} value={resolved.messageSide} onChange={(messageSide) => prefs.updateUser({ messageSide })} options={[["left", "Left"], ["right", "Right"]]} /></Row>
      <Row label="Message style"><Seg<MessageStyle> disabled={lock} value={resolved.messageStyle} onChange={(messageStyle) => prefs.updateUser({ messageStyle })} options={[["bubbles", "Bubbles"], ["flat", "Flat"]]} /></Row>
      <Row label="Hide while watching"><Toggle label="Hide while watching" disabled={lock} checked={resolved.autoHide} onChange={(autoHide) => prefs.updateUser({ autoHide })} /></Row>

      <h5>This device</h5>
      <Row label="Width"><input type="range" min={widthMin} max={widthMax} step={10} value={device.width} aria-label="Panel width" onChange={(event) => prefs.updateDevice({ width: Number(event.target.value) })} /></Row>
      <Row label="Panel side"><Seg<Side> value={device.side} onChange={(side) => prefs.updateDevice({ side })} options={[["left", "Left"], ["right", "Right"]]} /></Row>

      <h5>Keyboard</h5>
      <Row label="Press C to open chat"><Toggle label="Keyboard shortcut" disabled={!server.shortcutEnabled} checked={resolved.shortcut} onChange={(shortcut) => prefs.updateUser({ shortcut })} /></Row>
      {!server.shortcutEnabled && <p className="note">The server owner turned the shortcut off.</p>}

      <h5>Quick emoji</h5>
      <p className="note">Pick a slot, then pick an emoji.</p>
      <div className="jc-slots">
        {user.quick.map((emoji, index) => (
          <button key={index} type="button" aria-pressed={slot === index} aria-label={"Quick emoji " + (index + 1)} onClick={() => setSlot(slot === index ? null : index)}>{emoji}</button>
        ))}
      </div>
      {slot !== null && (
        <div className="jc-pop" style={{ position: "static", boxShadow: "none", background: "transparent", padding: 0 }}>
          <EmojiPicker recent={user.recent} favorites={user.favorites} onToggleFavorite={() => undefined} onPick={(emoji) => {
            const quick = [...user.quick];
            quick[slot] = emoji;
            prefs.updateUser({ quick });
            setSlot(null);
          }} />
        </div>
      )}
      <button className="jc-btn" type="button" onClick={() => prefs.resetUser()}>Reset my look</button>
      <button className="jc-btn" type="button" style={{ marginLeft: 8 }} onClick={() => prefs.updateUser({ quick: [...quickDefault] })}>Reset quick emoji</button>

      {room.inGroup && room.isOwner && (
        <>
          <h5>Room password</h5>
          <p className="note">{room.passwordProtected ? "This room asks for a password." : "Anyone in the SyncPlay group can read and write."}</p>
          <div className="jc-pwd">
            <input type="password" value={password} placeholder="New password" aria-label="Room password" autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()} />
            <button className="jc-btn pri" type="button" disabled={!password} onClick={() => void savePassword()}>{room.passwordProtected ? "Change" : "Set"}</button>
          </div>
          {room.passwordProtected && <button className="jc-btn" type="button" style={{ marginTop: 8 }} onClick={() => void removePassword()}>Remove password</button>}
          {error && <p className="note jc-err">{error}</p>}
        </>
      )}
    </div>
  );
}
