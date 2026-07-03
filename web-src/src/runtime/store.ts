import type { ChatActions, ChatMessage, ChatState, MessageGroupModel, MessageActionMenuState, PlaybackEventType, ReactionEvent, ReplyTarget, RoomEvent, SyncPlayContext, TimelineItem, TriggerIndicatorState, TypingRemoteUser } from "../types";
import { getEvents, normalizeChatMessage, postChatMessage, postEmojiReaction, postPlaybackEvent, postTypingUpdate } from "../api/events";
import { fetchJson } from "../api/jellyfin";
import { buildReplyTarget, buildTimelineItems, countDebugNodes, createClientEventId, formId, getValue, groupingWindowMs, groupMessages, inputId, isUsableDisplayName, logDebug, normalizeId, recordError, refreshIntervalMs } from "./util";
import { getActiveMountHost, getDrawerSide, isDrawerOpen, moveJellyChatRootToHost, scheduleLayoutUpdate, setDrawerSide, updateLayout } from "./layout";
import { getCurrentPlaybackSnapshot, installPlaybackActionLogging, scanPlaybackTarget } from "./playback";
import { addReactionOverlay, addRoomReactionOverlay, recordReactionReceived, setReactionParticipantCount } from "./reactions";
import { getDrawerBackgroundAlphaPreference, getDrawerWidthPreference, resetDrawerBackgroundAlpha as resetStoredDrawerBackgroundAlpha, resetDrawerPreferences as resetStoredDrawerPreferences, resetDrawerWidth as resetStoredDrawerWidth, saveDrawerBackgroundAlpha, saveDrawerWidth } from "./preferences";
import { restoreTriggerFocus } from "./trigger";

type Subscriber = (state: ChatState) => void;
type PlaybackPostRequest = {
  type: PlaybackEventType;
  positionSeconds?: number;
  fromSeconds?: number;
  itemId?: string;
  itemName?: string;
};

type CurrentSessionResolution = {
  session: any | null;
  sessionId: string;
  deviceId: string;
  sessionMatchCount: number;
  currentUserSessionCount: number;
  reason: string;
  error: string | null;
};

type JellyChatRoomResolution = {
  inGroup: boolean;
  groupId: string;
  groupName: string;
  sessionId: string;
  deviceId: string;
  participants: string[];
  exactMembership: boolean;
  membershipSource: string;
};

let refreshInProgress = false;
let sendInProgress = false;
let eventFetchInProgress = false;
let lastPollStartedAt = 0;
let historyEvents: RoomEvent[] = [];
let historyMessages: ChatMessage[] = [];
let groupedMessages: MessageGroupModel[] = [];
let timelineItems: TimelineItem[] = [];
let activeReplyTarget: ReplyTarget | null = null;
let highlightedMessageId: string | null = null;
let messageActionMenu: MessageActionMenuState = {
  open: false,
  message: null,
  x: 0,
  y: 0,
  copiedMessageId: null,
  feedback: ""
};
let lastEventGroupId = "";
let lastSequence = 0;
let optimisticSequence = 0;
let copiedFeedbackTimer = 0;
let highlightTimer = 0;
let cachedLocalActorName = "";
let cachedCurrentSessionIds: string[] = [];
const localClientEventIds = new Set<string>();
const seenReactionEventKeys = new Set<string>();
const typingTtlMs = 5000;
const typingIdleMs = 4000;
const typingRefreshMs = 2500;
let typingLocalActive = false;
let typingIdleTimer = 0;
let typingRefreshTimer = 0;
let typingExpiryTimer = 0;
let drawerResizeActive = false;
let remoteTypingUsers: TypingRemoteUser[] = [];
let triggerIndicator: TriggerIndicatorState = {
  unreadChatIndicatorActive: false,
  playbackActivityIndicatorActive: false,
  lastUnreadEventType: null,
  lastUnreadEventSeq: null,
  lastActivityEventType: null,
  lastActivityEventSeq: null
};
let currentSyncPlayContext: SyncPlayContext = {
  inGroup: false,
  groupId: "",
  groupName: "",
  sessionId: "",
  deviceId: "",
  participantCount: 1,
  unavailable: true,
  membershipSource: "startup"
};
let state: ChatState = {
  drawerOpen: false,
  drawerSide: getDrawerSide(),
  drawerWidth: getDrawerWidthPreference().width,
  drawerWidthSource: getDrawerWidthPreference().source,
  drawerResizeActive: false,
  drawerWidthMin: getDrawerWidthPreference().min,
  drawerWidthMax: getDrawerWidthPreference().max,
  drawerBackgroundAlpha: getDrawerBackgroundAlphaPreference(false).alpha,
  drawerBackgroundAlphaSource: getDrawerBackgroundAlphaPreference(false).source,
  syncPlay: currentSyncPlayContext,
  messages: [],
  groups: [],
  timelineItems: [],
  sending: false,
  triggerIndicator,
  typingLocalActive: false,
  typingRemoteUsers: [],
  typingTtlMs,
  replyTarget: null,
  replyTargetFound: false,
  messageActionMenu,
  highlightedMessageId: null
};

const subscribers = new Set<Subscriber>();
const slowPollIntervalMs = 2000;

function getNextOptimisticSequence(): number {
  optimisticSequence = Math.max(optimisticSequence + 1, lastSequence + 1);
  return optimisticSequence;
}

function setActorDebug(actorName: string, fallbackReason: string): void {
  if (!window.JellyChatDebug) {
    return;
  }

  window.JellyChatDebug.lastResolvedActorName = actorName || null;
  window.JellyChatDebug.lastActorFallbackReason = fallbackReason || null;
}

function getDrawerPreferenceSnapshot() {
  const width = getDrawerWidthPreference();
  const alpha = getDrawerBackgroundAlphaPreference(!!window.JellyChatDebug?.desktopVideoSafeMode);
  return { width, alpha };
}

function updatePresenceDebug(): void {
  if (!window.JellyChatDebug) {
    return;
  }

  window.JellyChatDebug.unreadChatIndicatorActive = triggerIndicator.unreadChatIndicatorActive;
  window.JellyChatDebug.playbackActivityIndicatorActive = triggerIndicator.playbackActivityIndicatorActive;
  window.JellyChatDebug.lastUnreadEventType = triggerIndicator.lastUnreadEventType;
  window.JellyChatDebug.lastUnreadEventSeq = triggerIndicator.lastUnreadEventSeq;
  window.JellyChatDebug.lastActivityEventType = triggerIndicator.lastActivityEventType;
  window.JellyChatDebug.lastActivityEventSeq = triggerIndicator.lastActivityEventSeq;
  window.JellyChatDebug.typingLocalActive = typingLocalActive;
  window.JellyChatDebug.typingRemoteCount = remoteTypingUsers.length;
  window.JellyChatDebug.typingRemoteUsers = remoteTypingUsers.map((user) => user.userName);
  window.JellyChatDebug.typingTtlMs = typingTtlMs;
}

function getReplyTargetFound(): boolean {
  return !!(activeReplyTarget && historyMessages.some((message) => message.id === activeReplyTarget?.eventId));
}

function getGroupedMessageCount(): number {
  return timelineItems.reduce((count, item) => {
    if (item.kind !== "messageGroup") {
      return count;
    }

    return count + (item.group.messages.length > 1 ? item.group.messages.length : 0);
  }, 0);
}

function updateMessageActionDebug(): void {
  if (!window.JellyChatDebug) {
    return;
  }

  window.JellyChatDebug.replyActive = !!activeReplyTarget;
  window.JellyChatDebug.replyTargetEventId = activeReplyTarget?.eventId || null;
  window.JellyChatDebug.replyTargetFound = getReplyTargetFound();
  window.JellyChatDebug.contextMenuOpen = messageActionMenu.open;
  window.JellyChatDebug.messageActionMenuOpen = messageActionMenu.open;
  window.JellyChatDebug.lastCopiedMessageId = messageActionMenu.copiedMessageId;
  window.JellyChatDebug.highlightedMessageId = highlightedMessageId;
  window.JellyChatDebug.groupedMessageCount = getGroupedMessageCount();
}

function scheduleTypingExpiry(): void {
  if (typingExpiryTimer) {
    window.clearTimeout(typingExpiryTimer);
    typingExpiryTimer = 0;
  }

  if (remoteTypingUsers.length === 0) {
    return;
  }

  const nextExpiry = Math.max(0, Math.min(...remoteTypingUsers.map((user) => user.expiresAtMs)) - Date.now());
  typingExpiryTimer = window.setTimeout(() => {
    typingExpiryTimer = 0;
    pruneRemoteTypingUsers();
    emit();
  }, Math.max(100, nextExpiry + 25));
}

function pruneRemoteTypingUsers(): void {
  const now = Date.now();
  const before = remoteTypingUsers.length;
  remoteTypingUsers = remoteTypingUsers.filter((user) => user.expiresAtMs > now && user.groupId === currentSyncPlayContext.groupId);
  if (before !== remoteTypingUsers.length) {
    updatePresenceDebug();
  }
  scheduleTypingExpiry();
}

function emit(): void {
  pruneRemoteTypingUsers();
  const prefs = getDrawerPreferenceSnapshot();
  const replyTargetFound = getReplyTargetFound();
  state = {
    drawerOpen: isDrawerOpen(),
    drawerSide: getDrawerSide(),
    drawerWidth: prefs.width.width,
    drawerWidthSource: prefs.width.source,
    drawerResizeActive,
    drawerWidthMin: prefs.width.min,
    drawerWidthMax: prefs.width.max,
    drawerBackgroundAlpha: prefs.alpha.alpha,
    drawerBackgroundAlphaSource: prefs.alpha.source,
    syncPlay: currentSyncPlayContext,
    messages: historyMessages.slice(),
    groups: groupedMessages.slice(),
    timelineItems: timelineItems.slice(),
    sending: sendInProgress,
    triggerIndicator: { ...triggerIndicator },
    typingLocalActive,
    typingRemoteUsers: remoteTypingUsers.slice(),
    typingTtlMs,
    replyTarget: activeReplyTarget ? { ...activeReplyTarget } : null,
    replyTargetFound,
    messageActionMenu: {
      ...messageActionMenu,
      message: messageActionMenu.message ? { ...messageActionMenu.message } : null
    },
    highlightedMessageId
  };

  if (window.JellyChatDebug) {
    window.JellyChatDebug.messageCount = historyMessages.length;
    window.JellyChatDebug.groupCount = groupedMessages.length;
    window.JellyChatDebug.timelineCount = timelineItems.length;
    window.JellyChatDebug.currentGroupId = currentSyncPlayContext.groupId;
    window.JellyChatDebug.lastSequence = lastSequence;
    window.JellyChatDebug.drawerWidth = prefs.width.width;
    window.JellyChatDebug.drawerWidthSource = prefs.width.source;
    window.JellyChatDebug.drawerWidthMin = prefs.width.min;
    window.JellyChatDebug.drawerWidthMax = prefs.width.max;
    window.JellyChatDebug.drawerResizeActive = drawerResizeActive;
    window.JellyChatDebug.drawerBackgroundAlpha = prefs.alpha.alpha;
    window.JellyChatDebug.drawerBackgroundAlphaSource = prefs.alpha.source;
    updateMessageActionDebug();
    updatePresenceDebug();
    countDebugNodes();
  }

  subscribers.forEach((subscriber) => subscriber(state));
}

export function getState(): ChatState {
  return state;
}

export function subscribe(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  subscriber(state);
  return () => subscribers.delete(subscriber);
}

function createRoomEvent(args: {
  id: string;
  type: string;
  groupId: string;
  userName: string;
  clientEventId: string;
  text?: string;
  emoji?: string;
  fromPositionTicks?: number;
  toPositionTicks?: number;
  positionSeconds?: number;
  itemId?: string;
  itemName?: string;
  replyTo?: ReplyTarget | null;
  optimistic?: boolean;
}): RoomEvent {
  const actorName = resolveEventActorName({
    userId: getCurrentUserId(),
    userName: args.userName,
    sessionId: "",
    clientEventId: args.clientEventId,
    optimistic: args.optimistic
  });
  return {
    id: args.id,
    sequence: args.optimistic ? getNextOptimisticSequence() : lastSequence,
    groupId: args.groupId,
    type: args.type,
    userId: getCurrentUserId(),
    userName: actorName,
    sessionId: "",
    createdAtUtc: new Date().toISOString(),
    text: args.text || "",
    replyTo: args.replyTo || null,
    emoji: args.emoji || "",
    playbackAction: args.type.replace("playback.", ""),
    fromPositionTicks: args.fromPositionTicks ?? null,
    toPositionTicks: args.toPositionTicks ?? null,
    positionSeconds: args.positionSeconds ?? null,
    itemId: args.itemId || "",
    itemName: args.itemName || "",
    clientEventId: args.clientEventId,
    eventKey: args.clientEventId ? "client:" + args.clientEventId : "id:" + args.id,
    isTyping: null,
    optimistic: args.optimistic
  };
}

function isCurrentUserEvent(event: Pick<RoomEvent, "userId" | "sessionId" | "clientEventId">): boolean {
  if (event.clientEventId && localClientEventIds.has(event.clientEventId)) {
    return true;
  }

  const eventSessionId = normalizeId(event.sessionId);
  const currentSessionIds = cachedCurrentSessionIds.map(normalizeId).filter(Boolean);
  if (eventSessionId && currentSessionIds.includes(eventSessionId)) {
    return true;
  }

  if (currentSessionIds.length > 0) {
    return false;
  }

  const currentUserId = normalizeId(getCurrentUserId());
  const eventUserId = normalizeId(event.userId);
  return !!(currentUserId && eventUserId && currentUserId === eventUserId);
}

function resolveEventActorName(event: Pick<RoomEvent, "userId" | "userName" | "sessionId" | "clientEventId"> & { optimistic?: boolean }, existing?: RoomEvent): string {
  if (existing && isUsableDisplayName(existing.userName)) {
    setActorDebug(existing.userName.trim(), "existing-event");
    return existing.userName.trim();
  }

  if (isUsableDisplayName(event.userName)) {
    setActorDebug(event.userName.trim(), "event-payload");
    return event.userName.trim();
  }

  if (event.optimistic || localClientEventIds.has(event.clientEventId) || isCurrentUserEvent(event)) {
    const local = resolveLocalActorName();
    return local.actorName;
  }

  setActorDebug("Someone", "anonymous-remote-event");
  return "Someone";
}

function getStableEventKey(event: RoomEvent): string {
  return event.eventKey
    || (event.clientEventId ? "client:" + event.clientEventId : "")
    || (event.sequence > 0 ? "sequence:" + event.sequence : "")
    || (event.id ? "id:" + event.id : "")
    || "fallback:" + event.type + ":" + event.createdAtUtc;
}

function mergeConfirmedEvent(existing: RoomEvent, incoming: RoomEvent): RoomEvent {
  const userName = resolveEventActorName(incoming, existing);
  return {
    ...existing,
    ...incoming,
    id: incoming.id || existing.id,
    sequence: incoming.sequence || existing.sequence,
    createdAtUtc: incoming.createdAtUtc || existing.createdAtUtc,
    text: incoming.text || existing.text,
    replyTo: incoming.replyTo || existing.replyTo || null,
    emoji: incoming.emoji || existing.emoji,
    fromPositionTicks: incoming.fromPositionTicks ?? existing.fromPositionTicks,
    toPositionTicks: incoming.toPositionTicks ?? existing.toPositionTicks,
    positionSeconds: incoming.positionSeconds ?? existing.positionSeconds,
    itemId: incoming.itemId || existing.itemId,
    itemName: incoming.itemName || existing.itemName,
    userName,
    clientEventId: incoming.clientEventId || existing.clientEventId,
    eventKey: existing.eventKey || getStableEventKey(existing),
    optimistic: false
  };
}

function getPendingOptimisticCount(): number {
  return historyEvents.filter((event) => event.optimistic).length;
}

function deriveTimelineFromHistory(): void {
  historyMessages = historyEvents
    .map(normalizeChatMessage)
    .filter((message): message is ChatMessage => !!(message && message.id && message.text));
  groupedMessages = groupMessages(historyMessages, groupingWindowMs);
  timelineItems = buildTimelineItems(historyEvents, groupingWindowMs);
  lastSequence = historyEvents.reduce((maxSequence, event) => event.optimistic ? maxSequence : Math.max(maxSequence, Number(event.sequence || 0)), lastSequence);
  optimisticSequence = Math.max(optimisticSequence, lastSequence);

  if (window.JellyChatDebug) {
    window.JellyChatDebug.lastSequence = lastSequence;
    window.JellyChatDebug.groupingWindowMs = groupingWindowMs;
    window.JellyChatDebug.lastGroupedAt = new Date().toISOString();
  }
}

function mergeHistoryEvents(events: RoomEvent[]): void {
  const byKey: Record<string, RoomEvent> = {};
  const clientIdToKey: Record<string, string> = {};
  const sequenceToKey: Record<string, string> = {};
  let addedCount = 0;
  let updatedCount = 0;
  let preservedCount = 0;
  let replacedCount = 0;
  let confirmedCount = Number(window.JellyChatDebug?.confirmedOptimisticEventCount || 0);
  let lastConfirmedClientEventId = "";
  historyEvents.forEach((event) => {
    event.eventKey = getStableEventKey(event);
    const key = event.eventKey;
    byKey[key] = event;
    if (event.clientEventId) clientIdToKey[event.clientEventId] = key;
    if (event.sequence > 0) sequenceToKey[String(event.sequence)] = key;
  });
  events.forEach((event) => {
    event.eventKey = getStableEventKey(event);
    const sequenceKey = event.sequence > 0 ? sequenceToKey[String(event.sequence)] : "";
    if (event.clientEventId && clientIdToKey[event.clientEventId]) {
      const key = clientIdToKey[event.clientEventId];
      const existing = byKey[key];
      byKey[key] = mergeConfirmedEvent(existing, event);
      if (existing.optimistic && !event.optimistic) {
        confirmedCount += 1;
        lastConfirmedClientEventId = event.clientEventId;
      }
      updatedCount += 1;
      preservedCount += 1;
      return;
    }

    if (sequenceKey && byKey[sequenceKey]) {
      const existing = byKey[sequenceKey];
      byKey[sequenceKey] = {
        ...existing,
        ...event,
        userName: resolveEventActorName(event, existing),
        eventKey: existing.eventKey || event.eventKey,
        optimistic: existing.optimistic && event.optimistic
      };
      updatedCount += 1;
      preservedCount += 1;
      return;
    }

    const key = event.eventKey;
    if (byKey[key]) {
      byKey[key] = {
        ...byKey[key],
        ...event,
        userName: resolveEventActorName(event, byKey[key]),
        eventKey: byKey[key].eventKey || event.eventKey
      };
      updatedCount += 1;
      preservedCount += 1;
    } else {
      event.userName = resolveEventActorName(event);
      byKey[key] = event;
      addedCount += 1;
    }
    if (event.clientEventId) clientIdToKey[event.clientEventId] = key;
    if (event.sequence > 0) sequenceToKey[String(event.sequence)] = key;
  });

  historyEvents = Object.keys(byKey)
    .map((id) => byKey[id])
    .sort((left, right) => {
      if (left.optimistic !== right.optimistic) {
        return left.optimistic ? 1 : -1;
      }

      const leftSequence = Number(left.sequence || 0);
      const rightSequence = Number(right.sequence || 0);
      return leftSequence !== rightSequence
        ? leftSequence - rightSequence
        : String(left.createdAtUtc).localeCompare(String(right.createdAtUtc));
    });

  if (historyEvents.length > 100) {
    historyEvents = historyEvents.slice(historyEvents.length - 100);
  }

  deriveTimelineFromHistory();
  if (window.JellyChatDebug) {
    window.JellyChatDebug.lastEventMergeCount = events.length;
    window.JellyChatDebug.optimisticEventCount = getPendingOptimisticCount();
    window.JellyChatDebug.pendingOptimisticEventCount = getPendingOptimisticCount();
    window.JellyChatDebug.confirmedOptimisticEventCount = confirmedCount;
    window.JellyChatDebug.lastConfirmedClientEventId = lastConfirmedClientEventId || window.JellyChatDebug.lastConfirmedClientEventId || null;
    window.JellyChatDebug.lastTimelineMergeStrategy = "stable-event-key";
    window.JellyChatDebug.lastTimelinePreservedCount = preservedCount;
    window.JellyChatDebug.lastTimelineReplacedCount = replacedCount;
    window.JellyChatDebug.lastTimelineAddedCount = addedCount;
    window.JellyChatDebug.lastTimelineUpdatedCount = updatedCount;
  }
  emit();
}

function updateLastSequenceFromEvents(events: RoomEvent[]): void {
  events.forEach((roomEvent) => {
    lastSequence = Math.max(lastSequence, Number(roomEvent.sequence || 0));
  });
  optimisticSequence = Math.max(optimisticSequence, lastSequence);

  if (window.JellyChatDebug) {
    window.JellyChatDebug.lastSequence = lastSequence;
    window.JellyChatDebug.eventCount = Number(window.JellyChatDebug.eventCount || 0) + events.length;
  }
}

function getReactionEventKey(event: RoomEvent): string {
  return event.clientEventId || event.eventKey || (event.sequence > 0 ? "sequence:" + event.sequence : "id:" + event.id);
}

function isReactionEvent(event: RoomEvent): boolean {
  return event.type === "reaction.emoji" && !!event.emoji;
}

function isTypingEvent(event: RoomEvent): boolean {
  return event.type === "typing.update";
}

function isPlaybackRoomEvent(event: RoomEvent): boolean {
  return event.type === "playback.start"
    || event.type === "playback.play"
    || event.type === "playback.pause"
    || event.type === "playback.seek";
}

function recordSeenReactionEvents(events: RoomEvent[]): void {
  events.filter(isReactionEvent).forEach((event) => {
    seenReactionEventKeys.add(getReactionEventKey(event));
  });
}

function processReactionEvents(events: RoomEvent[], skipOverlay: boolean): void {
  const reactionEvents = events.filter(isReactionEvent);
  if (reactionEvents.length === 0) {
    return;
  }

  if (skipOverlay) {
    recordSeenReactionEvents(reactionEvents);
    return;
  }

  reactionEvents.forEach((event) => {
    const key = getReactionEventKey(event);
    if (seenReactionEventKeys.has(key)) {
      return;
    }

    seenReactionEventKeys.add(key);
    recordReactionReceived(event);
    if (skipOverlay || localClientEventIds.has(event.clientEventId)) {
      return;
    }

    addRoomReactionOverlay(event);
  });
}

function typingUserKey(event: RoomEvent): string {
  return event.sessionId || event.userId || event.clientEventId || event.eventKey;
}

function processTypingEvents(events: RoomEvent[]): void {
  const typingEvents = events.filter(isTypingEvent);
  if (typingEvents.length === 0) {
    return;
  }

  typingEvents.forEach((event) => {
    if (event.groupId !== currentSyncPlayContext.groupId || isCurrentUserEvent(event) || localClientEventIds.has(event.clientEventId)) {
      return;
    }

    const key = typingUserKey(event);
    if (!key) {
      return;
    }

    if (event.isTyping === false) {
      remoteTypingUsers = remoteTypingUsers.filter((user) => user.key !== key);
      return;
    }

    if (event.isTyping !== true) {
      return;
    }

    const user: TypingRemoteUser = {
      key,
      userName: isUsableDisplayName(event.userName) ? event.userName.trim() : "Someone",
      userId: event.userId,
      sessionId: event.sessionId,
      groupId: event.groupId,
      expiresAtMs: Date.now() + typingTtlMs
    };
    remoteTypingUsers = remoteTypingUsers.filter((entry) => entry.key !== key).concat(user);
  });

  if (window.JellyChatDebug) {
    window.JellyChatDebug.lastTypingEventAt = new Date().toISOString();
  }
  pruneRemoteTypingUsers();
  updatePresenceDebug();
}

function clearTriggerIndicators(): void {
  triggerIndicator = {
    unreadChatIndicatorActive: false,
    playbackActivityIndicatorActive: false,
    lastUnreadEventType: null,
    lastUnreadEventSeq: null,
    lastActivityEventType: null,
    lastActivityEventSeq: null
  };
  updatePresenceDebug();
}

function recordClosedDrawerIndicators(events: RoomEvent[], skipHistory: boolean): void {
  if (skipHistory || isDrawerOpen()) {
    return;
  }

  events.forEach((event) => {
    if (event.groupId !== currentSyncPlayContext.groupId || isReactionEvent(event) || isTypingEvent(event) || isCurrentUserEvent(event) || localClientEventIds.has(event.clientEventId)) {
      return;
    }

    if (event.type === "chat.message") {
      triggerIndicator = {
        ...triggerIndicator,
        unreadChatIndicatorActive: true,
        playbackActivityIndicatorActive: false,
        lastUnreadEventType: event.type,
        lastUnreadEventSeq: event.sequence || null
      };
      return;
    }

    if (isPlaybackRoomEvent(event) && !triggerIndicator.unreadChatIndicatorActive) {
      triggerIndicator = {
        ...triggerIndicator,
        playbackActivityIndicatorActive: true,
        lastActivityEventType: event.type,
        lastActivityEventSeq: event.sequence || null
      };
    }
  });

  updatePresenceDebug();
}

async function fetchChatEvents(forceFull: boolean): Promise<void> {
  if (eventFetchInProgress || !currentSyncPlayContext.inGroup || !currentSyncPlayContext.groupId) {
    return;
  }

  let shouldFetchFull = forceFull;
  if (lastEventGroupId !== currentSyncPlayContext.groupId) {
    lastEventGroupId = currentSyncPlayContext.groupId;
    lastSequence = 0;
    optimisticSequence = 0;
    shouldFetchFull = true;
  }

  eventFetchInProgress = true;
  try {
    const startedAt = Date.now();
    const events = await getEvents(currentSyncPlayContext.groupId, currentSyncPlayContext.sessionId, lastSequence, 100, shouldFetchFull);
    if (window.JellyChatDebug) {
      window.JellyChatDebug.lastEventPollAt = new Date().toISOString();
      window.JellyChatDebug.lastEventRoundTripMs = Date.now() - startedAt;
    }
    updateLastSequenceFromEvents(events);
    processReactionEvents(events, shouldFetchFull);
    processTypingEvents(events);
    recordClosedDrawerIndicators(events, shouldFetchFull);
    const timelineEvents = events.filter((event) => !isReactionEvent(event) && !isTypingEvent(event));
    if (timelineEvents.length > 0 || shouldFetchFull) {
      mergeHistoryEvents(timelineEvents);
    } else {
      emit();
    }
  } catch (err) {
    logDebug("Failed to fetch JellyChat events", err);
  } finally {
    eventFetchInProgress = false;
  }
}

function setCurrentSyncPlayContext(context: SyncPlayContext): void {
  const wasInGroup = currentSyncPlayContext.inGroup;
  const groupChanged = context.groupId !== currentSyncPlayContext.groupId;
  currentSyncPlayContext = {
    inGroup: !!context.inGroup,
    groupId: context.groupId || "",
    groupName: context.groupName || "",
    sessionId: context.sessionId || "",
    deviceId: context.deviceId || "",
    participantCount: Math.max(1, Math.floor(context.participantCount || 1)),
    unavailable: !!context.unavailable,
    membershipSource: context.membershipSource || ""
  };
  setReactionParticipantCount(currentSyncPlayContext.participantCount);
  cachedCurrentSessionIds = currentSyncPlayContext.sessionId ? [currentSyncPlayContext.sessionId] : [];

  if (!currentSyncPlayContext.inGroup || groupChanged) {
    const hadTimeline = historyEvents.length > 0 || timelineItems.length > 0;
    clearTriggerIndicators();
    remoteTypingUsers = [];
    clearLocalTypingTimers();
    typingLocalActive = false;
    activeReplyTarget = null;
    highlightedMessageId = null;
    messageActionMenu = {
      open: false,
      message: null,
      x: 0,
      y: 0,
      copiedMessageId: messageActionMenu.copiedMessageId,
      feedback: ""
    };
    historyEvents = [];
    historyMessages = [];
    groupedMessages = [];
    timelineItems = [];
    lastSequence = 0;
    optimisticSequence = 0;
    lastEventGroupId = currentSyncPlayContext.groupId;
    seenReactionEventKeys.clear();
    if (window.JellyChatDebug) {
      if (hadTimeline) {
        window.JellyChatDebug.lastTimelineClearedAt = new Date().toISOString();
      }
      window.JellyChatDebug.optimisticEventCount = 0;
      window.JellyChatDebug.pendingOptimisticEventCount = 0;
    }
  }

  if (window.JellyChatDebug) {
    window.JellyChatDebug.currentSessionId = currentSyncPlayContext.sessionId;
    window.JellyChatDebug.currentDeviceId = currentSyncPlayContext.deviceId;
    window.JellyChatDebug.syncPlayMembershipSource = currentSyncPlayContext.membershipSource;
  }

  emit();
  if (!wasInGroup && currentSyncPlayContext.inGroup && isDrawerOpen()) {
    focusComposer("group-joined");
  }
}

function getCurrentUserId(): string {
  if (!window.ApiClient) return "";
  if (typeof window.ApiClient.getCurrentUserId === "function") return window.ApiClient.getCurrentUserId() || "";
  if (typeof window.ApiClient.userId === "function") return window.ApiClient.userId() || "";
  if (typeof window.ApiClient._userId === "string") return window.ApiClient._userId;
  if (window.ApiClient._serverInfo && typeof window.ApiClient._serverInfo.UserId === "string") return window.ApiClient._serverInfo.UserId;
  return "";
}

function getCurrentUserIds(): string[] {
  const raw = getCurrentUserId();
  const ids = raw ? [raw] : [];
  const normalized = normalizeId(raw);
  if (normalized && !ids.includes(normalized)) ids.push(normalized);
  return ids;
}

function getCurrentUserName(): string {
  if (!window.ApiClient) return "";
  const serverInfo = window.ApiClient._serverInfo;
  if (serverInfo && typeof serverInfo.UserName === "string" && serverInfo.UserName.length > 0) return serverInfo.UserName;
  if (window.Dashboard && window.Dashboard.getCurrentUser) {
    const currentUser = window.Dashboard.getCurrentUser();
    if (currentUser && typeof currentUser.Name === "string" && currentUser.Name.length > 0) return currentUser.Name;
  }
  return "";
}

function getSessionUserName(session: any): string {
  const value = (session && session.UserName)
    || (session && session.User && session.User.Name)
    || (session && session.User && session.User.Username)
    || "";
  return typeof value === "string" ? value.trim() : "";
}

function resolveLocalActorName(sessions: any[] = [], currentSession: any | null = null): { actorName: string; fallbackReason: string } {
  const apiUserName = getCurrentUserName();
  if (isUsableDisplayName(apiUserName)) {
    cachedLocalActorName = apiUserName.trim();
    setActorDebug(cachedLocalActorName, "api-current-user");
    return { actorName: cachedLocalActorName, fallbackReason: "api-current-user" };
  }

  const currentSessionName = getSessionUserName(currentSession);
  if (isUsableDisplayName(currentSessionName)) {
    cachedLocalActorName = currentSessionName;
    setActorDebug(cachedLocalActorName, "current-session");
    return { actorName: cachedLocalActorName, fallbackReason: "current-session" };
  }

  const matchingSessionName = sessions
    .filter(matchesCurrentUser)
    .map(getSessionUserName)
    .find(isUsableDisplayName);
  if (matchingSessionName) {
    cachedLocalActorName = matchingSessionName;
    setActorDebug(cachedLocalActorName, "matching-session");
    return { actorName: cachedLocalActorName, fallbackReason: "matching-session" };
  }

  if (isUsableDisplayName(cachedLocalActorName)) {
    setActorDebug(cachedLocalActorName, "cached-local-user");
    return { actorName: cachedLocalActorName, fallbackReason: "cached-local-user" };
  }

  setActorDebug("Someone", "missing-local-user");
  return { actorName: "Someone", fallbackReason: "missing-local-user" };
}

function getCurrentDeviceId(): string {
  if (!window.ApiClient) return "";
  const host = window as Window & Record<string, any>;
  const candidates = [
    callApiClientString("deviceId"),
    callApiClientString("getDeviceId"),
    readApiClientString("deviceId"),
    readApiClientString("_deviceId"),
    readApiClientString("DeviceId"),
    readApiClientString("_serverInfo.DeviceId"),
    readApiClientString("_serverInfo.deviceId"),
    readApiClientString("_appInfo.DeviceId"),
    readApiClientString("_appInfo.deviceId"),
    readNestedString(host, "appHost.deviceId"),
    callNestedString(host, "appHost.deviceId"),
    readStoredDeviceId()
  ];
  return candidates.map((candidate) => candidate.trim()).find(Boolean) || "";
}

function callApiClientString(methodName: string): string {
  const method = window.ApiClient && window.ApiClient[methodName];
  if (typeof method !== "function") return "";
  try {
    const value = method.call(window.ApiClient);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function readApiClientString(path: string): string {
  return readNestedString(window.ApiClient, path);
}

function callNestedString(source: any, path: string): string {
  const value = readNestedValue(source, path);
  if (typeof value !== "function") return "";
  try {
    const result = value.call(source);
    return typeof result === "string" ? result : "";
  } catch {
    return "";
  }
}

function readNestedString(source: any, path: string): string {
  const value = readNestedValue(source, path);
  return typeof value === "string" ? value : "";
}

function readNestedValue(source: any, path: string): any {
  return path.split(".").filter(Boolean).reduce((current, part) => current && current[part], source);
}

function readStoredDeviceId(): string {
  try {
    const keys = ["deviceId", "jellyfin.deviceId", "jellyfin_device_id"];
    for (const key of keys) {
      const value = window.localStorage?.getItem(key) || "";
      if (value) return value;
    }
  } catch {
    // Storage may be unavailable in locked-down WebViews.
  }

  return "";
}

function matchesCurrentUser(session: any): boolean {
  const currentUserIds = getCurrentUserIds();
  if (!currentUserIds.length) return false;
  const sessionUserId = (session && session.UserId) || (session && session.User && session.User.Id) || "";
  return currentUserIds.some((id) => normalizeId(id) === normalizeId(sessionUserId));
}

function getSessionId(session: any): string {
  const value = session && session.Id;
  return typeof value === "string" ? value.trim() : "";
}

function getSessionDeviceId(session: any): string {
  const value = (session && session.DeviceId) || (session && session.Device && session.Device.Id) || "";
  return typeof value === "string" ? value.trim() : "";
}

function resolveCurrentSession(sessions: any[], groups: any[] = []): CurrentSessionResolution {
  const deviceId = getCurrentDeviceId();
  const normalizedDeviceId = normalizeId(deviceId);
  const matchingUserSessions = sessions.filter(matchesCurrentUser);

  if (matchingUserSessions.length === 0) {
    return {
      session: null,
      sessionId: "",
      deviceId,
      sessionMatchCount: 0,
      currentUserSessionCount: 0,
      reason: "no-current-user-session",
      error: "No session matched the current user."
    };
  }

  if (normalizedDeviceId) {
    const deviceMatches = matchingUserSessions.filter((session) => normalizeId(getSessionDeviceId(session)) === normalizedDeviceId);
    const deviceResolution = resolveSessionCandidate(deviceMatches, groups, deviceId, "user-device", matchingUserSessions.length);
    if (deviceResolution) {
      return deviceResolution;
    }

    if (deviceMatches.length > 1) {
      return {
        session: null,
        sessionId: "",
        deviceId,
        sessionMatchCount: deviceMatches.length,
        currentUserSessionCount: matchingUserSessions.length,
        reason: "ambiguous-device-session",
        error: "Multiple sessions matched the current device."
      };
    }
  }

  const userResolution = resolveSessionCandidate(matchingUserSessions, groups, deviceId, normalizedDeviceId ? "user-session-device-missing" : "user-session", matchingUserSessions.length);
  if (userResolution && matchingUserSessions.length === 1) {
    return userResolution;
  }

  return {
    session: null,
    sessionId: "",
    deviceId,
    sessionMatchCount: matchingUserSessions.length,
    currentUserSessionCount: matchingUserSessions.length,
    reason: "ambiguous-user-session",
    error: "Multiple sessions matched the current user and no current device match was available."
  };
}

function resolveSessionCandidate(candidates: any[], groups: any[], fallbackDeviceId: string, reasonPrefix: string, currentUserSessionCount: number): CurrentSessionResolution | null {
  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return createSessionResolution(candidates[0], candidates.length, currentUserSessionCount, fallbackDeviceId, reasonPrefix, null);
  }

  const withSessionGroup = candidates.filter((session) => extractSyncPlayGroupId(session));
  if (withSessionGroup.length === 1) {
    return createSessionResolution(withSessionGroup[0], candidates.length, currentUserSessionCount, fallbackDeviceId, reasonPrefix + "-syncplay-session", null);
  }

  const withGroupParticipant = groups.length > 0
    ? candidates.filter((session) => groupsContainCurrentSession(groups, session))
    : [];
  if (withGroupParticipant.length === 1) {
    return createSessionResolution(withGroupParticipant[0], candidates.length, currentUserSessionCount, fallbackDeviceId, reasonPrefix + "-syncplay-participant", null);
  }

  const activeCandidates = withSessionGroup.length > 0 ? withSessionGroup : withGroupParticipant;
  if (activeCandidates.length > 1 && reasonPrefix.indexOf("user-device") === 0) {
    return createSessionResolution(sortSessionsByActivity(activeCandidates)[0], candidates.length, currentUserSessionCount, fallbackDeviceId, reasonPrefix + "-latest-active-session", null);
  }

  return null;
}

function createSessionResolution(session: any, matchCount: number, currentUserSessionCount: number, fallbackDeviceId: string, reason: string, error: string | null): CurrentSessionResolution {
  return {
    session,
    sessionId: getSessionId(session),
    deviceId: getSessionDeviceId(session) || fallbackDeviceId,
    sessionMatchCount: matchCount,
    currentUserSessionCount,
    reason,
    error
  };
}

function canUseUserParticipantMatch(resolution: CurrentSessionResolution): boolean {
  return resolution.currentUserSessionCount === 1;
}

function sortSessionsByActivity(sessions: any[]): any[] {
  return sessions.slice().sort((left, right) => getSessionActivityMs(right) - getSessionActivityMs(left));
}

function getSessionActivityMs(session: any): number {
  const value = (session && session.LastActivityDate) || (session && session.LastPlaybackCheckIn) || "";
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function collectStringValues(value: unknown, output: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStringValues(item, output));
    return;
  }
  if (typeof value === "object") {
    Object.keys(value as Record<string, unknown>).forEach((key) => collectStringValues((value as Record<string, unknown>)[key], output));
  }
}

function normalizeSessionsResponse(response: unknown): any[] {
  if (Array.isArray(response)) return response;
  if (response && typeof response === "object" && Array.isArray((response as { Items?: unknown[] }).Items)) return (response as { Items: unknown[] }).Items;
  if (response && typeof response === "object" && Array.isArray((response as { Sessions?: unknown[] }).Sessions)) return (response as { Sessions: unknown[] }).Sessions;
  return [];
}

function normalizeGroupsResponse(response: unknown): any[] {
  if (Array.isArray(response)) return response;
  if (response && typeof response === "object" && Array.isArray((response as { Groups?: unknown[] }).Groups)) return (response as { Groups: unknown[] }).Groups;
  if (response && typeof response === "object" && Array.isArray((response as { Items?: unknown[] }).Items)) return (response as { Items: unknown[] }).Items;
  return [];
}

function objectContainsString(value: unknown, expectedLowerValue: string): boolean {
  if (!value || !expectedLowerValue) return false;
  if (typeof value === "string") {
    const actual = normalizeId(value);
    const expected = normalizeId(expectedLowerValue);
    return !!(actual && expected && actual === expected);
  }
  if (Array.isArray(value)) return value.some((item) => objectContainsString(item, expectedLowerValue));
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).some((key) => objectContainsString((value as Record<string, unknown>)[key], expectedLowerValue));
  return false;
}

function extractSyncPlayGroupId(session: any): string {
  const playState = session && session.PlayState;
  const groupId = (session && session.PlayState && session.PlayState.SyncPlayGroupId)
    || (session && session.PlayState && session.PlayState.SyncPlayGroup)
    || (session && session.SyncPlayGroupId)
    || (session && session.SyncPlayGroup)
    || (session && session.SyncPlayGroup && session.SyncPlayGroup.Id)
    || (playState && playState.SyncPlayGroup && playState.SyncPlayGroup.Id)
    || (playState && playState.SyncPlayInfo && playState.SyncPlayInfo.GroupId)
    || (session && session.AdditionalData && session.AdditionalData.SyncPlayGroupId)
    || "";
  return typeof groupId === "string" ? groupId : "";
}

function buildSessionsPaths(): string[] {
  const paths = ["Sessions"];
  const currentDeviceId = getCurrentDeviceId();
  if (currentDeviceId) {
    const path = "Sessions?deviceId=" + encodeURIComponent(currentDeviceId);
    if (!paths.includes(path)) paths.push(path);
  }
  getCurrentUserIds().forEach((id) => {
    const path = "Sessions?UserId=" + encodeURIComponent(id);
    if (!paths.includes(path)) paths.push(path);
  });
  return paths;
}

async function fetchSessions(): Promise<any[]> {
  const sessionsById: Record<string, any> = {};
  const sessionsWithoutId: any[] = [];
  for (const path of buildSessionsPaths()) {
    try {
      const sessions = normalizeSessionsResponse(await fetchJson(path));
      sessions.forEach((session) => {
        const sessionId = session && session.Id;
        if (typeof sessionId === "string" && sessionId.length > 0) {
          sessionsById[sessionId] = session;
          return;
        }
        sessionsWithoutId.push(session);
      });
    } catch (err) {
      logDebug("Failed to fetch sessions path", { path, error: err });
    }
  }

  const deduped = Object.keys(sessionsById).map((id) => sessionsById[id]);
  return deduped.length === 0 && sessionsWithoutId.length > 0 ? sessionsWithoutId : deduped;
}

function isLikelySessionId(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return /^[a-f0-9]{32}$/i.test(trimmed) || /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(trimmed);
}

function resolveSyncPlayGroupId(group: any): string {
  const direct = (group && group.Id) || (group && group.GroupId) || (group && group.Group && group.Group.Id) || (group && group.GroupInfo && group.GroupInfo.Id) || "";
  if (typeof direct === "string" && direct.length > 0) return direct;
  const values: string[] = [];
  collectStringValues(group, values);
  return values.find(isLikelySessionId) || "";
}

function resolveSyncPlayGroupName(group: any): string {
  const direct = (group && group.GroupName)
    || (group && group.Name)
    || (group && group.DisplayName)
    || (group && group.Group && group.Group.GroupName)
    || (group && group.Group && group.Group.Name)
    || (group && group.GroupInfo && group.GroupInfo.GroupName)
    || (group && group.GroupInfo && group.GroupInfo.Name)
    || "";
  return typeof direct === "string" ? direct : "";
}

function getGroupIdsForCurrentSession(session: any | null): string[] {
  const groupId = extractSyncPlayGroupId(session);
  return groupId ? [groupId] : [];
}

function findGroupsByGroupIds(groups: any[], groupIds: string[]): any[] {
  if (!groups.length || !groupIds.length) return [];
  const normalizedGroupIds = groupIds.map(normalizeId).filter(Boolean);
  return groups.filter((group) => normalizedGroupIds.includes(normalizeId(resolveSyncPlayGroupId(group))));
}

function buildCurrentSessionIdentityTokens(session: any | null, includeUserTokens = false): string[] {
  const tokens: string[] = [];
  if (!session) {
    return tokens;
  }

  [
    getSessionId(session),
    getSessionDeviceId(session),
    session && session.DeviceName,
    session && session.Client
  ].forEach((value) => {
    if (typeof value === "string" && value.trim().length > 0 && !tokens.includes(value.trim())) {
      tokens.push(value.trim());
    }
  });

  if (includeUserTokens) {
    [
      session && session.UserId,
      session && session.UserName,
      session && session.User && session.User.Id,
      session && session.User && session.User.Name,
      getCurrentUserId(),
      getCurrentUserName()
    ].forEach((value) => {
      if (typeof value === "string" && value.trim().length > 0 && !tokens.includes(value.trim())) {
        tokens.push(value.trim());
      }
    });
  }

  return tokens;
}

function groupsContainCurrentSession(groups: any[], session: any | null, includeUserTokens = false): boolean {
  const tokens = buildCurrentSessionIdentityTokens(session, includeUserTokens);
  if (tokens.length === 0) return false;
  return groups.some((group) => tokens.some((token) => groupContainsParticipantToken(group, token)));
}

function groupContainsParticipantToken(group: any, token: string): boolean {
  const participants = group && group.Participants;
  if (Array.isArray(participants)) {
    return participants.some((participant) => objectContainsString(participant, token));
  }

  return objectContainsString(group, token);
}

function extractParticipantsFromGroups(groups: any[]): string[] {
  const participants: string[] = [];
  groups.forEach((group) => {
    const groupParticipants = group && group.Participants;
    if (!Array.isArray(groupParticipants)) return;
    groupParticipants.forEach((participant: any) => {
      if (typeof participant === "string" && participant.length > 0 && !participants.includes(participant)) {
        participants.push(participant);
        return;
      }
      if (participant && typeof participant === "object") {
        const userName = participant.UserName || (participant.User && participant.User.Name) || "";
        const deviceName = participant.DeviceName || participant.Device || "";
        if (typeof userName === "string" && userName.length > 0 && !participants.includes(userName)) participants.push(userName);
        if (typeof deviceName === "string" && deviceName.length > 0 && !participants.includes(deviceName)) participants.push(deviceName);
      }
    });
  });
  return participants;
}

function normalizeRoomResolution(response: unknown): JellyChatRoomResolution | null {
  if (!response || typeof response !== "object") {
    return null;
  }

  const rawParticipants = getValue(response, "Participants", "participants");
  const participants = Array.isArray(rawParticipants)
    ? rawParticipants.map((participant) => String(participant || "").trim()).filter(Boolean)
    : [];

  return {
    inGroup: getValue(response, "InGroup", "inGroup") === true,
    groupId: String(getValue(response, "GroupId", "groupId") || "").trim(),
    groupName: String(getValue(response, "GroupName", "groupName") || "").trim(),
    sessionId: String(getValue(response, "SessionId", "sessionId") || "").trim(),
    deviceId: String(getValue(response, "DeviceId", "deviceId") || "").trim(),
    participants,
    exactMembership: getValue(response, "ExactMembership", "exactMembership") === true,
    membershipSource: String(getValue(response, "MembershipSource", "membershipSource") || "").trim()
  };
}

async function fetchJellyChatRoom(senderSessionId: string): Promise<JellyChatRoomResolution | null> {
  const query = senderSessionId ? "?senderSessionId=" + encodeURIComponent(senderSessionId) : "";
  try {
    return normalizeRoomResolution(await fetchJson("JellyChat/Room" + query));
  } catch (err) {
    logDebug("JellyChat room request failed", err);
    return null;
  }
}

function getGroupParticipantCount(group: any): number {
  const participants = group && group.Participants;
  return Array.isArray(participants) && participants.length > 0 ? participants.length : 1;
}

function getEventPollIntervalMs(): number {
  return isDrawerOpen() && currentSyncPlayContext.inGroup && currentSyncPlayContext.groupId
    ? refreshIntervalMs
    : slowPollIntervalMs;
}

async function refreshEventsImmediately(): Promise<void> {
  if (!currentSyncPlayContext.inGroup || !currentSyncPlayContext.groupId) {
    return;
  }

  if (window.JellyChatDebug) {
    window.JellyChatDebug.lastImmediateRefreshAt = new Date().toISOString();
  }
  await fetchChatEvents(false);
}

async function resolveEventPostContext(): Promise<{ senderSessionId: string; groupId: string; participants: string[]; userName: string } | null> {
  const sessions = await fetchSessions();
  let groups: any[] = [];
  try {
    groups = normalizeGroupsResponse(await fetchJson("SyncPlay/List"));
  } catch (err) {
    logDebug("SyncPlay list request failed before JellyChat post", err);
  }
  const resolution = resolveCurrentSession(sessions, groups);
  const currentSession = resolution.session;
  cachedCurrentSessionIds = resolution.sessionId ? [resolution.sessionId] : [];
  if (window.JellyChatDebug) {
    window.JellyChatDebug.currentSessionId = resolution.sessionId;
    window.JellyChatDebug.currentDeviceId = resolution.deviceId;
    window.JellyChatDebug.syncPlaySessionMatchCount = resolution.sessionMatchCount;
    window.JellyChatDebug.syncPlayCurrentUserSessionCount = resolution.currentUserSessionCount;
    window.JellyChatDebug.lastSyncPlayResolutionError = resolution.error;
  }

  if (!currentSession || !resolution.sessionId) {
    return null;
  }

  const room = await fetchJellyChatRoom(resolution.sessionId);
  if (room && window.JellyChatDebug) {
    window.JellyChatDebug.syncPlayMembershipSource = room.membershipSource || window.JellyChatDebug.syncPlayMembershipSource;
  }

  if (room?.exactMembership && !room.inGroup) {
    return null;
  }

  if (room?.inGroup && room.groupId) {
    const actor = resolveLocalActorName(sessions, currentSession);
    return {
      senderSessionId: room.sessionId || resolution.sessionId,
      groupId: room.groupId,
      participants: room.participants,
      userName: actor.actorName
    };
  }

  const groupIds = getGroupIdsForCurrentSession(currentSession);
  const groupsBySessionGroupIds = findGroupsByGroupIds(groups, groupIds);
  const allowUserParticipantMatch = canUseUserParticipantMatch(resolution);
  const relevantGroups = groups.filter((group) => groupsContainCurrentSession([group], currentSession, allowUserParticipantMatch));
  const groupsForSend = groupsBySessionGroupIds.length > 0 ? groupsBySessionGroupIds : relevantGroups;
  const participants = extractParticipantsFromGroups(groupsForSend);
  const preferredGroupId = groupIds.length > 0
    ? groupIds[0]
    : (resolveSyncPlayGroupId(groupsForSend[0]) || currentSyncPlayContext.groupId);

  if (!preferredGroupId) {
    return null;
  }

  const actor = resolveLocalActorName(sessions, currentSession);
  return {
    senderSessionId: resolution.sessionId,
    groupId: preferredGroupId,
    participants,
    userName: actor.actorName
  };
}

function clearLocalTypingTimers(): void {
  if (typingIdleTimer) {
    window.clearTimeout(typingIdleTimer);
    typingIdleTimer = 0;
  }

  if (typingRefreshTimer) {
    window.clearTimeout(typingRefreshTimer);
    typingRefreshTimer = 0;
  }
}

async function postLocalTypingState(isTyping: boolean, reason: string): Promise<void> {
  if (!currentSyncPlayContext.inGroup || !currentSyncPlayContext.groupId) {
    return;
  }

  try {
    const postContext = await resolveEventPostContext();
    if (!postContext) {
      return;
    }

    const clientEventId = createClientEventId();
    localClientEventIds.add(clientEventId);
    await postTypingUpdate({
      groupId: postContext.groupId,
      senderSessionId: postContext.senderSessionId,
      isTyping,
      participants: postContext.participants,
      clientEventId
    });
    if (window.JellyChatDebug) {
      window.JellyChatDebug.lastEventPostAt = new Date().toISOString();
      window.JellyChatDebug.lastTypingEventAt = new Date().toISOString();
      window.JellyChatDebug.lastFocusReason = reason;
    }
  } catch (err) {
    logDebug("Failed to send typing update", err);
  }
}

function scheduleTypingRefresh(): void {
  if (typingRefreshTimer) {
    window.clearTimeout(typingRefreshTimer);
  }

  typingRefreshTimer = window.setTimeout(() => {
    typingRefreshTimer = 0;
    if (!typingLocalActive || !isDrawerOpen()) {
      return;
    }

    void postLocalTypingState(true, "typing-refresh");
    scheduleTypingRefresh();
  }, typingRefreshMs);
}

function stopLocalTyping(reason: string): void {
  clearLocalTypingTimers();
  if (!typingLocalActive) {
    updatePresenceDebug();
    return;
  }

  typingLocalActive = false;
  updatePresenceDebug();
  emit();
  void postLocalTypingState(false, reason);
}

function noteLocalTyping(value: string): void {
  if (!currentSyncPlayContext.inGroup || !isDrawerOpen() || sendInProgress) {
    stopLocalTyping("typing-disabled");
    return;
  }

  if (value.trim().length === 0) {
    stopLocalTyping("typing-cleared");
    return;
  }

  if (!typingLocalActive) {
    typingLocalActive = true;
    void postLocalTypingState(true, "typing-start");
    scheduleTypingRefresh();
  }

  if (typingIdleTimer) {
    window.clearTimeout(typingIdleTimer);
  }
  typingIdleTimer = window.setTimeout(() => stopLocalTyping("typing-idle"), typingIdleMs);
  updatePresenceDebug();
  emit();
}

function cloneReplyTarget(replyTarget: ReplyTarget | null): ReplyTarget | null {
  return replyTarget ? { ...replyTarget } : null;
}

function setLastMessageAction(action: string): void {
  if (window.JellyChatDebug) {
    window.JellyChatDebug.lastMessageAction = action;
  }
}

function clearCopiedFeedbackLater(): void {
  if (copiedFeedbackTimer) {
    window.clearTimeout(copiedFeedbackTimer);
  }

  copiedFeedbackTimer = window.setTimeout(() => {
    copiedFeedbackTimer = 0;
    messageActionMenu = {
      ...messageActionMenu,
      feedback: ""
    };
    emit();
  }, 1400);
}

function closeMessageActionMenu(reason: string): void {
  if (!messageActionMenu.open) {
    return;
  }

  messageActionMenu = {
    ...messageActionMenu,
    open: false,
    message: null
  };
  setLastMessageAction("menu-close:" + reason);
  emit();
}

function clearReplyTarget(reason: string): void {
  if (!activeReplyTarget) {
    return;
  }

  activeReplyTarget = null;
  setLastMessageAction("reply-cancel:" + reason);
  emit();
}

function startReplyToMessage(message: ChatMessage): void {
  if (!message || message.optimistic) {
    return;
  }

  activeReplyTarget = buildReplyTarget(message);
  closeMessageActionMenu("reply");
  setLastMessageAction("reply");
  emit();
  focusComposer("reply-selected");
}

function openMessageMenuForMessage(message: ChatMessage, x: number, y: number): void {
  if (!message || message.optimistic) {
    return;
  }

  const menuWidth = 156;
  const menuHeight = 96;
  const safeX = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
  const safeY = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8));
  messageActionMenu = {
    open: true,
    message,
    x: safeX,
    y: safeY,
    copiedMessageId: messageActionMenu.copiedMessageId,
    feedback: ""
  };
  setLastMessageAction("menu-open");
  emit();
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the textarea copy path.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    textarea.remove();
  }

  return copied;
}

async function copyMessageText(message: ChatMessage): Promise<boolean> {
  if (!message || message.optimistic) {
    return false;
  }

  const copied = await copyTextToClipboard(message.text);
  messageActionMenu = {
    ...messageActionMenu,
    open: false,
    message: null,
    copiedMessageId: copied ? message.id : messageActionMenu.copiedMessageId,
    feedback: copied ? "Copied" : "Copy failed"
  };
  setLastMessageAction(copied ? "copy" : "copy-failed");
  clearCopiedFeedbackLater();
  emit();
  return copied;
}

function setHighlightedMessage(messageId: string): void {
  if (!messageId) {
    return;
  }

  highlightedMessageId = messageId;
  setLastMessageAction("jump");
  if (highlightTimer) {
    window.clearTimeout(highlightTimer);
  }

  highlightTimer = window.setTimeout(() => {
    highlightTimer = 0;
    if (highlightedMessageId === messageId) {
      highlightedMessageId = null;
      emit();
    }
  }, 1700);
  emit();
}

function secondsToTicks(positionSeconds: number | undefined): number | undefined {
  if (positionSeconds === undefined || !Number.isFinite(positionSeconds)) {
    return undefined;
  }

  return Math.max(0, Math.round(positionSeconds * 10000000));
}

function createSyncPlayContext(args: Partial<SyncPlayContext> = {}): SyncPlayContext {
  return {
    inGroup: !!args.inGroup,
    groupId: args.groupId || "",
    groupName: args.groupName || "",
    sessionId: args.sessionId || "",
    deviceId: args.deviceId || getCurrentDeviceId(),
    participantCount: Math.max(1, Math.floor(args.participantCount || 1)),
    unavailable: !!args.unavailable,
    membershipSource: args.membershipSource || ""
  };
}

function updateSyncPlayResolutionDebug(resolution: CurrentSessionResolution): void {
  if (!window.JellyChatDebug) {
    return;
  }

  window.JellyChatDebug.currentSessionId = resolution.sessionId;
  window.JellyChatDebug.currentDeviceId = resolution.deviceId;
  window.JellyChatDebug.syncPlayMembershipSource = resolution.reason;
  window.JellyChatDebug.syncPlaySessionMatchCount = resolution.sessionMatchCount;
  window.JellyChatDebug.syncPlayCurrentUserSessionCount = resolution.currentUserSessionCount;
  window.JellyChatDebug.lastSyncPlayResolutionError = resolution.error;
}

async function resolveCurrentSyncPlayContext(): Promise<SyncPlayContext> {
  if (!window.ApiClient) {
    return createSyncPlayContext({ unavailable: true, membershipSource: "api-client-missing" });
  }

  const sessions = await fetchSessions();
  let groups: any[] = [];
  let groupsUnavailable = false;
  try {
    groups = normalizeGroupsResponse(await fetchJson("SyncPlay/List"));
  } catch (err) {
    groupsUnavailable = true;
    logDebug("SyncPlay list request failed", err);
  }

  const resolution = resolveCurrentSession(sessions, groups);
  cachedCurrentSessionIds = resolution.sessionId ? [resolution.sessionId] : [];
  updateSyncPlayResolutionDebug(resolution);
  if (!resolution.session || !resolution.sessionId) {
    return createSyncPlayContext({
      sessionId: resolution.sessionId,
      deviceId: resolution.deviceId,
      unavailable: groupsUnavailable,
      membershipSource: groupsUnavailable ? "syncplay-list-unavailable" : resolution.reason
    });
  }

  const room = await fetchJellyChatRoom(resolution.sessionId);
  if (room?.exactMembership && !room.inGroup) {
    return createSyncPlayContext({
      sessionId: room.sessionId || resolution.sessionId,
      deviceId: room.deviceId || resolution.deviceId,
      unavailable: groupsUnavailable,
      membershipSource: room.membershipSource || "current-session-not-in-syncplay"
    });
  }

  if (room?.inGroup && room.groupId) {
    return createSyncPlayContext({
      inGroup: true,
      groupId: room.groupId,
      groupName: room.groupName,
      sessionId: room.sessionId || resolution.sessionId,
      deviceId: room.deviceId || resolution.deviceId,
      participantCount: room.participants.length || 1,
      unavailable: false,
      membershipSource: room.membershipSource || (room.exactMembership ? "current-session-syncplay-map" : "current-session-syncplay-list")
    });
  }

  const groupIds = getGroupIdsForCurrentSession(resolution.session);
  if (groupIds.length > 0) {
    const preferredGroupId = groupIds[0];
    const matchingGroup = findGroupsByGroupIds(groups, groupIds)[0] || null;
    return createSyncPlayContext({
      inGroup: true,
      groupId: preferredGroupId,
      groupName: resolveSyncPlayGroupName(matchingGroup),
      sessionId: resolution.sessionId,
      deviceId: resolution.deviceId,
      participantCount: getGroupParticipantCount(matchingGroup),
      unavailable: false,
      membershipSource: "current-session-syncplay-group"
    });
  }

  if (groups.length > 0) {
    const allowUserParticipantMatch = canUseUserParticipantMatch(resolution);
    const matchingGroup = groups.filter((group) => groupsContainCurrentSession([group], resolution.session, allowUserParticipantMatch))[0] || null;
    if (matchingGroup) {
      return createSyncPlayContext({
        inGroup: true,
        groupId: resolveSyncPlayGroupId(matchingGroup),
        groupName: resolveSyncPlayGroupName(matchingGroup),
        sessionId: resolution.sessionId,
        deviceId: resolution.deviceId,
        participantCount: getGroupParticipantCount(matchingGroup),
        unavailable: false,
        membershipSource: allowUserParticipantMatch ? "single-session-participant-syncplay-list" : "current-session-syncplay-list"
      });
    }
  }

  return createSyncPlayContext({
    sessionId: resolution.sessionId,
    deviceId: resolution.deviceId,
    unavailable: groupsUnavailable,
    membershipSource: groupsUnavailable ? "syncplay-list-unavailable" : "current-session-not-in-syncplay"
  });
}

async function refreshSyncPlayState(): Promise<void> {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    setCurrentSyncPlayContext(await resolveCurrentSyncPlayContext());
  } catch (err) {
    logDebug("Failed to refresh SyncPlay state", err);
    setCurrentSyncPlayContext(createSyncPlayContext({ unavailable: true, membershipSource: "syncplay-refresh-error" }));
  } finally {
    refreshInProgress = false;
  }
}

export async function pollJellyChat(): Promise<void> {
  const now = Date.now();
  const pollIntervalMs = getEventPollIntervalMs();
  if (window.JellyChatDebug) {
    window.JellyChatDebug.eventPollIntervalMs = pollIntervalMs;
  }

  if (lastPollStartedAt > 0 && now - lastPollStartedAt < pollIntervalMs) {
    return;
  }

  lastPollStartedAt = now;
  await refreshSyncPlayState();
  scanPlaybackTarget();
  if (currentSyncPlayContext.inGroup && (isDrawerOpen() || currentSyncPlayContext.groupId)) {
    await fetchChatEvents(false);
  }
}

export function getCurrentGroupLabel(): string {
  if (currentSyncPlayContext.groupName) return currentSyncPlayContext.groupName;
  if (currentSyncPlayContext.groupId) return "Group " + currentSyncPlayContext.groupId.slice(0, 8);
  return "Current group";
}

function clearComposerInput(): void {
  const input = document.getElementById(inputId) as HTMLTextAreaElement | null;
  if (input) {
    input.value = "";
    input.style.height = "auto";
  }
}

export function focusComposer(reason: string): void {
  const focus = () => {
    const input = document.getElementById(inputId) as HTMLTextAreaElement | null;
    if (!input || input.disabled || !currentSyncPlayContext.inGroup || !isDrawerOpen()) return;
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
    if (window.JellyChatDebug) {
      window.JellyChatDebug.inputFocused = document.activeElement === input;
      window.JellyChatDebug.lastFocusReason = reason;
    }
  };

  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(focus);
  } else {
    window.setTimeout(focus, 0);
  }
}

export const actions: ChatActions = {
  openDrawer: () => {
    clearTriggerIndicators();
    moveJellyChatRootToHost(getActiveMountHost());
    emit();
    window.setTimeout(() => {
      const drawer = document.getElementById("jellyChatDrawer");
      if (drawer) {
        drawer.classList.add("is-open");
        drawer.setAttribute("aria-hidden", "false");
        if ("inert" in drawer) {
          (drawer as HTMLElement & { inert?: boolean }).inert = false;
        }
      }
      emit();
      updateLayout("drawer-open");
      pollJellyChat();
      focusComposer("drawer-open");
    }, 0);
  },
  closeDrawer: () => {
    stopLocalTyping("drawer-close");
    const drawer = document.getElementById("jellyChatDrawer");
    if (drawer) {
      drawer.classList.remove("is-open");
      drawer.setAttribute("aria-hidden", "true");
      if ("inert" in drawer) {
        (drawer as HTMLElement & { inert?: boolean }).inert = true;
      }
    }
    emit();
    updateLayout("drawer-close");
    restoreTriggerFocus();
  },
  toggleDrawer: () => {
    if (isDrawerOpen()) {
      actions.closeDrawer();
    } else {
      actions.openDrawer();
    }
  },
  toggleDrawerSide: () => {
    const nextSide = getDrawerSide() === "right" ? "left" : "right";
    setDrawerSide(nextSide);
    emit();
    updateLayout("drawer-side");
  },
  setDrawerWidth: (width: number) => {
    saveDrawerWidth(width);
    emit();
    updateLayout("drawer-width");
  },
  resetDrawerWidth: () => {
    resetStoredDrawerWidth();
    emit();
    updateLayout("drawer-width-reset");
  },
  setDrawerBackgroundAlpha: (alpha: number) => {
    saveDrawerBackgroundAlpha(alpha);
    emit();
    updateLayout("drawer-alpha");
  },
  resetDrawerBackgroundAlpha: () => {
    resetStoredDrawerBackgroundAlpha();
    emit();
    updateLayout("drawer-alpha-reset");
  },
  resetDrawerPreferences: () => {
    resetStoredDrawerPreferences();
    emit();
    updateLayout("drawer-prefs-reset");
  },
  setDrawerResizeActive: (active: boolean) => {
    drawerResizeActive = active;
    document.documentElement?.classList.toggle("jellychat-resizing", active);
    emit();
  },
  noteComposerInput: (value: string) => {
    noteLocalTyping(value);
  },
  stopTyping: (reason: string) => {
    stopLocalTyping(reason);
  },
  sendMessage: async (text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText || sendInProgress) return false;
    if (!currentSyncPlayContext.inGroup) {
      logDebug("Send blocked because the current session is not in a SyncPlay group.");
      emit();
      return false;
    }

    sendInProgress = true;
    emit();
    try {
      const postContext = await resolveEventPostContext();
      if (!postContext) {
        logDebug("Send blocked because no active SyncPlay group could be resolved.");
        return false;
      }

      const clientEventId = createClientEventId();
      const replyTo = cloneReplyTarget(activeReplyTarget);
      localClientEventIds.add(clientEventId);
      const optimisticEvent = createRoomEvent({
        id: "optimistic-" + clientEventId,
        type: "chat.message",
        groupId: postContext.groupId,
        userName: postContext.userName,
        clientEventId,
        text: trimmedText,
        replyTo,
        optimistic: true
      });
      mergeHistoryEvents([optimisticEvent]);
      if (window.JellyChatDebug) {
        window.JellyChatDebug.lastOptimisticClientEventId = clientEventId;
        window.JellyChatDebug.lastOptimisticActorName = optimisticEvent.userName;
      }

      const result = await postChatMessage({
        text: trimmedText,
        senderSessionId: postContext.senderSessionId,
        groupId: postContext.groupId,
        participants: postContext.participants,
        clientEventId,
        replyTo
      });

      if (window.JellyChatDebug) {
        window.JellyChatDebug.lastEventPostAt = new Date().toISOString();
      }

      if (result && result.id) {
        stopLocalTyping("message-sent");
        mergeHistoryEvents([{
          ...createRoomEvent({
            id: result.id,
            type: "chat.message",
            groupId: result.groupId,
            userName: result.userName,
            clientEventId,
            text: result.text,
            replyTo: result.replyTo || replyTo
          }),
          sequence: result.sequence,
          userId: result.userId,
          createdAtUtc: result.createdAtUtc,
          replyTo: result.replyTo || replyTo,
          optimistic: false
        }]);
        activeReplyTarget = null;
        void refreshEventsImmediately();
        clearComposerInput();
        focusComposer("send-success");
        return true;
      }

      logDebug("Failed to send SyncPlay chat message.");
      return false;
    } catch (err) {
      logDebug("Failed to send SyncPlay chat message", err);
      return false;
    } finally {
      sendInProgress = false;
      emit();
      focusComposer("send-success");
    }
  },
  sendReaction: async (emoji: string) => {
    const normalizedEmoji = emoji.trim();
    if (!normalizedEmoji || !currentSyncPlayContext.inGroup) {
      return false;
    }

    const clientEventId = createClientEventId();
    localClientEventIds.add(clientEventId);
    seenReactionEventKeys.add(clientEventId);
    const playback = getCurrentPlaybackSnapshot();
    const positionSeconds = typeof playback.positionSeconds === "number" && Number.isFinite(playback.positionSeconds)
      ? playback.positionSeconds
      : undefined;
    const localReaction: ReactionEvent = {
      emoji: normalizedEmoji,
      clientEventId,
      userId: getCurrentUserId(),
      userName: "",
      groupId: currentSyncPlayContext.groupId,
      itemId: playback.itemId || "",
      itemName: playback.itemName || "",
      positionSeconds: positionSeconds ?? null,
      createdAtUtc: new Date().toISOString()
    };
    addReactionOverlay(localReaction);
    if (window.JellyChatDebug) {
      const now = new Date().toISOString();
      window.JellyChatDebug.reactionEventCount = Number(window.JellyChatDebug.reactionEventCount || 0) + 1;
      window.JellyChatDebug.lastReactionEmoji = normalizedEmoji;
      window.JellyChatDebug.lastReactionSentAt = now;
      window.JellyChatDebug.lastReactionClientEventId = clientEventId;
    }

    try {
      const postContext = await resolveEventPostContext();
      if (!postContext) {
        logDebug("Reaction blocked because no active SyncPlay group could be resolved.");
        return false;
      }

      setReactionParticipantCount(Math.max(1, postContext.participants.length || currentSyncPlayContext.participantCount));

      const result = await postEmojiReaction({
        emoji: normalizedEmoji,
        senderSessionId: postContext.senderSessionId,
        groupId: postContext.groupId,
        participants: postContext.participants,
        itemId: playback.itemId,
        itemName: playback.itemName,
        positionSeconds,
        clientEventId
      });
      if (window.JellyChatDebug) {
        window.JellyChatDebug.lastEventPostAt = new Date().toISOString();
      }

      if (result && result.id) {
        seenReactionEventKeys.add(getReactionEventKey(result));
        void refreshEventsImmediately();
        return true;
      }

      logDebug("Failed to send emoji reaction.");
      return false;
    } catch (err) {
      logDebug("Failed to send emoji reaction", err);
      return false;
    }
  },
  setInputFocused: (focused: boolean) => {
    if (!focused) {
      stopLocalTyping("composer-blur");
    }
    if (window.JellyChatDebug) {
      window.JellyChatDebug.inputFocused = focused;
    }
  },
  startReply: (message: ChatMessage) => {
    startReplyToMessage(message);
  },
  cancelReply: (reason: string) => {
    clearReplyTarget(reason);
  },
  openMessageActionMenu: (message: ChatMessage, x: number, y: number) => {
    openMessageMenuForMessage(message, x, y);
  },
  closeMessageActionMenu: (reason: string) => {
    closeMessageActionMenu(reason);
  },
  copyMessage: async (message: ChatMessage) => {
    return copyMessageText(message);
  },
  highlightMessage: (messageId: string) => {
    setHighlightedMessage(messageId);
  }
};

export async function postLocalPlaybackEvent(request: PlaybackPostRequest): Promise<boolean> {
  if (!currentSyncPlayContext.inGroup) {
    return false;
  }

  try {
    const postContext = await resolveEventPostContext();
    if (!postContext) {
      logDebug("Playback event blocked because no active SyncPlay group could be resolved.");
      return false;
    }

    const clientEventId = createClientEventId();
    localClientEventIds.add(clientEventId);
    const fromPositionTicks = secondsToTicks(request.fromSeconds);
    const toPositionTicks = secondsToTicks(request.positionSeconds);
    const optimisticEvent = createRoomEvent({
      id: "optimistic-" + clientEventId,
      type: request.type,
      groupId: postContext.groupId,
      userName: postContext.userName,
      clientEventId,
      fromPositionTicks,
      toPositionTicks,
      itemId: request.itemId,
      itemName: request.itemName,
      optimistic: true
    });
    mergeHistoryEvents([optimisticEvent]);
    if (window.JellyChatDebug) {
      window.JellyChatDebug.lastOptimisticClientEventId = clientEventId;
      window.JellyChatDebug.lastOptimisticActorName = optimisticEvent.userName;
    }

    const result = await postPlaybackEvent({
      type: request.type,
      senderSessionId: postContext.senderSessionId,
      groupId: postContext.groupId,
      participants: postContext.participants,
      fromPositionTicks,
      toPositionTicks,
      itemId: request.itemId,
      itemName: request.itemName,
      clientEventId
    });

    if (result && result.id) {
      if (window.JellyChatDebug) {
        const now = new Date().toISOString();
        window.JellyChatDebug.lastEventPostAt = now;
        window.JellyChatDebug.lastPlaybackEventPostAt = now;
        window.JellyChatDebug.lastPlaybackEventType = request.type;
        window.JellyChatDebug.playbackEventCount = Number(window.JellyChatDebug.playbackEventCount || 0) + 1;
      }
      mergeHistoryEvents([result]);
      void refreshEventsImmediately();
      return true;
    }

    return false;
  } catch (err) {
    logDebug("Failed to send playback event", err);
    return false;
  }
}

export function installRouteWatcher(): void {
  if (window.__JELLYCHAT_HISTORY_PATCHED__) return;
  const originalPushState = window.history && window.history.pushState;
  const originalReplaceState = window.history && window.history.replaceState;
  const emitRouteChange = () => window.dispatchEvent(new Event("jellychat-routechange"));

  if (typeof originalPushState === "function") {
    window.history.pushState = function pushState(...args: Parameters<History["pushState"]>) {
      const result = originalPushState.apply(this, args);
      emitRouteChange();
      return result;
    };
  }

  if (typeof originalReplaceState === "function") {
    window.history.replaceState = function replaceState(...args: Parameters<History["replaceState"]>) {
      const result = originalReplaceState.apply(this, args);
      emitRouteChange();
      return result;
    };
  }

  window.__JELLYCHAT_HISTORY_PATCHED__ = true;
}

function bindEvent(target: EventTarget | null, type: string, handler: EventListener, options?: AddEventListenerOptions): void {
  if (!target || typeof target.addEventListener !== "function") return;
  target.addEventListener(type, handler, options);
  if (window.JellyChatDebug) {
    window.JellyChatDebug.listenerCount += 1;
  }
}

export function startRuntime(): void {
  window.__jellyChatLoaded = true;
  installRouteWatcher();
  installPlaybackActionLogging(postLocalPlaybackEvent);
  updateLayout("start");
  pollJellyChat();

  if (window.__JELLYCHAT_REFRESH_INTERVAL_ID__ === undefined || window.__JELLYCHAT_REFRESH_INTERVAL_ID__ === null) {
    window.__JELLYCHAT_REFRESH_INTERVAL_ID__ = window.setInterval(pollJellyChat, refreshIntervalMs);
  }
  if (window.JellyChatDebug) {
    window.JellyChatDebug.intervalCount = 1;
  }

  if (!window.__JELLYCHAT_LISTENERS_BOUND__) {
    bindEvent(window, "focus", () => pollJellyChat());
    bindEvent(document, "visibilitychange", () => {
      if (!document.hidden) pollJellyChat();
    });
    bindEvent(document, "keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key !== "Escape" || !isDrawerOpen()) {
        return;
      }

      if (document.querySelector("[data-jellychat-settings-popover='true']")) {
        window.dispatchEvent(new Event("jellychat-close-settings"));
        keyboardEvent.preventDefault();
        return;
      }

      if (document.querySelector(".jellyChatEmojiPicker")) {
        window.dispatchEvent(new Event("jellychat-close-emoji-picker"));
        keyboardEvent.preventDefault();
        return;
      }

      if (document.querySelector(".jellyChatEmojiEditToggle.is-active")) {
        window.dispatchEvent(new Event("jellychat-exit-quick-edit"));
        keyboardEvent.preventDefault();
        return;
      }

      if (messageActionMenu.open) {
        closeMessageActionMenu("escape");
        keyboardEvent.preventDefault();
        return;
      }

      if (activeReplyTarget) {
        clearReplyTarget("escape");
        keyboardEvent.preventDefault();
        return;
      }

      actions.closeDrawer();
      keyboardEvent.preventDefault();
    });
    bindEvent(window, "beforeunload", () => stopLocalTyping("beforeunload"));
    bindEvent(window, "pagehide", () => stopLocalTyping("pagehide"));
    bindEvent(window, "resize", () => scheduleLayoutUpdate("resize"));
    bindEvent(document, "fullscreenchange", () => {
      scanPlaybackTarget();
      updateLayout("fullscreenchange");
      if (isDrawerOpen()) focusComposer("fullscreenchange");
    });
    bindEvent(window, "hashchange", () => {
      scanPlaybackTarget();
      scheduleLayoutUpdate("hashchange");
    });
    bindEvent(window, "popstate", () => {
      scanPlaybackTarget();
      scheduleLayoutUpdate("popstate");
    });
    bindEvent(window, "jellychat-routechange", () => {
      scanPlaybackTarget();
      scheduleLayoutUpdate("routechange");
    });
    window.__JELLYCHAT_LISTENERS_BOUND__ = true;
  }
}

export function syncErrorBoundary(error: unknown): void {
  recordError(error);
  emit();
}

export function getComposerForm(): HTMLFormElement | null {
  return document.getElementById(formId) as HTMLFormElement | null;
}
