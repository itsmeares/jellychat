export type SyncPlayContext = {
  inGroup: boolean;
  groupId: string;
  groupName: string;
  unavailable: boolean;
};

export type RoomEvent = {
  id: string;
  sequence: number;
  groupId: string;
  type: string;
  userId: string;
  userName: string;
  sessionId: string;
  createdAtUtc: string;
  text: string;
  emoji: string;
  playbackAction: string;
  fromPositionTicks: unknown;
  toPositionTicks: unknown;
  itemId: string;
  itemName: string;
  clientEventId: string;
  eventKey: string;
  optimistic?: boolean;
};

export type ChatMessage = {
  id: string;
  sequence: number;
  groupId: string;
  userId: string;
  userName: string;
  text: string;
  createdAtUtc: string;
  eventKey: string;
};

export type MessageGroupModel = {
  key: string;
  senderKey: string;
  userName: string;
  createdAtUtc: string;
  messages: ChatMessage[];
};

export type PlaybackEventType = "playback.start" | "playback.play" | "playback.pause" | "playback.seek";

export type PlaybackTimelineItem = {
  kind: "playback";
  key: string;
  id: string;
  sequence: number;
  type: PlaybackEventType;
  userName: string;
  createdAtUtc: string;
  fromPositionTicks: number | null;
  toPositionTicks: number | null;
  itemId: string;
  itemName: string;
  eventKey: string;
};

export type TimelineItem =
  | { kind: "messageGroup"; key: string; group: MessageGroupModel }
  | PlaybackTimelineItem;

export type DrawerSide = "right" | "left";

export type ChatState = {
  drawerOpen: boolean;
  drawerSide: DrawerSide;
  syncPlay: SyncPlayContext;
  messages: ChatMessage[];
  groups: MessageGroupModel[];
  timelineItems: TimelineItem[];
  sending: boolean;
};

export type ChatActions = {
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  toggleDrawerSide: () => void;
  sendMessage: (text: string) => Promise<boolean>;
  setInputFocused: (focused: boolean) => void;
};

export type JellyChatDebug = Record<string, unknown> & {
  loaded: boolean;
  frontend: "react";
  mounted: boolean;
  reactMounted: boolean;
  rootCount: number;
  buttonCount: number;
  intervalCount: number;
  listenerCount: number;
  apiMode: "events";
  lastSequence: number;
  eventCount: number;
  eventPollIntervalMs: number;
  lastImmediateRefreshAt: string | null;
  optimisticEventCount: number;
  pendingOptimisticEventCount: number;
  confirmedOptimisticEventCount: number;
  lastOptimisticClientEventId: string | null;
  lastOptimisticActorName: string | null;
  lastResolvedActorName: string | null;
  lastActorFallbackReason: string | null;
  lastConfirmedClientEventId: string | null;
  lastTimelineMergeStrategy: string | null;
  lastTimelinePreservedCount: number;
  lastTimelineReplacedCount: number;
  lastTimelineAddedCount: number;
  lastTimelineUpdatedCount: number;
  lastTimelineClearedAt: string | null;
  timelineContainerRemountCount: number;
  timelinePinnedToBottom: boolean;
  lastScrollPreservedAt: string | null;
  lastAutoScrollReason: string | null;
  lastEventRoundTripMs: number | null;
  lastEventMergeCount: number;
  playbackListenerCount: number;
  playbackEventCount: number;
  seekDebounceMs: number;
  lastPlaybackEventType: string | null;
  lastPlaybackEventPostAt: string | null;
  lastPlaybackSuppressedReason: string | null;
  lastPauseDetectedAt: string | null;
  lastPlayDetectedAt: string | null;
  lastSeekStartedAt: string | null;
  lastSeekSettledAt: string | null;
  lastSeekFromSeconds: number | null;
  lastSeekToSeconds: number | null;
  lastSeekDirection: string | null;
  lastSeekSuppressedReason: string | null;
  seekIntentWindowMs: number;
  lastSeekIntentWindowMs: number;
  seekThresholdSeconds: number;
  lastSeekDeltaSeconds: number | null;
  lastSeekIntentAgeMs: number | null;
  lastSeekCandidateFromSeconds: number | null;
  lastSeekCandidateToSeconds: number | null;
  lastSeekCandidateReason: string | null;
  seekInProgress: boolean;
  seekSuppressPlaybackUntil: string | null;
  lastLocalPlaybackInputAt: string | null;
  lastLocalPlaybackInputType: string | null;
  lastLocalPlaybackInputTarget: string | null;
  lastLocalPlayPauseIntentAt: string | null;
  lastLocalSeekIntentAt: string | null;
  currentPlaybackItemId: string | null;
  currentPlaybackItemTitle: string | null;
  playbackStartLoggedForItem: string | null;
  lastPlaybackStartAt: string | null;
  lastPlaybackStartTitle: string | null;
  lastPlaybackStartItemId: string | null;
  startupGuardUntil: string | null;
  lastSeekEventAt: string | null;
  messageCount: number;
  lastEventPollAt: string | null;
  lastEventPostAt: string | null;
  lastError: string | null;
};

declare global {
  interface Window {
    ApiClient?: any;
    Dashboard?: any;
    JellyChatDebug?: JellyChatDebug;
    __JELLYCHAT_LOADED__?: boolean;
    __JELLYCHAT_REFRESH_INTERVAL_ID__?: number | null;
    __JELLYCHAT_LISTENERS_BOUND__?: boolean;
    __JELLYCHAT_PLAYBACK_LISTENERS_BOUND__?: boolean;
    __JELLYCHAT_HISTORY_PATCHED__?: boolean;
    __jellyChatLoaded?: boolean;
  }
}
