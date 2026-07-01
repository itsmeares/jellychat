import { createRoot } from "react-dom/client";
import { ChatApp } from "./components/ChatApp";
import { getActiveMountHost, getDrawerSide, updateLayout } from "./runtime/layout";
import { cleanupDuplicateRoots, countDebugNodes, recordError, rootId, waitForStylesheet } from "./runtime/util";
import { startRuntime } from "./runtime/store";
import { defaultQuickReactions } from "./runtime/emoji";
import "./styles.css";

function initializeDebug(): void {
  window.JellyChatDebug = {
    ...(window.JellyChatDebug || {}),
    loaded: true,
    frontend: "react",
    mounted: false,
    reactMounted: false,
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
    lastError: null
  };
}

async function start(): Promise<void> {
  if (!document.body) {
    return;
  }

  if (window.__JELLYCHAT_LOADED__ === true) {
    if (window.console && typeof window.console.info === "function") {
      window.console.info("[JellyChat] duplicate script ignored");
    }
    return;
  }

  window.__JELLYCHAT_LOADED__ = true;
  initializeDebug();
  await waitForStylesheet();

  const activeHost = getActiveMountHost();
  let rootElement = cleanupDuplicateRoots(activeHost) || document.getElementById(rootId);
  if (!rootElement) {
    rootElement = document.createElement("div");
    rootElement.id = rootId;
    rootElement.setAttribute("data-jellychat-root", "true");
    activeHost.appendChild(rootElement);
  }

  const root = createRoot(rootElement);
  root.render(<ChatApp />);
  if (window.JellyChatDebug) {
    window.JellyChatDebug.mounted = true;
    window.JellyChatDebug.reactMounted = true;
    window.JellyChatDebug.mountCount = 1;
    window.JellyChatDebug.rootCount = 1;
  }
  countDebugNodes();
  updateLayout("react-mount");
  startRuntime();
}

function boot(): void {
  start().catch((error) => {
    recordError(error);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
