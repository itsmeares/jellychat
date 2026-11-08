export type Theme = "violet" | "glass" | "custom";
export type UserTheme = Theme | "server";
export type Layout = "docked" | "floating";
export type Side = "left" | "right";
export type MessageStyle = "bubbles" | "flat";

export type ServerConfig = {
  theme: Theme;
  layout: Layout;
  messageSide: Side;
  messageStyle: MessageStyle;
  autoHide: boolean;
  shortcutEnabled: boolean;
  allowUserAppearance: boolean;
  customBase: "violet" | "glass";
  customCorners: "sharp" | "soft" | "pill";
  customGlass: boolean;
};

export type UserPrefs = {
  theme: UserTheme;
  layout: Layout | null;
  messageSide: Side | null;
  messageStyle: MessageStyle | null;
  autoHide: boolean | null;
  shortcut: boolean;
  quick: string[];
  favorites: string[];
  recent: string[];
};

export type DevicePrefs = {
  width: number;
  side: Side;
};

export type Resolved = {
  theme: Theme;
  layout: Layout;
  messageSide: Side;
  messageStyle: MessageStyle;
  autoHide: boolean;
  shortcut: boolean;
  locked: boolean;
  customBase: "violet" | "glass";
  customCorners: "sharp" | "soft" | "pill";
  customGlass: boolean;
  width: number;
  side: Side;
};

export type RoomInfo = {
  inGroup: boolean;
  groupId: string;
  groupName: string;
  sessionId: string;
  participants: string[];
  passwordProtected: boolean;
  authorized: boolean;
  isOwner: boolean;
};

export type ReplyTarget = {
  eventId: string;
  userId: string;
  userName: string;
  messagePreview: string;
  createdAt: string;
};

export type PlaybackAction = "start" | "play" | "pause" | "seek";

export type RoomEvent = {
  id: string;
  sequence: number;
  type: string;
  userId: string;
  userName: string;
  createdAt: string;
  text: string;
  replyTo: ReplyTarget | null;
  emoji: string;
  playbackAction: PlaybackAction | "";
  fromTicks: number | null;
  toTicks: number | null;
  positionSeconds: number | null;
  itemName: string;
  clientEventId: string;
  isTyping: boolean | null;
};

export type SyncResponse = {
  room: RoomInfo;
  events: RoomEvent[];
  roomVersion: string;
};

export type ChatMessage = {
  key: string;
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
  replyTo: ReplyTarget | null;
  mine: boolean;
  status: "sent" | "sending" | "failed";
};

export type PlaybackNotice = {
  key: string;
  userName: string;
  createdAt: string;
  action: PlaybackAction;
  itemName: string;
  toTicks: number | null;
  fromTicks: number | null;
};

export type TimelineItem =
  | { kind: "group"; key: string; userId: string; userName: string; mine: boolean; createdAt: string; messages: ChatMessage[] }
  | { kind: "playback"; key: string; notice: PlaybackNotice };
