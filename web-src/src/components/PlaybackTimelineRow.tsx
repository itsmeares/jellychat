import type { PlaybackTimelineItem } from "../types";
import { formatMessageTime, getPlaybackMessage } from "../runtime/util";

type Props = {
  item: PlaybackTimelineItem;
};

export function PlaybackTimelineRow({ item }: Props) {
  return (
    <div className="jellyChatPlaybackEvent" data-jellychat-playback-event-key={item.eventKey}>
      <span className="jellyChatPlaybackEventText">{getPlaybackMessage(item)}</span>
      <span className="jellyChatPlaybackEventTime">{formatMessageTime(item)}</span>
    </div>
  );
}
