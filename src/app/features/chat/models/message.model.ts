
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

export interface MessageModel {
  // Core identifiers
  id: string;
  roomId: string;
  type: MessageType;

  // Content
  content: MessageContent;

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
    //roles: UserRole[]; // Roles mentioned (@admin, @everyone)
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
