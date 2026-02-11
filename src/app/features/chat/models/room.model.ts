// models/room.model.ts

import {UserModelSummary} from './user.model';

export type RoomType =
  | 'direct'    // 1-on-1 chat
  | 'group'     // Small group chat
  | 'channel'   // Public/private channel
  | 'thread';   // Message thread

export type RoomPrivacy = 'public' | 'private' | 'secret';

export interface RoomMember {
  user: UserModelSummary;
  joinedAt: Date;
  invitedBy?: UserModelSummary;
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
  id: string; // Alternative ID if needed
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

  // Metadata
  createdAt: number;
  createdBy: UserModelSummary;
  updatedAt?: number;
  lastMessage?: {
    id: string;
    preview: string;
    sender: UserModelSummary;
  };
  unreadCount: number;

  // Members
  participants: RoomMember[];
}
