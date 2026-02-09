// ============================================
// USER TYPES
// ============================================

export type UserPresence =
  | 'available'      // Actively available (default)
  | 'away'           // Temporarily away
  | 'do_not_disturb' // Busy, notifications muted
  | 'offline'        // Not connected
  | 'invisible';     // Hidden from others

export type UserConnection =
  | 'mobile'         // Connected via mobile
  | 'tablet'         // Connected via tablet
  | 'desktop'        // Connected via desktop app
  | 'web'            // Connected via browser
  | 'bot';           // Automated system/bot

export interface DeviceInfo {
  os?: string;
  browser?: string;
  version?: string;
  deviceModel?: string;
  ipAddress?: string;
  location?: {
    country?: string;
    city?: string;
    timezone?: string;
  };
}

export interface UserStatus {
  presence: UserPresence;
  connection: UserConnection;
  lastSeen: Date;
  customMessage?: string;  // e.g., "In a meeting until 3PM"
  expiresAt?: Date;        // Auto-reset time
  deviceInfo?: DeviceInfo;
  activities?: UserActivity[];
}

export type UserRole =
  | 'owner'     // Room creator, full permissions
  | 'admin'     // Administrative permissions
  | 'moderator' // Moderator permissions
  | 'member'    // Regular member
  | 'guest';    // Limited permissions

export type UserActivity =
  | 'typing'           // Actively typing
  | 'recording'        // Recording audio/video
  | 'uploading'        // Uploading file
  | 'editing'          // Editing message
  | 'reacting'         // Reacting to message
  | 'poll_voting'      // Voting in poll
  | 'call_active'      // In active call
  | 'screen_sharing';  // Sharing screen

export interface ChatUser {
  id: string;
  name: string;
  displayName?: string;  // Optional display name override
  avatar?: string;
  banner?: string;       // Profile banner image
  status: UserStatus;
  role: UserRole;
  isBot?: boolean;
  isVerified?: boolean;
  metadata?: {
    email?: string;
    phone?: string;
    bio?: string;
    title?: string;      // Job title
    department?: string;
    timezone?: string;
    locale?: string;     // Language preference
  };
  preferences?: {
    theme?: 'light' | 'dark' | 'auto';
    notifications?: NotificationPreferences;
    privacy?: PrivacySettings;
  };
}

export interface ChatUserSummary {
  id: string;
  name: string;
  avatar?: string;
  displayName?: string;
}

// ============================================
// MESSAGE TYPES
// ============================================

export type MessageType =
  | 'text'        // Plain text message
  | 'rich_text'   // Formatted text (markdown, etc.)
  | 'image'       // Image file
  | 'video'       // Video file
  | 'audio'       // Audio file/voice message
  | 'file'        // Generic file
  | 'poll'        // Poll message
  | 'event'       // System event (join, leave, etc.)
  | 'call'        // Call start/end
  | 'location'    // Location sharing
  | 'contact'     // Contact sharing
  | 'sticker'     // Sticker/emoji
  | 'reply'       // Reply to another message
  | 'forwarded'   // Forwarded message
  | 'deleted';    // Deleted message placeholder

export type MessageStatus =
  | 'sending'     // Being sent to server
  | 'sent'        // Sent to server
  | 'delivered'   // Delivered to recipients
  | 'read'        // Read by recipient(s)
  | 'failed'      // Failed to send
  | 'edited';     // Message was edited

export interface MessageReaction {
  emoji: string;
  count: number;
  users: string[]; // User IDs who reacted
}

export interface MessageMetadata {
  clientId?: string;     // Client-generated ID for optimistic updates
  tempId?: string;       // Temporary ID for reconciliation
  editedAt?: Date;
  editedBy?: string;
  deletedAt?: Date;
  deletedBy?: string;
  forwardCount?: number;
  replyDepth?: number;   // How deep in reply chain
  isPinned?: boolean;
  pinnedBy?: string;
  pinnedAt?: Date;
  // Centrifugo metadata
  offset?: number;       // Stream position offset
  epoch?: string;        // Stream epoch
  channel?: string;      // Centrifugo channel name
}

export interface MessageContent {
  text?: string;
  html?: string;         // Rendered HTML for rich text
  markdown?: string;     // Markdown source
  attachments?: MessageAttachment[];
  poll?: PollData;
  location?: LocationData;
  contact?: ContactData;
  call?: CallData;
}

export interface MessageAttachment {
  id: string;
  type: 'image' | 'video' | 'audio' | 'file' | 'sticker';
  url: string;
  thumbnailUrl?: string;
  name: string;
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;     // For audio/video in seconds
  caption?: string;
  uploadedAt: Date;
  uploadedBy: string;
}

export interface PollData {
  question: string;
  options: PollOption[];
  settings: {
    isAnonymous: boolean;
    allowsMultiple: boolean;
    allowsAddOptions: boolean;
    expiresAt?: Date;
  };
  results?: PollResults;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
  votedBy: string[]; // User IDs who voted for this option
}

export interface PollResults {
  totalVotes: number;
  userVotes: Record<string, string[]>; // userId -> optionIds[]
}

export interface LocationData {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  accuracy?: number; // Meters
}

export interface ContactData {
  name: string;
  phone?: string;
  email?: string;
  avatar?: string;
  vcard?: string; // vCard data
}

export interface CallData {
  callId: string;
  type: 'audio' | 'video' | 'screen_share';
  duration?: number; // In seconds
  participants: string[]; // User IDs
  status: 'initiated' | 'ongoing' | 'ended' | 'missed';
  endedAt?: Date;
}

export interface ChatMessage {
  // Core identifiers
  id: string;
  roomId: string;
  type: MessageType;

  // Content
  content: MessageContent;

  // Author information
  author: ChatUser;

  // Timeline
  createdAt: Date;
  updatedAt?: Date;
  expiresAt?: Date; // For ephemeral messages

  // Status tracking
  status: MessageStatus;
  readBy: string[]; // User IDs who have read the message
  deliveredTo: string[]; // User IDs who have received the message

  // Interactions
  reactions: MessageReaction[];
  replyCount: number;
  threadId?: string; // If this message started a thread
  parentMessageId?: string; // If this is a reply
  mentions: {
    users: string[]; // User IDs mentioned
    roles: UserRole[]; // Roles mentioned (@admin, @everyone)
    channels: string[]; // Channel mentions
  };

  // Metadata
  metadata: MessageMetadata;

  // Moderation
  isFlagged?: boolean;
  flaggedBy?: string[];
  flaggedReason?: string;
  moderatedAt?: Date;
  moderatedBy?: string;

  // Encryption (for E2EE)
  encrypted?: boolean;
  encryptionKeyId?: string;
}

// ============================================
// ROOM TYPES
// ============================================

export type RoomType =
  | 'direct'    // 1-on-1 chat
  | 'group'     // Small group chat
  | 'channel'   // Public/private channel
  | 'thread';   // Message thread

export type RoomPrivacy = 'public' | 'private' | 'secret';

export interface RoomMember {
  user: ChatUser;
  userId: string; // For quick lookups
  joinedAt: Date;
  invitedBy?: string;
  lastRead?: Date;
  lastReadMessageId?: string;
  mutedUntil?: Date;
  isTyping?: boolean;
  typingStartedAt?: Date;
  notificationSettings?: MemberNotificationSettings;
  customTitle?: string; // Custom title/role in this room
}

export interface MemberNotificationSettings {
  mentionsOnly: boolean;
  muteUntil?: Date;
  desktop: boolean;
  mobile: boolean;
  email: boolean;
  push: boolean;
  sound: boolean;
  highlightKeywords?: string[];
}

export interface RoomSettings {
  isArchived: boolean;
  isReadOnly: boolean;
  requiresInvite: boolean;
  allowReactions: boolean;
  allowThreads: boolean;
  allowPolls: boolean;
  allowFiles: boolean;
  allowVoiceMessages: boolean;
  allowScreenSharing: boolean;
  slowMode?: number; // Seconds between messages
  maxFileSize?: number; // In bytes
  allowedFileTypes?: string[]; // MIME types or extensions
  retentionPolicy?: {
    enabled: boolean;
    days?: number; // Delete messages older than X days
  };
}

export interface RoomModeration {
  adminIds: string[];
  moderatorIds: string[];
  bannedUserIds: string[];
  bannedUntil?: Record<string, Date>; // userId -> ban expiration
  mutedUserIds: string[];
  mutedUntil?: Record<string, Date>; // userId -> mute expiration
  autoModeration?: {
    blockLinks: boolean;
    blockProfanity: boolean;
    requireApproval: boolean; // New messages require mod approval
    spamFilter: boolean;
  };
}

export interface RoomActivity {
  lastMessageAt?: Date;
  lastMessageId?: string;
  lastMessage?: ChatMessage; // Populated for convenience
  activeUserIds: string[]; // Users active in last 15 minutes
  typingUserIds: string[]; // Users currently typing
  messageCount: number;
  lastActiveAt: Date;
}

export interface RoomNotifications {
  unreadCount: number;
  unreadMentionCount: number;
  lastReadMessageId?: string;
  isMuted: boolean;
  notificationSettings: {
    mentionsOnly: boolean;
    muteUntil?: Date;
    desktop: boolean;
    mobile: boolean;
    email: boolean;
    highlights: string[]; // Highlight on these keywords
  };
}

export interface RoomCustomization {
  tags: string[];
  color?: string;
  emoji?: string;
  banner?: string;
  theme?: 'light' | 'dark' | 'custom';
  customFields?: Record<string, any>;
}

export interface ChatRoom {
  // Core identifiers
  uuid: string;
  id?: string; // Alternative ID if needed
  name: string;
  displayName?: string; // Different from slug/ID
  slug?: string; // URL-friendly identifier

  // Description
  description?: string;
  topic?: string; // Current topic (can change frequently)

  // Visuals
  avatar?: string;
  banner?: string;

  // Classification
  type: RoomType;
  privacy: RoomPrivacy;
  category?: string; // For organizing rooms

  // Metadata
  createdAt: Date;
  createdBy: ChatUser;
  updatedAt?: Date;
  archivedAt?: Date;

  // Members
  members: RoomMember[];
  memberIds: string[]; // For quick lookups
  memberCount: number;
  maxMembers?: number;
  onlineCount: number; // Real-time count of online members

  // Settings
  settings: RoomSettings;

  // Moderation
  moderation: RoomModeration;

  // Activity
  activity: RoomActivity;

  // Notifications (user-specific - might be separated)
  notifications: RoomNotifications;

  // Customization
  customization: RoomCustomization;

  // Integrations
  integrations?: {
    webhooks?: WebhookInfo[];
    bots?: BotInfo[];
    connectedApps?: string[];
  };

  // Centrifugo specific
  centrifugo?: {
    channel: string;
    presenceChannel?: string;
    historyEnabled: boolean;
    recoveryEnabled: boolean;
  };

  // Parent relationship (for threads)
  parentRoomId?: string;
  parentMessageId?: string; // For thread rooms

  // Security
  encryption?: {
    enabled: boolean;
    algorithm?: string;
    keyId?: string;
  };
}

// Event types

export const ChatEventTypes = {
  TYPING_START: 'typing_start',
  TYPING_FINISH: 'typing_finish',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_UPDATED: 'message_updated',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_READ: 'message_read',
  USER_JOINED: 'user_joined',
  USER_LEFT: 'user_left',
  CONVERSATION_UPDATED: 'conversation_updated',
  CONVERSATION_DELETED: 'conversation_deleted',
  REACTION_ADDED: 'reaction_added',
  REACTION_REMOVED: 'reaction_removed',
} as const;

export type ChatEventType = typeof ChatEventTypes[keyof typeof ChatEventTypes];

export interface ChatEventBasePayload {
  roomId: string;
}

export interface ChatEventPayload {
  [ChatEventTypes.TYPING_START]: ChatEventBasePayload & {
    participant: ChatUserSummary;
  };

  [ChatEventTypes.TYPING_FINISH]: ChatEventBasePayload & {
    participant: ChatUserSummary;
  };

  [ChatEventTypes.MESSAGE_SENT]: ChatEventBasePayload & {
    messageId: string;
    text: string;
  };

  [ChatEventTypes.MESSAGE_UPDATED]: ChatEventBasePayload & {
    messageId: string;
    text: string;
  };

  [ChatEventTypes.MESSAGE_DELETED]: ChatEventBasePayload & {
    messageId: string;
  };

  [ChatEventTypes.MESSAGE_READ]: ChatEventBasePayload & {
    messageId: string;
    userId: string;
  };

  [ChatEventTypes.USER_JOINED]: ChatEventBasePayload & {
    userId: string;
  };

  [ChatEventTypes.USER_LEFT]: ChatEventBasePayload & {
    userId: string;
  };

  [ChatEventTypes.CONVERSATION_UPDATED]: ChatEventBasePayload;

  [ChatEventTypes.CONVERSATION_DELETED]: ChatEventBasePayload;

  [ChatEventTypes.REACTION_ADDED]: ChatEventBasePayload & {
    messageId: string;
    emoji: string;
    userId: string;
  };

  [ChatEventTypes.REACTION_REMOVED]: ChatEventBasePayload & {
    messageId: string;
    emoji: string;
    userId: string;
  };
}

// Type alias for ChatEvent
export type ChatEvent<T extends ChatEventType = ChatEventType> = {
  type: T;
  payload: ChatEventPayload[T];
};

// Helper function to create typed events
export function createChatEvent<T extends ChatEventType>(
  type: T,
  payload: ChatEventPayload[T]
): ChatEvent<T> {
  return {
    type,
    payload
  };
}

// ============================================
// HELPER TYPES & UTILITIES
// ============================================

export interface WebhookInfo {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  createdAt: Date;
  createdBy: string;
}

export interface BotInfo {
  id: string;
  name: string;
  avatar?: string;
  capabilities: string[];
  isActive: boolean;
}

export interface NotificationPreferences {
  global: {
    enabled: boolean;
    sound: boolean;
    preview: boolean;
  };
  rooms: Record<string, RoomNotificationOverride>;
}

export interface RoomNotificationOverride {
  enabled: boolean;
  sound: boolean;
  preview: boolean;
  mentionsOnly: boolean;
}

export interface PrivacySettings {
  showOnlineStatus: boolean;
  showLastSeen: boolean;
  showTyping: boolean;
  showReadReceipts: boolean;
  allowDirectMessages: 'everyone' | 'friends' | 'nobody';
  profileVisibility: 'public' | 'friends' | 'private';
}

// ============================================
// TYPE GUARDS & UTILITY FUNCTIONS
// ============================================

export const isDirectRoom = (room: ChatRoom): boolean => room.type === 'direct';
export const isGroupRoom = (room: ChatRoom): boolean => room.type === 'group';
export const isChannelRoom = (room: ChatRoom): boolean => room.type === 'channel';
export const isThreadRoom = (room: ChatRoom): boolean => room.type === 'thread';

export const isPublicRoom = (room: ChatRoom): boolean => room.privacy === 'public';
export const isPrivateRoom = (room: ChatRoom): boolean => room.privacy === 'private';
export const isSecretRoom = (room: ChatRoom): boolean => room.privacy === 'secret';

export const isUserOnline = (user: ChatUser): boolean =>
  user.status.presence !== 'offline' && user.status.presence !== 'invisible';

export const isUserAdmin = (user: ChatUser): boolean =>
  user.role === 'admin' || user.role === 'owner';

export const canUserSendMessage = (room: ChatRoom, user: ChatUser): boolean => {
  if (room.settings.isReadOnly) return false;
  if (room.moderation.bannedUserIds.includes(user.id)) return false;
  if (room.moderation.mutedUserIds.includes(user.id)) {
    const mutedUntil = room.moderation.mutedUntil?.[user.id];
    return !mutedUntil || new Date() > mutedUntil;
  }
  return true;
};

export const getRoomDisplayName = (
  room: ChatRoom,
  currentUserId: string
): string => {
  if (room.displayName) return room.displayName;

  if (isDirectRoom(room)) {
    const otherMember = room.members.find(m => m.userId !== currentUserId);
    return otherMember?.user.displayName || otherMember?.user.name || 'Direct Message';
  }

  return room.name;
};


// Helper for updating message status
export const updateMessageStatus = (
  message: ChatMessage,
  status: MessageStatus,
  userId?: string
): ChatMessage => {
  const updated = { ...message, status };

  if (status === 'read' && userId) {
    updated.readBy = [...new Set([...message.readBy, userId])];
  }

  if (status === 'delivered' && userId) {
    updated.deliveredTo = [...new Set([...message.deliveredTo, userId])];
  }

  if (status === 'edited') {
    updated.updatedAt = new Date();
    updated.metadata.editedAt = new Date();
    if (userId) updated.metadata.editedBy = userId;
  }

  return updated;
};
