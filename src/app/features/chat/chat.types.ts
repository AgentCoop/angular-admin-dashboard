// ============================================
// USER TYPES
// ============================================

import {Observable} from 'rxjs';
import {UserModelSummary} from '@features/chat/models/user.model';


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
    participant: UserModelSummary;
  };

  [ChatEventTypes.TYPING_FINISH]: ChatEventBasePayload & {
    participant: UserModelSummary;
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
