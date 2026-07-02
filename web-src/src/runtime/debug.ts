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
  "rootCount",
  "buttonCount",
  "intervalCount",
  "listenerCount",
  "messageCount",
  "timelineCount",
  "playbackEventCount",
  "reactionEventCount",
  "reactionOverlayCount",
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
  "isVideoRoute",
  "videoRoute",
  "isFullscreen",
  "triggerPlacement",
  "viewportWidth",
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
  "controlsInsetApplied",
  "floatingButtonAutoHidden",
  "lastFloatingButtonShowReason"
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
  "inputFocused",
  "submitCount",
  "lastFocusReason",
  "groupCount",
  "groupingWindowMs",
  "lastGroupedAt"
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
    fileTransformationRequired: false,
    injectedAssetVersion: "",
    injectionMarkerFound: false,
    assetCssLoaded: false,
    assetJsLoaded: false,
    mountCount: 0,
    rootCount: 0,
    buttonCount: 0,
    listenerCount: 0,
    intervalCount: 0,
    currentGroupId: "",
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
    supportedEventTypes: ["chat.message", "reaction.emoji", "playback.start", "playback.play", "playback.pause", "playback.seek", "system.notice"],
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
    groupingWindowMs: 5 * 60 * 1000,
    lastGroupedAt: null,
    layoutMode: "normal-docked",
    isVideoRoute: false,
    videoRoute: false,
    isFullscreen: false,
    drawerOpen: false,
    drawerSide: getDrawerSide(),
    triggerPlacement: "normal",
    drawerWidth: 340,
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
    floatingButtonAutoHidden: false,
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
      interval: topLevel.intervalCount,
      listener: topLevel.listenerCount,
      message: topLevel.messageCount,
      timeline: topLevel.timelineCount,
      event: details.events.eventCount,
      playbackEvent: topLevel.playbackEventCount,
      reactionEvent: topLevel.reactionEventCount,
      reactionOverlay: topLevel.reactionOverlayCount
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
      layoutMode: details.layout.layoutMode,
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
      layoutUpdateAt: details.layout.lastLayoutUpdateAt
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
    snapshot.reactions.reactionEventCount = topLevel.reactionEventCount;
    snapshot.reactions.reactionOverlayCount = topLevel.reactionOverlayCount;
    snapshot.playback.playbackEventCount = topLevel.playbackEventCount;
    snapshot.lifecycle.rootCount = topLevel.rootCount;
    snapshot.lifecycle.buttonCount = topLevel.buttonCount;
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
      lastControlsVisibleAt: null,
      lastControlsHiddenAt: null,
      lastControlsVisibilityReason: null,
      lastLayoutUpdateAt: null,
      lastFullscreenLayoutAt: null,
      lastFullscreenChangeAt: null,
      lastFloatingButtonShowReason: null,
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
