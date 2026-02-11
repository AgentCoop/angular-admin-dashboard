import {RoomNotificationOverride} from './room.model';

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

export interface NotificationPreferences {
  global: {
    enabled: boolean;
    sound: boolean;
    preview: boolean;
  };
  rooms: Record<string, RoomNotificationOverride>;
}

export interface PrivacySettings {
  showOnlineStatus: boolean;
  showLastSeen: boolean;
  showTyping: boolean;
  showReadReceipts: boolean;
  allowDirectMessages: 'everyone' | 'friends' | 'nobody';
  profileVisibility: 'public' | 'friends' | 'private';
}

export interface UserModel {
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

export interface UserModelSummary {
  id: string;
  name: string;
  avatar?: string;
}
