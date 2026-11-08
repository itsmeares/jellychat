import { useEffect, useRef, useState } from "react";
import { findVideo, isVideoRoute } from "../core/host";
import { PlaybackWatcher, type PlaybackReport } from "../core/playback";

const controlsMs = 3200;

export type PlayerState = { onVideo: boolean; playing: boolean; controls: boolean };

/** Tracks whether a video is on screen, playing, and whether Jellyfin's own controls are showing. */
export function usePlayer(report: (report: PlaybackReport) => void, enabled: boolean): PlayerState {
  const [state, setState] = useState<PlayerState>({ onVideo: false, playing: false, controls: false });
  const lastActivity = useRef(0);
  const reportRef = useRef(report);
  reportRef.current = report;

  useEffect(() => {
    const watcher = new PlaybackWatcher((item) => reportRef.current(item));
    const touch = () => { lastActivity.current = Date.now(); };
    (["pointermove", "pointerdown", "keydown", "touchstart"] as const).forEach((type) => document.addEventListener(type, touch, true));
    const tick = () => {
      const video = findVideo();
      const onVideo = !!video && isVideoRoute();
      watcher.attach(enabled && onVideo ? video : null);
      const playing = onVideo && !!video && !video.paused && !video.ended;
      const controls = onVideo && (!playing || Date.now() - lastActivity.current < controlsMs);
      setState((previous) => previous.onVideo === onVideo && previous.playing === playing && previous.controls === controls ? previous : { onVideo, playing, controls });
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => {
      clearInterval(timer);
      (["pointermove", "pointerdown", "keydown", "touchstart"] as const).forEach((type) => document.removeEventListener(type, touch, true));
      watcher.dispose();
    };
  }, [enabled]);

  return state;
}
