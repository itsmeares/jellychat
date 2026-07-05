import type { DrawerSide } from "../types";
import { defaultQuickReactions } from "./emoji";
import { getDrawerSide } from "./layout";

type DetailGroupName = "layout" | "events" | "playback" | "reactions" | "emojiPicker" | "lifecycle";
type DetailGroups = Record<DetailGroupName, Record<string, unknown>>;
type DebugRecord = Record<string, unknown>;

const detailGroupNames: DetailGroupName[] = ["layout", "events", "playback", "reactions", "emojiPicker", "lifecycle"];

const summaryKeys = [
  "loaded",
  "frontend",
  "mounted",
  "reactMounted",
  "injectionMode",
  "assetMode",
  "assetBasePath",
  "assetBasePathSource",
  "assetBasePathError",
  "injectedAssetBaseUrl",
  "injectedScriptSrc",
  "fileTransformationRequired",
  "injectedAssetVersion",
  "injectionMarkerFound",
  "assetCssLoaded",
  "assetJsLoaded",
  "apiMode",
  "currentGroupId",
  "drawerOpen",
  "drawerSide",
  "drawerWidth",
  "drawerWidthSource",
  "drawerResizeActive",
  "drawerWidthMin",
  "drawerWidthMax",
  "drawerBackgroundAlpha",
  "drawerBackgroundAlphaSource",
  "rootCount",
  "buttonCount",
  "triggerCount",
  "intervalCount",
  "listenerCount",
  "messageCount",
  "timelineCount",
  "replyActive",
  "replyTargetEventId",
  "replyTargetFound",
  "contextMenuOpen",
  "lastCopiedMessageId",
  "highlightedMessageId",
  "groupedMessageCount",
  "messageActionMenuOpen",
  "lastMessageAction",
  "playbackEventCount",
  "reactionEventCount",
  "reactionOverlayCount",
  "lastApiMethod",
  "lastApiPath",
  "lastApiUrlPath",
  "lastApiUrlSource",
  "lastApiUrlError",
  "lastApiStatus",
  "lastApiError",
  "lastError",
  "lastInjectionError"
];

const structuredKeys = ["counts", "status", "last", "details"];
const helperKeys = ["dump", "reset", "setVerbose", "getSummary"];
const summaryKeySet = new Set(summaryKeys);
const helperKeySet = new Set(helperKeys);
const structuredKeySet = new Set(structuredKeys);
const fieldGroups = new Map<string, DetailGroupName>();

function mapFields(group: DetailGroupName, fields: string[]): void {
  fields.forEach((field) => fieldGroups.set(field, group));
}

mapFields("layout", [
  "layoutMode",
  "runtimeShell",
  "clientShell",
  "isJellyfinDesktop",
  "desktopVideoSafeMode",
  "desktopOverlayCssFallbackApplied",
  "videoSurfaceInsetApplied",
  "videoSurfaceResizeSuppressed",
  "isVideoRoute",
  "videoRoute",
  "isFullscreen",
  "triggerMode",
  "triggerPlacement",
  "triggerHostFound",
  "triggerHostSelector",
  "lastTriggerMountError",
  "triggerRoute",
  "triggerActiveRootSelector",
  "triggerCandidateCount",
  "triggerVideoHostCandidateCount",
  "triggerHeaderHostCandidateCount",
  "triggerObserverUpdateCount",
  "triggerObserverLastReason",
  "triggerObserverLastUpdateAt",
  "desktopTriggerFallbackActive",
  "desktopFallbackHostCount",
  "desktopFallbackDuplicateCount",
  "desktopFallbackParentSelector",
  "viewportWidth",
  "viewportHeight",
  "phonePortrait",
  "compactVideoStatus",
  "canDock",
  "leftInset",
  "rightInset",
  "layoutTargetsFound",
  "contentInsetApplied",
  "headerControlsInsetApplied",
  "playerInsetApplied",
  "playerSurfaceInsetApplied",
  "playerControlsInsetApplied",
  "playerProgressInsetApplied",
  "playerSubtitlesInsetApplied",
  "normalContentInsetApplied",
  "subtitleElementFound",
  "controlsVisibilitySource",
  "lastControlsVisibleAt",
  "lastControlsHiddenAt",
  "lastControlsVisibilityReason",
  "fullscreenPlayerSurfaceSelector",
  "fullscreenPlayerSurfaceTag",
  "fullscreenPlayerSurfaceId",
  "fullscreenPlayerSurfaceClass",
  "headerControlsTargetSelector",
  "headerControlsTargetTag",
  "headerControlsTargetId",
  "headerControlsTargetClass",
  "playerControlsTargetSelector",
  "playerControlsTargetTag",
  "playerControlsTargetId",
  "playerControlsTargetClass",
  "playerProgressTargetSelector",
  "playerProgressTargetTag",
  "playerProgressTargetId",
  "playerProgressTargetClass",
  "playerSubtitlesTargetSelector",
  "playerSubtitlesTargetTag",
  "playerSubtitlesTargetId",
  "playerSubtitlesTargetClass",
  "videoReservedWidth",
  "videoElementFound",
  "controlsElementFound",
  "videoParentChain",
  "controlsParentChain",
  "lastLayoutUpdateAt",
  "lastFullscreenLayoutAt",
  "fullscreenElementTag",
  "fullscreenHostTag",
  "fullscreenHostId",
  "fullscreenHostClass",
  "rootParentTag",
  "rootParentClass",
  "lastFullscreenChangeAt",
  "controlsOverlapAvoided",
  "controlsInsetApplied"
]);

mapFields("events", [
  "lastSequence",
  "eventCount",
  "eventPollIntervalMs",
  "lastImmediateRefreshAt",
  "optimisticEventCount",
  "pendingOptimisticEventCount",
  "confirmedOptimisticEventCount",
  "lastOptimisticClientEventId",
  "lastOptimisticActorName",
  "lastResolvedActorName",
  "lastActorFallbackReason",
  "lastConfirmedClientEventId",
  "lastTimelineMergeStrategy",
  "lastTimelinePreservedCount",
  "lastTimelineReplacedCount",
  "lastTimelineAddedCount",
  "lastTimelineUpdatedCount",
  "lastTimelineClearedAt",
  "timelineContainerRemountCount",
  "timelinePinnedToBottom",
  "lastScrollPreservedAt",
  "lastAutoScrollReason",
  "lastEventRoundTripMs",
  "lastEventMergeCount",
  "supportedEventTypes",
  "lastEventPollAt",
  "lastEventPostAt",
  "currentSessionId",
  "currentDeviceId",
  "currentDeviceName",
  "currentClientName",
  "currentApiDeviceId",
  "syncPlayMembershipSource",
  "syncPlayResolutionReason",
  "syncPlayResolutionState",
  "syncPlaySessionMatchCount",
  "syncPlayCurrentUserSessionCount",
  "syncPlayCurrentUserSessionIds",
  "syncPlayMatchedSessionIds",
  "syncPlaySameAccountMultiClient",
  "syncPlayAmbiguousSession",
  "syncPlayGroupCount",
  "syncPlayGroupsUnavailable",
  "syncPlayInGroup",
  "syncPlayActiveGroupId",
  "syncPlayNotInRoomReason",
  "syncPlayRoomInGroup",
  "syncPlayRoomGroupId",
  "syncPlayRoomSessionId",
  "syncPlayRoomDeviceId",
  "syncPlayRoomExactMembership",
  "syncPlayRoomMembershipSource",
  "syncPlayRoomRequestError",
  "syncPlayClientSignalSource",
  "syncPlayClientSignalGroupId",
  "syncPlayClientSignalKnown",
  "syncPlayClientSignalInGroup",
  "lastSyncPlayResolutionError",
  "inputFocused",
  "submitCount",
  "lastFocusReason",
  "groupCount",
  "groupingWindowMs",
  "lastGroupedAt",
  "replyActive",
  "replyTargetEventId",
  "replyTargetFound",
  "contextMenuOpen",
  "lastCopiedMessageId",
  "highlightedMessageId",
  "groupedMessageCount",
  "messageActionMenuOpen",
  "lastMessageAction",
  "unreadChatIndicatorActive",
  "playbackActivityIndicatorActive",
  "lastUnreadEventType",
  "lastUnreadEventSeq",
  "lastActivityEventType",
  "lastActivityEventSeq",
  "typingLocalActive",
  "typingRemoteCount",
  "typingRemoteUsers",
  "lastTypingEventAt",
  "typingTtlMs"
]);

mapFields("playback", [
  "playbackListenerCount",
  "seekDebounceMs",
  "lastPlaybackEventType",
  "lastPlaybackEventPostAt",
  "lastPlaybackSuppressedReason",
  "lastPauseDetectedAt",
  "lastPlayDetectedAt",
  "lastSeekStartedAt",
  "lastSeekSettledAt",
  "lastSeekFromSeconds",
  "lastSeekToSeconds",
  "lastSeekDirection",
  "lastSeekSuppressedReason",
  "seekIntentWindowMs",
  "lastSeekIntentWindowMs",
  "seekThresholdSeconds",
  "lastSeekDeltaSeconds",
  "lastSeekIntentAgeMs",
  "lastSeekCandidateFromSeconds",
  "lastSeekCandidateToSeconds",
  "lastSeekCandidateReason",
  "seekInProgress",
  "seekSuppressPlaybackUntil",
  "lastLocalPlaybackInputAt",
  "lastLocalPlaybackInputType",
  "lastLocalPlaybackInputTarget",
  "lastLocalPlayPauseIntentAt",
  "lastLocalSeekIntentAt",
  "currentPlaybackItemId",
  "currentPlaybackItemTitle",
  "playbackStartLoggedForItem",
  "lastPlaybackStartAt",
  "lastPlaybackStartTitle",
  "lastPlaybackStartItemId",
  "startupGuardUntil",
  "lastSeekEventAt"
]);

mapFields("reactions", [
  "reactionOverlayMax",
  "lastReactionEmoji",
  "lastReactionSentAt",
  "lastReactionReceivedAt",
  "lastReactionClientEventId",
  "lastReactionDroppedReason"
]);

mapFields("emojiPicker", [
  "emojiPickerOpen",
  "emojiSearchQuery",
  "favoriteEmojiCount",
  "recentlyUsedEmojiCount",
  "quickReactionSlots",
  "quickReactionEditMode",
  "selectedQuickReactionSlotIndex",
  "lastQuickReactionEditAction"
]);

mapFields("lifecycle", [
  "mountCount",
  "rootMoveCount",
  "keydownListenerCount",
  "composerMountCount"
]);

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (value && typeof value === "object") {
    const output: DebugRecord = {};
    Object.entries(value as DebugRecord).forEach(([key, entry]) => {
      output[key] = cloneValue(entry);
    });
    return output;
  }

  return value;
}

function cloneRecord(source: DebugRecord): DebugRecord {
  const output: DebugRecord = {};
  Object.entries(source).forEach(([key, value]) => {
    output[key] = cloneValue(value);
  });
  return output;
}

function createDetails(): DetailGroups {
  return {
    layout: {},
    events: {},
    playback: {},
    reactions: {},
    emojiPicker: {},
    lifecycle: {}
  };
}

function defaultValues(): DebugRecord {
  return {
    loaded: true,
    frontend: "react",
    mounted: false,
    reactMounted: false,
    injectionMode: "self-contained",
    assetMode: "plugin-endpoint",
    assetBasePath: "",
    assetBasePathSource: "",
    assetBasePathError: null,
    injectedAssetBaseUrl: "/JellyChat/Assets",
    injectedScriptSrc: "",
    fileTransformationRequired: false,
    injectedAssetVersion: "",
    injectionMarkerFound: false,
    assetCssLoaded: false,
    assetJsLoaded: false,
    mountCount: 0,
    rootCount: 0,
    buttonCount: 0,
    triggerCount: 0,
    listenerCount: 0,
    intervalCount: 0,
    currentGroupId: "",
    currentSessionId: "",
    currentDeviceId: "",
    currentDeviceName: "",
    currentClientName: "",
    currentApiDeviceId: "",
    syncPlayMembershipSource: "",
    syncPlayResolutionReason: "",
    syncPlayResolutionState: "startup",
    syncPlaySessionMatchCount: 0,
    syncPlayCurrentUserSessionCount: 0,
    syncPlayCurrentUserSessionIds: [],
    syncPlayMatchedSessionIds: [],
    syncPlaySameAccountMultiClient: false,
    syncPlayAmbiguousSession: false,
    syncPlayGroupCount: 0,
    syncPlayGroupsUnavailable: false,
    syncPlayInGroup: false,
    syncPlayActiveGroupId: "",
    syncPlayNotInRoomReason: "startup",
    syncPlayRoomInGroup: false,
    syncPlayRoomGroupId: "",
    syncPlayRoomSessionId: "",
    syncPlayRoomDeviceId: "",
    syncPlayRoomExactMembership: false,
    syncPlayRoomMembershipSource: "",
    syncPlayRoomRequestError: null,
    syncPlayClientSignalSource: "",
    syncPlayClientSignalGroupId: "",
    syncPlayClientSignalKnown: false,
    syncPlayClientSignalInGroup: false,
    lastSyncPlayResolutionError: null,
    apiMode: "events",
    lastSequence: 0,
    eventCount: 0,
    eventPollIntervalMs: 850,
    lastImmediateRefreshAt: null,
    optimisticEventCount: 0,
    pendingOptimisticEventCount: 0,
    confirmedOptimisticEventCount: 0,
    lastOptimisticClientEventId: null,
    lastOptimisticActorName: null,
    lastResolvedActorName: null,
    lastActorFallbackReason: null,
    lastConfirmedClientEventId: null,
    lastTimelineMergeStrategy: null,
    lastTimelinePreservedCount: 0,
    lastTimelineReplacedCount: 0,
    lastTimelineAddedCount: 0,
    lastTimelineUpdatedCount: 0,
    lastTimelineClearedAt: null,
    timelineContainerRemountCount: 0,
    timelinePinnedToBottom: true,
    lastScrollPreservedAt: null,
    lastAutoScrollReason: null,
    lastEventRoundTripMs: null,
    lastEventMergeCount: 0,
    playbackListenerCount: 0,
    playbackEventCount: 0,
    seekDebounceMs: 900,
    lastPlaybackEventType: null,
    lastPlaybackEventPostAt: null,
    lastPlaybackSuppressedReason: null,
    lastPauseDetectedAt: null,
    lastPlayDetectedAt: null,
    lastSeekStartedAt: null,
    lastSeekSettledAt: null,
    lastSeekFromSeconds: null,
    lastSeekToSeconds: null,
    lastSeekDirection: null,
    lastSeekSuppressedReason: null,
    seekIntentWindowMs: 6000,
    lastSeekIntentWindowMs: 6000,
    seekThresholdSeconds: 2,
    lastSeekDeltaSeconds: null,
    lastSeekIntentAgeMs: null,
    lastSeekCandidateFromSeconds: null,
    lastSeekCandidateToSeconds: null,
    lastSeekCandidateReason: null,
    seekInProgress: false,
    seekSuppressPlaybackUntil: null,
    lastLocalPlaybackInputAt: null,
    lastLocalPlaybackInputType: null,
    lastLocalPlaybackInputTarget: null,
    lastLocalPlayPauseIntentAt: null,
    lastLocalSeekIntentAt: null,
    currentPlaybackItemId: null,
    currentPlaybackItemTitle: null,
    playbackStartLoggedForItem: null,
    lastPlaybackStartAt: null,
    lastPlaybackStartTitle: null,
    lastPlaybackStartItemId: null,
    startupGuardUntil: null,
    lastSeekEventAt: null,
    reactionOverlayCount: 0,
    reactionOverlayMax: 40,
    reactionEventCount: 0,
    lastReactionEmoji: null,
    lastReactionSentAt: null,
    lastReactionReceivedAt: null,
    lastReactionClientEventId: null,
    lastReactionDroppedReason: null,
    emojiPickerOpen: false,
    emojiSearchQuery: "",
    favoriteEmojiCount: 0,
    recentlyUsedEmojiCount: 0,
    quickReactionSlots: defaultQuickReactions.slice(),
    quickReactionEditMode: false,
    selectedQuickReactionSlotIndex: null,
    lastQuickReactionEditAction: null,
    supportedEventTypes: ["chat.message", "reaction.emoji", "playback.start", "playback.play", "playback.pause", "playback.seek", "typing.update", "system.notice"],
    lastEventPollAt: null,
    lastEventPostAt: null,
    inputFocused: false,
    submitCount: 0,
    keydownListenerCount: 0,
    composerMountCount: 0,
    lastFocusReason: "",
    messageCount: 0,
    groupCount: 0,
    timelineCount: 0,
    replyActive: false,
    replyTargetEventId: null,
    replyTargetFound: false,
    contextMenuOpen: false,
    lastCopiedMessageId: null,
    highlightedMessageId: null,
    groupedMessageCount: 0,
    messageActionMenuOpen: false,
    lastMessageAction: null,
    groupingWindowMs: 5 * 60 * 1000,
    lastGroupedAt: null,
    layoutMode: "normal-docked",
    phonePortrait: false,
    compactVideoStatus: false,
    runtimeShell: "browser",
    clientShell: "browser",
    isJellyfinDesktop: false,
    desktopVideoSafeMode: false,
    desktopOverlayCssFallbackApplied: false,
    videoSurfaceInsetApplied: false,
    videoSurfaceResizeSuppressed: false,
    isVideoRoute: false,
    videoRoute: false,
    isFullscreen: false,
    drawerOpen: false,
    drawerSide: getDrawerSide(),
    drawerWidthSource: "default",
    drawerResizeActive: false,
    drawerWidthMin: 280,
    drawerWidthMax: 560,
    drawerBackgroundAlpha: 0.96,
    drawerBackgroundAlphaSource: "default",
    triggerMode: "native-missing",
    triggerPlacement: "normal",
    triggerHostFound: false,
    triggerHostSelector: "",
    lastTriggerMountError: null,
    triggerRoute: "",
    triggerActiveRootSelector: "",
    triggerCandidateCount: 0,
    triggerVideoHostCandidateCount: 0,
    triggerHeaderHostCandidateCount: 0,
    triggerObserverUpdateCount: 0,
    triggerObserverLastReason: "",
    triggerObserverLastUpdateAt: null,
    desktopTriggerFallbackActive: false,
    desktopFallbackHostCount: 0,
    desktopFallbackDuplicateCount: 0,
    desktopFallbackParentSelector: "",
    drawerWidth: 340,
    unreadChatIndicatorActive: false,
    playbackActivityIndicatorActive: false,
    lastUnreadEventType: null,
    lastUnreadEventSeq: null,
    lastActivityEventType: null,
    lastActivityEventSeq: null,
    typingLocalActive: false,
    typingRemoteCount: 0,
    typingRemoteUsers: [],
    lastTypingEventAt: null,
    typingTtlMs: 5000,
    leftInset: 0,
    rightInset: 0,
    layoutTargetsFound: false,
    contentInsetApplied: false,
    headerControlsInsetApplied: false,
    playerInsetApplied: false,
    playerSurfaceInsetApplied: false,
    playerControlsInsetApplied: false,
    playerProgressInsetApplied: false,
    playerSubtitlesInsetApplied: false,
    normalContentInsetApplied: false,
    subtitleElementFound: false,
    controlsVisibilitySource: "fallback-timer",
    lastControlsVisibleAt: null,
    lastControlsHiddenAt: null,
    fullscreenPlayerSurfaceSelector: "",
    fullscreenPlayerSurfaceTag: "",
    fullscreenPlayerSurfaceId: "",
    fullscreenPlayerSurfaceClass: "",
    headerControlsTargetSelector: "",
    headerControlsTargetTag: "",
    headerControlsTargetId: "",
    headerControlsTargetClass: "",
    playerControlsTargetSelector: "",
    playerControlsTargetTag: "",
    playerControlsTargetId: "",
    playerControlsTargetClass: "",
    playerProgressTargetSelector: "",
    playerProgressTargetTag: "",
    playerProgressTargetId: "",
    playerProgressTargetClass: "",
    playerSubtitlesTargetSelector: "",
    playerSubtitlesTargetTag: "",
    playerSubtitlesTargetId: "",
    playerSubtitlesTargetClass: "",
    videoReservedWidth: 0,
    videoElementFound: false,
    controlsElementFound: false,
    videoParentChain: "",
    controlsParentChain: "",
    lastLayoutUpdateAt: null,
    lastFullscreenLayoutAt: null,
    fullscreenElementTag: "",
    fullscreenHostTag: "",
    fullscreenHostId: "",
    fullscreenHostClass: "",
    rootParentTag: "",
    rootParentClass: "",
    rootMoveCount: 0,
    lastFullscreenChangeAt: null,
    controlsOverlapAvoided: false,
    controlsInsetApplied: false,
    lastApiMethod: "",
    lastApiPath: "",
    lastApiUrlPath: "",
    lastApiUrlSource: "",
    lastApiUrlError: null,
    lastApiStatus: null,
    lastApiError: null,
    lastError: null,
    lastInjectionError: null
  };
}

export function initializeJellyChatDebug(): DebugRecord {
  const previous = window.JellyChatDebug as DebugRecord | undefined;
  const topLevel: DebugRecord = {};
  const details = createDetails();
  let verbose = false;

  function setValue(key: string, value: unknown): void {
    if (summaryKeySet.has(key)) {
      topLevel[key] = cloneValue(value);
      return;
    }

    const group = fieldGroups.get(key) || "lifecycle";
    details[group][key] = cloneValue(value);
  }

  function getValue(key: string): unknown {
    if (summaryKeySet.has(key)) {
      return topLevel[key];
    }

    const group = fieldGroups.get(key);
    if (group) {
      return details[group][key];
    }

    for (const detailGroup of detailGroupNames) {
      if (Object.prototype.hasOwnProperty.call(details[detailGroup], key)) {
        return details[detailGroup][key];
      }
    }

    return undefined;
  }

  function buildCounts(): DebugRecord {
    return {
      root: topLevel.rootCount,
      button: topLevel.buttonCount,
      trigger: topLevel.triggerCount,
      interval: topLevel.intervalCount,
      listener: topLevel.listenerCount,
      message: topLevel.messageCount,
      timeline: topLevel.timelineCount,
      event: details.events.eventCount,
      playbackEvent: topLevel.playbackEventCount,
    reactionEvent: topLevel.reactionEventCount,
    reactionOverlay: topLevel.reactionOverlayCount,
    groupedMessage: topLevel.groupedMessageCount
    };
  }

  function buildStatus(): DebugRecord {
    return {
      loaded: topLevel.loaded,
      frontend: topLevel.frontend,
      mounted: topLevel.mounted,
      reactMounted: topLevel.reactMounted,
      injectionMode: topLevel.injectionMode,
      assetMode: topLevel.assetMode,
      assetBasePath: topLevel.assetBasePath,
      assetBasePathSource: topLevel.assetBasePathSource,
      assetBasePathError: topLevel.assetBasePathError,
      injectedAssetBaseUrl: topLevel.injectedAssetBaseUrl,
      injectedScriptSrc: topLevel.injectedScriptSrc,
      fileTransformationRequired: topLevel.fileTransformationRequired,
      injectedAssetVersion: topLevel.injectedAssetVersion,
      injectionMarkerFound: topLevel.injectionMarkerFound,
      assetCssLoaded: topLevel.assetCssLoaded,
      assetJsLoaded: topLevel.assetJsLoaded,
      apiMode: topLevel.apiMode,
      currentGroupId: topLevel.currentGroupId,
      drawerOpen: topLevel.drawerOpen,
      drawerSide: topLevel.drawerSide,
      drawerWidth: topLevel.drawerWidth,
      drawerWidthSource: topLevel.drawerWidthSource,
      drawerBackgroundAlpha: topLevel.drawerBackgroundAlpha,
      drawerBackgroundAlphaSource: topLevel.drawerBackgroundAlphaSource,
      triggerMode: details.layout.triggerMode,
      triggerHostFound: details.layout.triggerHostFound,
      triggerHostSelector: details.layout.triggerHostSelector,
      triggerCandidateCount: details.layout.triggerCandidateCount,
      triggerRoute: details.layout.triggerRoute,
      lastTriggerMountError: details.layout.lastTriggerMountError,
      desktopTriggerFallbackActive: details.layout.desktopTriggerFallbackActive,
      currentSessionId: details.events.currentSessionId,
      currentDeviceId: details.events.currentDeviceId,
      currentDeviceName: details.events.currentDeviceName,
      currentClientName: details.events.currentClientName,
      currentApiDeviceId: details.events.currentApiDeviceId,
      syncPlayMembershipSource: details.events.syncPlayMembershipSource,
      syncPlayResolutionReason: details.events.syncPlayResolutionReason,
      syncPlayResolutionState: details.events.syncPlayResolutionState,
      syncPlaySessionMatchCount: details.events.syncPlaySessionMatchCount,
      syncPlayCurrentUserSessionCount: details.events.syncPlayCurrentUserSessionCount,
      syncPlaySameAccountMultiClient: details.events.syncPlaySameAccountMultiClient,
      syncPlayAmbiguousSession: details.events.syncPlayAmbiguousSession,
      syncPlayGroupCount: details.events.syncPlayGroupCount,
      syncPlayGroupsUnavailable: details.events.syncPlayGroupsUnavailable,
      syncPlayInGroup: details.events.syncPlayInGroup,
      syncPlayActiveGroupId: details.events.syncPlayActiveGroupId,
      syncPlayNotInRoomReason: details.events.syncPlayNotInRoomReason,
      syncPlayRoomInGroup: details.events.syncPlayRoomInGroup,
      syncPlayRoomGroupId: details.events.syncPlayRoomGroupId,
      syncPlayRoomExactMembership: details.events.syncPlayRoomExactMembership,
      syncPlayRoomMembershipSource: details.events.syncPlayRoomMembershipSource,
      syncPlayClientSignalSource: details.events.syncPlayClientSignalSource,
      syncPlayClientSignalGroupId: details.events.syncPlayClientSignalGroupId,
      syncPlayClientSignalKnown: details.events.syncPlayClientSignalKnown,
      syncPlayClientSignalInGroup: details.events.syncPlayClientSignalInGroup,
      lastSyncPlayResolutionError: details.events.lastSyncPlayResolutionError,
      unreadChatIndicatorActive: details.events.unreadChatIndicatorActive,
      playbackActivityIndicatorActive: details.events.playbackActivityIndicatorActive,
      replyActive: topLevel.replyActive,
      contextMenuOpen: topLevel.contextMenuOpen,
      messageActionMenuOpen: topLevel.messageActionMenuOpen,
      typingRemoteCount: details.events.typingRemoteCount,
      runtimeShell: details.layout.runtimeShell,
      clientShell: details.layout.clientShell,
      isJellyfinDesktop: details.layout.isJellyfinDesktop,
      layoutMode: details.layout.layoutMode,
      desktopVideoSafeMode: details.layout.desktopVideoSafeMode,
      desktopOverlayCssFallbackApplied: details.layout.desktopOverlayCssFallbackApplied,
      videoSurfaceInsetApplied: details.layout.videoSurfaceInsetApplied,
      videoSurfaceResizeSuppressed: details.layout.videoSurfaceResizeSuppressed,
      playerControlsInsetApplied: details.layout.playerControlsInsetApplied,
      playerSubtitlesInsetApplied: details.layout.playerSubtitlesInsetApplied,
      headerControlsInsetApplied: details.layout.headerControlsInsetApplied,
      videoRoute: details.layout.videoRoute,
      fullscreen: details.layout.isFullscreen
    };
  }

  function buildLast(): DebugRecord {
    return {
      error: topLevel.lastError,
      injectionError: topLevel.lastInjectionError,
      sequence: details.events.lastSequence,
      eventPollAt: details.events.lastEventPollAt,
      eventPostAt: details.events.lastEventPostAt,
      eventRoundTripMs: details.events.lastEventRoundTripMs,
      playbackEventType: details.playback.lastPlaybackEventType,
      playbackEventPostAt: details.playback.lastPlaybackEventPostAt,
      reactionEmoji: details.reactions.lastReactionEmoji,
      reactionSentAt: details.reactions.lastReactionSentAt,
      reactionReceivedAt: details.reactions.lastReactionReceivedAt,
      copiedMessageId: topLevel.lastCopiedMessageId,
      highlightedMessageId: topLevel.highlightedMessageId,
      messageAction: topLevel.lastMessageAction,
      layoutUpdateAt: details.layout.lastLayoutUpdateAt,
      apiMethod: topLevel.lastApiMethod,
      apiPath: topLevel.lastApiPath,
      apiUrlPath: topLevel.lastApiUrlPath,
      apiUrlSource: topLevel.lastApiUrlSource,
      apiUrlError: topLevel.lastApiUrlError,
      apiStatus: topLevel.lastApiStatus,
      apiError: topLevel.lastApiError
    };
  }

  function buildDetails(): DetailGroups {
    const snapshot = createDetails();
    detailGroupNames.forEach((group) => {
      snapshot[group] = cloneRecord(details[group]);
    });
    snapshot.layout.drawerOpen = topLevel.drawerOpen;
    snapshot.layout.drawerSide = topLevel.drawerSide;
    snapshot.layout.drawerWidth = topLevel.drawerWidth;
    snapshot.layout.drawerWidthSource = topLevel.drawerWidthSource;
    snapshot.layout.drawerResizeActive = topLevel.drawerResizeActive;
    snapshot.layout.drawerWidthMin = topLevel.drawerWidthMin;
    snapshot.layout.drawerWidthMax = topLevel.drawerWidthMax;
    snapshot.layout.drawerBackgroundAlpha = topLevel.drawerBackgroundAlpha;
    snapshot.layout.drawerBackgroundAlphaSource = topLevel.drawerBackgroundAlphaSource;
    snapshot.events.replyActive = topLevel.replyActive;
    snapshot.events.replyTargetEventId = topLevel.replyTargetEventId;
    snapshot.events.replyTargetFound = topLevel.replyTargetFound;
    snapshot.events.contextMenuOpen = topLevel.contextMenuOpen;
    snapshot.events.lastCopiedMessageId = topLevel.lastCopiedMessageId;
    snapshot.events.highlightedMessageId = topLevel.highlightedMessageId;
    snapshot.events.groupedMessageCount = topLevel.groupedMessageCount;
    snapshot.events.messageActionMenuOpen = topLevel.messageActionMenuOpen;
    snapshot.events.lastMessageAction = topLevel.lastMessageAction;
    snapshot.reactions.reactionEventCount = topLevel.reactionEventCount;
    snapshot.reactions.reactionOverlayCount = topLevel.reactionOverlayCount;
    snapshot.playback.playbackEventCount = topLevel.playbackEventCount;
    snapshot.lifecycle.rootCount = topLevel.rootCount;
    snapshot.lifecycle.buttonCount = topLevel.buttonCount;
    snapshot.lifecycle.triggerCount = topLevel.triggerCount;
    snapshot.lifecycle.intervalCount = topLevel.intervalCount;
    snapshot.lifecycle.listenerCount = topLevel.listenerCount;
    return snapshot;
  }

  function getSummary(): DebugRecord {
    const summary = cloneRecord(topLevel);
    summary.counts = buildCounts();
    summary.status = buildStatus();
    summary.last = buildLast();
    return summary;
  }

  function dump(): DebugRecord {
    const snapshot = getSummary();
    snapshot.details = buildDetails();
    return snapshot;
  }

  function reset(): DebugRecord {
    const resetValues: DebugRecord = {
      eventCount: 0,
      playbackEventCount: 0,
      reactionEventCount: 0,
      submitCount: 0,
      confirmedOptimisticEventCount: 0,
      lastError: null,
      lastInjectionError: null,
      lastImmediateRefreshAt: null,
      lastOptimisticClientEventId: null,
      lastOptimisticActorName: null,
      lastResolvedActorName: null,
      lastActorFallbackReason: null,
      lastConfirmedClientEventId: null,
      lastTimelineMergeStrategy: null,
      lastTimelinePreservedCount: 0,
      lastTimelineReplacedCount: 0,
      lastTimelineAddedCount: 0,
      lastTimelineUpdatedCount: 0,
      lastTimelineClearedAt: null,
      timelineContainerRemountCount: 0,
      lastScrollPreservedAt: null,
      lastAutoScrollReason: null,
      lastEventRoundTripMs: null,
      lastEventMergeCount: 0,
      lastEventPollAt: null,
      lastEventPostAt: null,
      replyActive: false,
      replyTargetEventId: null,
      replyTargetFound: false,
      contextMenuOpen: false,
      lastCopiedMessageId: null,
      highlightedMessageId: null,
      groupedMessageCount: 0,
      messageActionMenuOpen: false,
      lastMessageAction: null,
      lastPlaybackEventType: null,
      lastPlaybackEventPostAt: null,
      lastPlaybackSuppressedReason: null,
      lastPauseDetectedAt: null,
      lastPlayDetectedAt: null,
      lastSeekStartedAt: null,
      lastSeekSettledAt: null,
      lastSeekFromSeconds: null,
      lastSeekToSeconds: null,
      lastSeekDirection: null,
      lastSeekSuppressedReason: null,
      lastSeekDeltaSeconds: null,
      lastSeekIntentAgeMs: null,
      lastSeekCandidateFromSeconds: null,
      lastSeekCandidateToSeconds: null,
      lastSeekCandidateReason: null,
      seekInProgress: false,
      seekSuppressPlaybackUntil: null,
      lastLocalPlaybackInputAt: null,
      lastLocalPlaybackInputType: null,
      lastLocalPlaybackInputTarget: null,
      lastLocalPlayPauseIntentAt: null,
      lastLocalSeekIntentAt: null,
      lastPlaybackStartAt: null,
      lastPlaybackStartTitle: null,
      lastPlaybackStartItemId: null,
      lastSeekEventAt: null,
      lastReactionEmoji: null,
      lastReactionSentAt: null,
      lastReactionReceivedAt: null,
      lastReactionClientEventId: null,
      lastReactionDroppedReason: null,
      lastQuickReactionEditAction: null,
      lastFocusReason: "",
      lastGroupedAt: null,
      lastApiMethod: "",
      lastApiPath: "",
      lastApiUrlPath: "",
      lastApiUrlSource: "",
      lastApiUrlError: null,
      lastApiStatus: null,
      lastApiError: null,
      lastControlsVisibleAt: null,
      lastControlsHiddenAt: null,
      lastControlsVisibilityReason: null,
      lastTriggerMountError: null,
      lastLayoutUpdateAt: null,
      lastFullscreenLayoutAt: null,
      lastFullscreenChangeAt: null,
      rootMoveCount: 0
    };

    Object.entries(resetValues).forEach(([key, value]) => {
      setValue(key, value);
    });

    return dump();
  }

  function setVerbose(enabled: boolean): DebugRecord {
    verbose = enabled === true;
    return verbose ? dump() : getSummary();
  }

  const target: DebugRecord = {};
  const proxy = new Proxy(target, {
    get(_target, property) {
      if (typeof property === "symbol") {
        if (property === Symbol.toStringTag) {
          return "JellyChatDebug";
        }

        return undefined;
      }

      if (property === "counts") return buildCounts();
      if (property === "status") return buildStatus();
      if (property === "last") return buildLast();
      if (property === "details") return buildDetails();
      if (property === "dump") return dump;
      if (property === "reset") return reset;
      if (property === "setVerbose") return setVerbose;
      if (property === "getSummary") return getSummary;

      return getValue(property);
    },

    set(_target, property, value) {
      if (typeof property === "symbol" || structuredKeySet.has(property) || helperKeySet.has(property)) {
        return true;
      }

      setValue(property, value);
      return true;
    },

    has(_target, property) {
      if (typeof property === "symbol") {
        return false;
      }

      return summaryKeySet.has(property)
        || structuredKeySet.has(property)
        || helperKeySet.has(property)
        || fieldGroups.has(property)
        || detailGroupNames.some((group) => Object.prototype.hasOwnProperty.call(details[group], property));
    },

    ownKeys() {
      const keys = summaryKeys.concat(structuredKeys, helperKeys);
      if (verbose) {
        detailGroupNames.forEach((group) => {
          keys.push(...Object.keys(details[group]));
        });
      }

      return Array.from(new Set(keys));
    },

    getOwnPropertyDescriptor(_target, property) {
      if (typeof property === "symbol") {
        return undefined;
      }

      if (!(property in proxy)) {
        return undefined;
      }

      return {
        configurable: true,
        enumerable: !helperKeySet.has(property),
        value: proxy[property],
        writable: !structuredKeySet.has(property) && !helperKeySet.has(property)
      };
    }
  }) as DebugRecord;

  Object.entries(defaultValues()).forEach(([key, value]) => {
    setValue(key, value);
  });

  if (previous) {
    Object.keys(previous).forEach((key) => {
      if (!structuredKeySet.has(key) && !helperKeySet.has(key)) {
        setValue(key, previous[key]);
      }
    });
  }

  window.JellyChatDebug = proxy as Window["JellyChatDebug"];
  return proxy;
}
