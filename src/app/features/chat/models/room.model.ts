// models/room.model.ts


import {UserModel, UserModelSummary} from './user.model';
import {MessageModel} from '@features/chat/models/message.model';

export type RoomType =
  | 'direct'    // 1-on-1 chat
  | 'group'     // Small group chat
  | 'channel'   // Public/private channel
  | 'thread';   // Message thread

export type RoomPrivacy = 'public' | 'private' | 'secret';

export interface RoomMember {
  user: UserModel;
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
  lastMessageAt?: number;
  lastMessageId?: string;
  lastMessage?: MessageModel; // Populated for convenience
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


export interface RoomNotificationOverride {
  enabled: boolean;
  sound: boolean;
  preview: boolean;
  mentionsOnly: boolean;
}

export type RoomSendMessageHandler = (
  text: string,
) => Promise<void>;

export interface RoomDescriptor {
  instance: RoomModel,
  sendMessage: RoomSendMessageHandler,
}

export interface RoomModel {
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
  createdAt: number;
  createdBy: UserModelSummary;
  updatedAt?: number;

  // Members
  members: RoomMember[];
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
