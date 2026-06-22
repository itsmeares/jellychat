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
};

export type ChatMessage = {
  id: string;
  sequence: number;
  groupId: string;
  userId: string;
  userName: string;
  text: string;
  createdAtUtc: string;
};

export type MessageGroupModel = {
  key: string;
  senderKey: string;
  userName: string;
  createdAtUtc: string;
  messages: ChatMessage[];
};

export type ChatState = {
  drawerOpen: boolean;
  syncPlay: SyncPlayContext;
  messages: ChatMessage[];
  groups: MessageGroupModel[];
  sending: boolean;
};

export type ChatActions = {
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
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
    __JELLYCHAT_HISTORY_PATCHED__?: boolean;
    __jellyChatLoaded?: boolean;
  }
}
