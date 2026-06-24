import type { ChatActions, ChatMessage, ChatState, MessageGroupModel, RoomEvent, SyncPlayContext } from "../types";
import { getEvents, normalizeChatMessage, postChatMessage } from "../api/events";
import { fetchJson } from "../api/jellyfin";
import { countDebugNodes, formId, groupingWindowMs, groupMessages, inputId, logDebug, normalizeId, recordError, refreshIntervalMs } from "./util";
import { getActiveMountHost, getDrawerSide, handleFloatingButtonFocusChange, isDrawerOpen, moveJellyChatRootToHost, scheduleLayoutUpdate, setDrawerSide, showFloatingButton, updateLayout } from "./layout";

type Subscriber = (state: ChatState) => void;

let refreshInProgress = false;
let sendInProgress = false;
let eventFetchInProgress = false;
let historyMessages: ChatMessage[] = [];
let groupedMessages: MessageGroupModel[] = [];
let lastEventGroupId = "";
let lastSequence = 0;
let currentSyncPlayContext: SyncPlayContext = {
  inGroup: false,
  groupId: "",
  groupName: "",
  unavailable: true
};
let state: ChatState = {
  drawerOpen: false,
  drawerSide: getDrawerSide(),
  syncPlay: currentSyncPlayContext,
  messages: [],
  groups: [],
  sending: false
};

const subscribers = new Set<Subscriber>();

function emit(): void {
  state = {
    drawerOpen: isDrawerOpen(),
    drawerSide: getDrawerSide(),
    syncPlay: currentSyncPlayContext,
    messages: historyMessages.slice(),
    groups: groupedMessages.slice(),
    sending: sendInProgress
  };

  if (window.JellyChatDebug) {
    window.JellyChatDebug.messageCount = historyMessages.length;
    window.JellyChatDebug.groupCount = groupedMessages.length;
    window.JellyChatDebug.currentGroupId = currentSyncPlayContext.groupId;
    window.JellyChatDebug.lastSequence = lastSequence;
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

function mergeHistoryMessages(messages: ChatMessage[]): void {
  const byId: Record<string, ChatMessage> = {};
  historyMessages.forEach((message) => {
    if (message.id) byId[message.id] = message;
  });
  messages.forEach((message) => {
    if (message.id) byId[message.id] = message;
  });

  historyMessages = Object.keys(byId)
    .map((id) => byId[id])
    .sort((left, right) => {
      const leftSequence = Number(left.sequence || 0);
      const rightSequence = Number(right.sequence || 0);
      return leftSequence !== rightSequence
        ? leftSequence - rightSequence
        : String(left.createdAtUtc).localeCompare(String(right.createdAtUtc));
    });

  if (historyMessages.length > 100) {
    historyMessages = historyMessages.slice(historyMessages.length - 100);
  }

  lastSequence = historyMessages.reduce((maxSequence, message) => Math.max(maxSequence, Number(message.sequence || 0)), lastSequence);
  groupedMessages = groupMessages(historyMessages, groupingWindowMs);
  if (window.JellyChatDebug) {
    window.JellyChatDebug.lastSequence = lastSequence;
    window.JellyChatDebug.groupingWindowMs = groupingWindowMs;
    window.JellyChatDebug.lastGroupedAt = new Date().toISOString();
  }
  emit();
}

function updateLastSequenceFromEvents(events: RoomEvent[]): void {
  events.forEach((roomEvent) => {
    lastSequence = Math.max(lastSequence, Number(roomEvent.sequence || 0));
  });

  if (window.JellyChatDebug) {
    window.JellyChatDebug.lastSequence = lastSequence;
    window.JellyChatDebug.eventCount = Number(window.JellyChatDebug.eventCount || 0) + events.length;
  }
}

async function fetchChatEvents(forceFull: boolean): Promise<void> {
  if (eventFetchInProgress || !currentSyncPlayContext.inGroup || !currentSyncPlayContext.groupId) {
    return;
  }

  let shouldFetchFull = forceFull;
  if (lastEventGroupId !== currentSyncPlayContext.groupId) {
    lastEventGroupId = currentSyncPlayContext.groupId;
    lastSequence = 0;
    historyMessages = [];
    groupedMessages = [];
    shouldFetchFull = true;
  }

  eventFetchInProgress = true;
  try {
    const events = await getEvents(currentSyncPlayContext.groupId, lastSequence, 100, shouldFetchFull);
    if (window.JellyChatDebug) {
      window.JellyChatDebug.lastEventPollAt = new Date().toISOString();
    }
    updateLastSequenceFromEvents(events);
    const messages = events.map(normalizeChatMessage).filter((message): message is ChatMessage => !!(message && message.id && message.text));
    if (shouldFetchFull) {
      historyMessages = [];
      groupedMessages = [];
    }

    if (messages.length > 0 || shouldFetchFull) {
      mergeHistoryMessages(messages);
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
    unavailable: !!context.unavailable
  };

  if (!currentSyncPlayContext.inGroup || groupChanged) {
    historyMessages = [];
    groupedMessages = [];
    lastSequence = 0;
    lastEventGroupId = currentSyncPlayContext.groupId;
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

function getCurrentDeviceId(): string {
  if (!window.ApiClient) return "";
  if (typeof window.ApiClient.deviceId === "function") return window.ApiClient.deviceId() || "";
  if (typeof window.ApiClient._deviceId === "string") return window.ApiClient._deviceId;
  return "";
}

function matchesCurrentUser(session: any): boolean {
  const currentUserIds = getCurrentUserIds();
  if (!currentUserIds.length) return true;
  const sessionUserId = (session && session.UserId) || (session && session.User && session.User.Id) || "";
  return currentUserIds.some((id) => normalizeId(id) === normalizeId(sessionUserId));
}

function getCurrentSessionIds(sessions: any[]): string[] {
  return sessions.filter(matchesCurrentUser).map((session) => session && session.Id).filter((id): id is string => typeof id === "string" && id.length > 0);
}

function getCurrentSession(sessions: any[]): any | null {
  const currentDeviceId = normalizeId(getCurrentDeviceId());
  const matchingUserSessions = sessions.filter(matchesCurrentUser);
  if (currentDeviceId) {
    const exact = matchingUserSessions.find((session) => normalizeId(session && session.DeviceId) === currentDeviceId);
    if (exact) return exact;
  }
  return matchingUserSessions.length > 0 ? matchingUserSessions[0] : null;
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

function hasSyncPlayGroup(session: any): boolean {
  return extractSyncPlayGroupId(session).length > 0;
}

function buildSessionsPaths(): string[] {
  const paths = ["Sessions"];
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

function getGroupIdsForCurrentUserSessions(sessions: any[]): string[] {
  const groupIds: string[] = [];
  sessions.filter(matchesCurrentUser).forEach((session) => {
    const groupId = extractSyncPlayGroupId(session);
    if (groupId && !groupIds.includes(groupId)) groupIds.push(groupId);
  });
  return groupIds;
}

function findGroupsByGroupIds(groups: any[], groupIds: string[]): any[] {
  if (!groups.length || !groupIds.length) return [];
  const normalizedGroupIds = groupIds.map(normalizeId).filter(Boolean);
  return groups.filter((group) => normalizedGroupIds.includes(normalizeId(resolveSyncPlayGroupId(group))));
}

function buildCurrentIdentityTokens(sessions: any[]): string[] {
  const tokens: string[] = [];
  getCurrentUserIds().forEach((id) => {
    if (id && !tokens.includes(id)) tokens.push(id);
  });
  const currentUserName = getCurrentUserName();
  if (currentUserName && !tokens.includes(currentUserName)) tokens.push(currentUserName);
  getCurrentSessionIds(sessions).forEach((sessionId) => {
    if (sessionId && !tokens.includes(sessionId)) tokens.push(sessionId);
  });
  sessions.filter(matchesCurrentUser).forEach((session) => {
    const userName = (session && session.UserName) || (session && session.User && session.User.Name) || "";
    if (userName && !tokens.includes(userName)) tokens.push(userName);
  });
  return tokens;
}

function groupsContainCurrentUser(groups: any[], sessions: any[]): boolean {
  const tokens = buildCurrentIdentityTokens(sessions);
  if (tokens.length === 0) return false;
  return groups.some((group) => tokens.some((token) => objectContainsString(group, token)));
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

async function resolveCurrentSyncPlayContext(): Promise<SyncPlayContext> {
  if (!window.ApiClient) {
    return { inGroup: false, groupId: "", groupName: "", unavailable: true };
  }

  const sessions = await fetchSessions();
  const matchingUserSessions = sessions.filter(matchesCurrentUser);
  if (matchingUserSessions.length === 0) {
    return { inGroup: false, groupId: "", groupName: "", unavailable: false };
  }

  const groupIds = getGroupIdsForCurrentUserSessions(sessions);
  let groups: any[] = [];
  let groupsUnavailable = false;
  try {
    groups = normalizeGroupsResponse(await fetchJson("SyncPlay/List"));
  } catch (err) {
    groupsUnavailable = true;
    logDebug("SyncPlay list request failed", err);
  }

  if (groupIds.length > 0 || matchingUserSessions.some(hasSyncPlayGroup)) {
    const preferredGroupId = groupIds.length > 0 ? groupIds[0] : "";
    const matchingGroup = findGroupsByGroupIds(groups, groupIds)[0] || null;
    return {
      inGroup: true,
      groupId: preferredGroupId || resolveSyncPlayGroupId(matchingGroup),
      groupName: resolveSyncPlayGroupName(matchingGroup),
      unavailable: false
    };
  }

  if (groups.length > 0) {
    const matchingGroup = groups.filter((group) => groupsContainCurrentUser([group], sessions))[0] || null;
    if (matchingGroup) {
      return {
        inGroup: true,
        groupId: resolveSyncPlayGroupId(matchingGroup),
        groupName: resolveSyncPlayGroupName(matchingGroup),
        unavailable: false
      };
    }
  }

  return { inGroup: false, groupId: "", groupName: "", unavailable: groupsUnavailable };
}

async function refreshSyncPlayState(): Promise<void> {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    setCurrentSyncPlayContext(await resolveCurrentSyncPlayContext());
  } catch (err) {
    logDebug("Failed to refresh SyncPlay state", err);
    setCurrentSyncPlayContext({ inGroup: false, groupId: "", groupName: "", unavailable: true });
  } finally {
    refreshInProgress = false;
  }
}

export async function pollJellyChat(): Promise<void> {
  await refreshSyncPlayState();
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
      const sessions = await fetchSessions();
      const groups = normalizeGroupsResponse(await fetchJson("SyncPlay/List"));
      const currentSession = getCurrentSession(sessions);
      const groupIds = getGroupIdsForCurrentUserSessions(sessions);
      const groupsBySessionGroupIds = findGroupsByGroupIds(groups, groupIds);
      const relevantGroups = groups.filter((group) => groupsContainCurrentUser([group], sessions));
      const groupsForSend = groupsBySessionGroupIds.length > 0 ? groupsBySessionGroupIds : (relevantGroups.length > 0 ? relevantGroups : (groups.length === 1 ? [groups[0]] : []));
      const participants = extractParticipantsFromGroups(groupsForSend.length > 0 ? groupsForSend : groups);
      const preferredGroupId = groupIds.length > 0 ? groupIds[0] : resolveSyncPlayGroupId(groupsForSend[0] || groups[0]);
      const result = await postChatMessage({
        text: trimmedText,
        senderSessionId: currentSession && currentSession.Id,
        groupId: preferredGroupId,
        participants
      });

      if (window.JellyChatDebug) {
        window.JellyChatDebug.lastEventPostAt = new Date().toISOString();
      }

      if (result && result.id) {
        mergeHistoryMessages([result]);
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
  setInputFocused: (focused: boolean) => {
    if (window.JellyChatDebug) {
      window.JellyChatDebug.inputFocused = focused;
    }
  }
};

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
    bindEvent(document, "mousemove", () => showFloatingButton("mousemove"), { passive: true });
    bindEvent(document, "pointermove", () => showFloatingButton("pointermove"), { passive: true });
    bindEvent(document, "touchstart", () => showFloatingButton("touchstart"), { passive: true });
    bindEvent(document, "focusin", () => handleFloatingButtonFocusChange("focusin"));
    bindEvent(document, "focusout", () => handleFloatingButtonFocusChange("focusout"));
    bindEvent(window, "resize", () => scheduleLayoutUpdate("resize"));
    bindEvent(document, "fullscreenchange", () => {
      showFloatingButton("fullscreenchange");
      updateLayout("fullscreenchange");
      if (isDrawerOpen()) focusComposer("fullscreenchange");
    });
    bindEvent(window, "hashchange", () => {
      showFloatingButton("hashchange");
      scheduleLayoutUpdate("hashchange");
    });
    bindEvent(window, "popstate", () => {
      showFloatingButton("popstate");
      scheduleLayoutUpdate("popstate");
    });
    bindEvent(window, "jellychat-routechange", () => {
      showFloatingButton("routechange");
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
