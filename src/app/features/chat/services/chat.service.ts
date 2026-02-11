// chat.service.ts
import { Injectable, OnDestroy, Inject } from '@angular/core';
import {BehaviorSubject, Observable, Subject, Subscription, merge, GroupedObservable, filter} from 'rxjs';
import {groupBy, debounceTime, map, take, mergeMap, takeUntil, throttleTime} from 'rxjs/operators';
import { WorkerProxyService } from '@core/communication/worker/worker-proxy.service';
import {
  ChatEvent,
  ChatEventTypes,
  ChatEventPayload,
  createChatEvent,
} from '../chat.types';
import {
  ServiceHandle,
} from '@core/communication/worker';
import {
  PubSubConfig, rpcBroadcastServerPublicationsMethodName,
  rpcBroadcastServerPublicationsParams,
  rpcSubscribeMethodName,
  rpcSubscribeParams
} from '@core/communication/worker/pubsub';
import {
  MessageContent,
  MessageModel,
  MessageReaction,
} from '../models/message.model';
import {
  UserModel,
  UserModelSummary
} from '../models/user.model';
import {
  RoomModel,
} from '../models/room.model';

export const TopicChatEvents = 'chat-events';
export const TopicChatOptimisticMessages = 'chat-optimistic-messages';
export const TopicChatCommands = 'chat-command-bus';

// Event observables interface
interface ChatEventObservables {
  typingStarted$: Observable<{ roomId: string; participant: UserModelSummary }>;
  typingFinished$: Observable<{ roomId: string; participant: UserModelSummary }>;
  messageSent$: Observable<{ roomId: string; messageId: string; text: string }>;
  messageUpdated$: Observable<{ roomId: string; messageId: string; text: string }>;
  messageDeleted$: Observable<{ roomId: string; messageId: string }>;
  messageRead$: Observable<{ roomId: string; messageId: string; userId: string }>;
  userJoined$: Observable<{ roomId: string; userId: string }>;
  userLeft$: Observable<{ roomId: string; userId: string }>;
  conversationUpdated$: Observable<{ roomId: string }>;
  conversationDeleted$: Observable<{ roomId: string }>;
  reactionAdded$: Observable<{ roomId: string; messageId: string; emoji: string; userId: string }>;
  reactionRemoved$: Observable<{ roomId: string; messageId: string; emoji: string; userId: string }>;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService implements OnDestroy {
  // Core state
  private messages = new Map<string, MessageModel[]>(); // roomId -> messages
  private rooms = new Map<string, RoomModel>();
  private users = new Map<string, UserModel>(); // Online users cache
  private currentUser: UserModel | null = null;
  private currentRoomId: string | null = null;

  // Worker handles
  private chatWorkerHandle: string | null = null;
  private pubSubHandle: ServiceHandle | null = null;
  private isPubSubInitialized = false;

  // Configuration
  private centrifugoUrl: string;

  private typingInput$ = new Subject<string>(); // roomId
  private manualTypingStop$ = new Subject<string>(); // roomId

  // Subjects for reactive state
  private messagesSubject = new BehaviorSubject<Map<string, MessageModel[]>>(this.messages);
  private roomsSubject = new BehaviorSubject<Map<string, RoomModel>>(this.rooms);
  private usersSubject = new BehaviorSubject<Map<string, UserModel>>(this.users);
  private currentRoomSubject = new BehaviorSubject<RoomModel | null>(null);

  // Event subjects
  private typingUsersSubject = new BehaviorSubject<Map<string, { roomId: string, user: UserModelSummary, timestamp: number }>>(new Map());
  //private presenceUpdatesSubject = new Subject<{ userId: string, presence: UserPresence }>();
  private connectionStatusSubject = new BehaviorSubject<'disconnected' | 'connecting' | 'connected'>('disconnected');

  // Event bus subjects
  private eventBusSubject = new Subject<ChatEvent>();

  // Individual event subjects for specific event types
  private typingStartedSubject = new Subject<ChatEventPayload['typing_start']>();
  private typingFinishedSubject = new Subject<ChatEventPayload['typing_finish']>();
  private messageSentSubject = new Subject<ChatEventPayload['message_sent']>();
  private messageUpdatedSubject = new Subject<ChatEventPayload['message_updated']>();
  private messageDeletedSubject = new Subject<ChatEventPayload['message_deleted']>();
  private messageReadSubject = new Subject<ChatEventPayload['message_read']>();
  private userJoinedSubject = new Subject<ChatEventPayload['user_joined']>();
  private userLeftSubject = new Subject<ChatEventPayload['user_left']>();
  private conversationUpdatedSubject = new Subject<ChatEventPayload['conversation_updated']>();
  private conversationDeletedSubject = new Subject<ChatEventPayload['conversation_deleted']>();
  private reactionAddedSubject = new Subject<ChatEventPayload['reaction_added']>();
  private reactionRemovedSubject = new Subject<ChatEventPayload['reaction_removed']>();

  // Subscriptions
  private syncSubscription?: Subscription;
  private userEventsSubscription?: Subscription;
  private roomEventsSubscription?: Subscription;
  private eventsSubscription?: Subscription;
  private destroy$ = new Subject<void>();

  // Public observables
  messages$: Observable<Map<string, MessageModel[]>>;
  rooms$: Observable<Map<string, RoomModel>>;
  currentRoom$: Observable<RoomModel | null>;
  //presenceUpdates$ = this.presenceUpdatesSubject.asObservable();
  connectionStatus$ = this.connectionStatusSubject.asObservable();

  // Event observables
  eventBus$ = this.eventBusSubject.asObservable();
  typingUsers$ = this.typingUsersSubject.asObservable();

  // Individual event observables
  events: ChatEventObservables = {
    typingStarted$: this.typingStartedSubject.asObservable(),
    typingFinished$: this.typingFinishedSubject.asObservable(),
    messageSent$: this.messageSentSubject.asObservable(),
    messageUpdated$: this.messageUpdatedSubject.asObservable(),
    messageDeleted$: this.messageDeletedSubject.asObservable(),
    messageRead$: this.messageReadSubject.asObservable(),
    userJoined$: this.userJoinedSubject.asObservable(),
    userLeft$: this.userLeftSubject.asObservable(),
    conversationUpdated$: this.conversationUpdatedSubject.asObservable(),
    conversationDeleted$: this.conversationDeletedSubject.asObservable(),
    reactionAdded$: this.reactionAddedSubject.asObservable(),
    reactionRemoved$: this.reactionRemovedSubject.asObservable(),
  };

  // Store optimistic messages temporarily
  private optimisticMessages = new Map<string, MessageModel>();
  private pendingRequests = new Map<string, { resolve: Function, reject: Function }>();

  // Configuration
  private readonly TYPING_DEBOUNCE_TIME = 300; // 300ms debounce before sending "start typing"
  private readonly TYPING_DURATION = 2000; // Send "stop typing" after 2 seconds of inactivity

  constructor(
    private workerProxy: WorkerProxyService,
    //@Inject('CENTRIFUGO_URL') centrifugoUrl: string,
  ) {
    //this.centrifugoUrl = centrifugoUrl;
    this.centrifugoUrl = 'ws://192.168.1.150:8005/connection/websocket';

    // Initialize observables
    this.messages$ = this.messagesSubject.asObservable();
    this.rooms$ = this.roomsSubject.asObservable();
    this.currentRoom$ = this.currentRoomSubject.asObservable();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  /**
   * Generates the Centrifugo channel name for chat events
   *
   * @returns Formatted channel string for chat events subscription
   * @throws {Error} If currentUser is not initialized
   */
  private getGlobalEventsChannel(): string {
    if (!this.currentUser?.id) {
      throw new Error('Cannot generate chat events channel: User not authenticated');
    }

    return `chat-events:${this.currentUser.id}`;
  }

  getCommandsChannel(): string {
    if (!this.currentUser?.id) {
      throw new Error('User not authenticated');
    }

    return `chat-commands:${this.currentUser.id}`;
  }

  getRoomTypingEventsChannel(roomId: string): string {
    return `chat-typings:${roomId}`;
  }

  // ========== PUBLIC API ==========

  /**
   * Initialize PubSub connection with auth token (called after login)
   */
  async initializePubSub(
    user: UserModel,
    tokens: { connectionToken: string, eventsToken: string, commandToken: string },
  ): Promise<void> {
    if (this.isPubSubInitialized) {
      console.warn('PubSub already initialized');
      return;
    }

    const { connectionToken, eventsToken, commandToken } = tokens;

    this.connectionStatusSubject.next('connecting');

    try {
      this.currentUser = user;

      // Create PubSub shared worker with the connection token
      this.pubSubHandle = this.workerProxy.createSharedWorker<PubSubConfig>('pubsub-worker', {
        url: this.centrifugoUrl,
        token: connectionToken,
      });
      this.isPubSubInitialized = true;

      // Receive all server events
      await this.workerProxy.invoke<rpcBroadcastServerPublicationsParams, void>(
        this.pubSubHandle,
        rpcBroadcastServerPublicationsMethodName,
        {
          topic: TopicChatEvents,
          channel: this.getGlobalEventsChannel(),
        }
      );

      await this.subscribeToChannel(TopicChatEvents, this.getRoomTypingEventsChannel('room_1'), eventsToken);
      await this.subscribeToChannel(TopicChatCommands, this.getCommandsChannel(), commandToken);

      // Initialize event bus listener
      this.initializeEventsSubscription();

      // Typing stream
      this.setupLocalTypingStream();

      this.connectionStatusSubject.next('connected');
      console.log('PubSub initialized successfully');

    } catch (error) {
      console.error('Failed to initialize PubSub worker:', error);
      this.connectionStatusSubject.next('disconnected');
      throw error;
    }
  }

  /**
   * Initialize listener for event bus data
   */
  private initializeEventsSubscription(): void {
    // Listen for event bus data from worker using the new subscribe syntax
    this.eventsSubscription = this.workerProxy.onTabSyncData<ChatEvent>(TopicChatEvents).subscribe({
      next: ({ value, metadata }) => {
        try {
          const event = value;
          this.handleEvent(event);
        } catch (error) {
          console.error('Error processing chat event:', error);
        }
      },
      error: (error) => {
        console.error('Chat events error:', error);
      },
      complete: () => {
        console.log('Chat events processing completed');
      }
    });
  }

  /**
   * Handle incoming chat events
   */
  private handleEvent(event: ChatEvent): void {
    // Emit to general event bus observable
    this.eventBusSubject.next(event);

    // Handle specific event types
    switch (event.type) {
      case 'typing_start':
        console.log('typing started');
        this.handleTypingStarted(event as ChatEvent<'typing_start'>);
        break;
      case 'typing_finish':
        console.log('typing finished');
        this.handleTypingFinished(event as ChatEvent<'typing_finish'>);
        break;
      case 'message_sent':
        this.handleMessageSent(event as ChatEvent<'message_sent'>);
        break;
      case 'message_updated':
        this.handleMessageUpdated(event as ChatEvent<'message_updated'>);
        break;
      case 'message_deleted':
        this.handleMessageDeleted(event as ChatEvent<'message_deleted'>);
        break;
      case 'message_read':
        this.handleMessageRead(event as ChatEvent<'message_read'>);
        break;
      case 'user_joined':
        this.handleUserJoined(event as ChatEvent<'user_joined'>);
        break;
      case 'user_left':
        this.handleUserLeft(event as ChatEvent<'user_left'>);
        break;
      case 'conversation_updated':
        this.handleConversationUpdated(event as ChatEvent<'conversation_updated'>);
        break;
      case 'conversation_deleted':
        this.handleConversationDeleted(event as ChatEvent<'conversation_deleted'>);
        break;
      case 'reaction_added':
        this.handleReactionAdded(event as ChatEvent<'reaction_added'>);
        break;
      case 'reaction_removed':
        this.handleReactionRemoved(event as ChatEvent<'reaction_removed'>);
        break;
      default:
        console.warn('Unknown event type:', event);
    }
  }

  // ========== TYPING EVENT HANDLERS ==========

  private setupLocalTypingStream(): void {
    // Track typing state per room
    const typingState = new Map<string, boolean>();

    this.typingInput$
      .pipe(
        groupBy(roomId => roomId),
        mergeMap((group$: GroupedObservable<string, string>) => {
          const roomId = group$.key;

          // Typing start stream: emit only if not already typing
          const start$ = group$.pipe(
            filter(() => !typingState.get(roomId)), // only if not already typing
            map(() => {
              typingState.set(roomId, true);
              return { type: 'typing_start' as const, roomId };
            })
          );

          // Typing stop stream: after idle or manual stop
          const stop$ = merge(
            group$.pipe(debounceTime(this.TYPING_DURATION)), // idle stop
            this.manualTypingStop$.pipe(filter(id => id === roomId)) // manual stop
          ).pipe(
            map(() => {
              typingState.set(roomId, false);
              return { type: 'typing_finish' as const, roomId };
            })
          );

          // Merge start + stop events for this room
          return merge(start$, stop$);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: ({ type, roomId }) => {
          this.sendTypingEvent(type, roomId);
        },
        error: error => console.error('Typing stream error:', error)
      });
  }


  /**
   * Notify that current user started typing in a room.
   * Call this on every key press.
   */
  typingStart(roomId: string): void {
    this.typingInput$.next(roomId);
  }

  typingEnd(roomId: string): void {
    this.manualTypingStop$.next(roomId);
  }

  async sendMessage(roomId: string, content: MessageContent): Promise<void> {


    return;
  }

  async subscribeToChannel(topic: string, channel: string, subToken: string): Promise<void> {
    if (!this.currentUser || !this.pubSubHandle) {
      throw new Error('User must be set before subscribing');
    }

    try {
      await this.workerProxy.invoke<rpcSubscribeParams, void>(
        this.pubSubHandle,
        rpcSubscribeMethodName,
        {
          topic,
          centrifugoChannel: channel,
          centrifugoToken: subToken,
        }
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Send typing event to server via worker using proper event types
   */
  private sendTypingEvent(
    eventType: typeof ChatEventTypes.TYPING_START | typeof ChatEventTypes.TYPING_FINISH,
    roomId: string,
  ): void {
    const u = this.getCurrentUserSummary();
    if (!this.pubSubHandle || !u) {
      console.error('PubSub or user are not initialized');
      return;
    }

    // Create the typing event using the helper function
    const event = createChatEvent(eventType, {
      roomId,
      participant: u,
    });

    this.workerProxy.syncTabData(
      this.pubSubHandle,
      TopicChatEvents,
      event,
      'add',
      {
        upstreamChannel: this.getRoomTypingEventsChannel(roomId),
        broadcast: false,
      }
    );
  }

  // ========== EVENT HANDLERS ==========

  private handleTypingStarted(event: ChatEvent<typeof ChatEventTypes.TYPING_START>): void {
    const { roomId, participant } = event.payload;

    // Add to typing users
    this.addTypingUser(roomId, participant);

    // Emit to specific observable
    this.typingStartedSubject.next({ roomId, participant });
  }

  private handleTypingFinished(event: ChatEvent<typeof ChatEventTypes.TYPING_FINISH>): void {
    const { roomId, participant } = event.payload;
    const typingKey = `${roomId}:${participant.id}`;

    // Remove from typing users
    this.removeTypingUser(roomId, participant);

    // Emit to specific observable
    this.typingFinishedSubject.next({ roomId, participant });
  }

  private handleMessageSent(event: ChatEvent<typeof ChatEventTypes.MESSAGE_SENT>): void {
    const { roomId, messageId, text } = event.payload;

    // Update room's last message
    const room = this.rooms.get(roomId);
    if (room) {
      //room.activity.lastMessageAt = new Date();
      //room.activity.lastMessageId = messageId;
      this.rooms.set(roomId, room);
      this.roomsSubject.next(new Map(this.rooms));
    }

    // Emit to specific observable
    this.messageSentSubject.next({ roomId, messageId, text });
  }

  private handleMessageUpdated(event: ChatEvent<'message_updated'>): void {
    const { roomId, messageId, text } = event.payload;

    // Update message in cache
    const roomMessages = this.messages.get(roomId);
    if (roomMessages) {
      const messageIndex = roomMessages.findIndex(msg => msg.id === messageId);
      if (messageIndex !== -1) {
        roomMessages[messageIndex].content.text = text;
        roomMessages[messageIndex].updatedAt = new Date();
        roomMessages[messageIndex].metadata.editedAt = new Date();

        this.messages.set(roomId, [...roomMessages]);
        this.messagesSubject.next(new Map(this.messages));
      }
    }

    // Emit to specific observable
    this.messageUpdatedSubject.next({ roomId, messageId, text });
  }

  private handleMessageDeleted(event: ChatEvent<'message_deleted'>): void {
    const { roomId, messageId } = event.payload;

    // Update message in cache to mark as deleted
    const roomMessages = this.messages.get(roomId);
    if (roomMessages) {
      const messageIndex = roomMessages.findIndex(msg => msg.id === messageId);
      if (messageIndex !== -1) {
        roomMessages[messageIndex].type = 'deleted';
        roomMessages[messageIndex].metadata.deletedAt = new Date();

        this.messages.set(roomId, [...roomMessages]);
        this.messagesSubject.next(new Map(this.messages));
      }
    }

    // Emit to specific observable
    this.messageDeletedSubject.next({ roomId, messageId });
  }

  private handleMessageRead(event: ChatEvent<'message_read'>): void {
    const { roomId, messageId, userId } = event.payload;

    // Update message read status
    const roomMessages = this.messages.get(roomId);
    if (roomMessages) {
      const message = roomMessages.find(msg => msg.id === messageId);
      if (message && !message.readBy.includes(userId)) {
        message.readBy.push(userId);
        this.messages.set(roomId, [...roomMessages]);
        this.messagesSubject.next(new Map(this.messages));
      }
    }

    // Emit to specific observable
    this.messageReadSubject.next({ roomId, messageId, userId });
  }

  private handleUserJoined(event: ChatEvent<'user_joined'>): void {
    const { roomId, userId } = event.payload;

    // Update room members
    const room = this.rooms.get(roomId);
    if (room) {
      // Add to room members if not already present
    }

    // Emit to specific observable
    this.userJoinedSubject.next({ roomId, userId });
  }

  private handleUserLeft(event: ChatEvent<'user_left'>): void {
    const { roomId, userId } = event.payload;

    // Update room members
    const room = this.rooms.get(roomId);
    if (room) {

    }

    // Emit to specific observable
    this.userLeftSubject.next({ roomId, userId });
  }

  private handleConversationUpdated(event: ChatEvent<'conversation_updated'>): void {
    const { roomId } = event.payload;

    // Trigger room refresh if needed
    this.refreshRoom(roomId);

    // Emit to specific observable
    this.conversationUpdatedSubject.next({ roomId });
  }

  private handleConversationDeleted(event: ChatEvent<'conversation_deleted'>): void {
    const { roomId } = event.payload;

    // Remove room from cache
    this.rooms.delete(roomId);
    this.messages.delete(roomId);

    // Update subjects
    this.roomsSubject.next(new Map(this.rooms));
    this.messagesSubject.next(new Map(this.messages));

    // If current room was deleted, clear it
    if (this.currentRoomId === roomId) {
      this.currentRoomId = null;
      this.currentRoomSubject.next(null);
    }

    // Emit to specific observable
    this.conversationDeletedSubject.next({ roomId });
  }

  private handleReactionAdded(event: ChatEvent<'reaction_added'>): void {
    const { roomId, messageId, emoji, userId } = event.payload;

    // Update message reactions
    const roomMessages = this.messages.get(roomId);
    if (roomMessages) {
      const message = roomMessages.find(msg => msg.id === messageId);
      if (message) {
        const existingReaction = message.reactions.find(r => r.emoji === emoji);
        if (existingReaction) {
          // Update existing reaction
          if (!existingReaction.users.includes(userId)) {
            existingReaction.users.push(userId);
            existingReaction.count++;
          }
        } else {
          // Add new reaction
          message.reactions.push({
            emoji,
            count: 1,
            users: [userId]
          });
        }

        this.messages.set(roomId, [...roomMessages]);
        this.messagesSubject.next(new Map(this.messages));
      }
    }

    // Emit to specific observable
    this.reactionAddedSubject.next({ roomId, messageId, emoji, userId });
  }

  private handleReactionRemoved(event: ChatEvent<'reaction_removed'>): void {
    const { roomId, messageId, emoji, userId } = event.payload;

    // Update message reactions
    const roomMessages = this.messages.get(roomId);
    if (roomMessages) {
      const message = roomMessages.find(msg => msg.id === messageId);
      if (message) {
        const reactionIndex = message.reactions.findIndex(r => r.emoji === emoji);
        if (reactionIndex !== -1) {
          const reaction = message.reactions[reactionIndex];
          const userIndex = reaction.users.indexOf(userId);
          if (userIndex !== -1) {
            reaction.users.splice(userIndex, 1);
            reaction.count--;

            // Remove reaction if no users left
            if (reaction.count === 0) {
              message.reactions.splice(reactionIndex, 1);
            }

            this.messages.set(roomId, [...roomMessages]);
            this.messagesSubject.next(new Map(this.messages));
          }
        }
      }
    }

    // Emit to specific observable
    this.reactionRemovedSubject.next({ roomId, messageId, emoji, userId });
  }

  // ========== HELPER METHODS ==========

  private addTypingUser(roomId: string, participant: UserModelSummary): void {
    const typingUsers = new Map(this.typingUsersSubject.value);
    typingUsers.set(participant.id, {
      roomId,
      user: participant,
      timestamp: Date.now()
    });
    this.typingUsersSubject.next(typingUsers);
  }

  private removeTypingUser(roomId: string, participant: UserModelSummary): void {
    const typingUsers = new Map(this.typingUsersSubject.value);
    typingUsers.delete(participant.id);
    this.typingUsersSubject.next(typingUsers);
  }

  private async refreshRoom(roomId: string): Promise<void> {
    // Implement room refresh logic here
    // This could fetch updated room data from the server
    console.log(`Refreshing room: ${roomId}`);
  }

  /**
   * Disconnect PubSub (called on logout)
   */
  disconnectPubSub(): void {
    // Clear typing users
    this.typingUsersSubject.next(new Map());

    // Unsubscribe from event bus
    if (this.eventsSubscription) {
      this.eventsSubscription.unsubscribe();
    }

    if (this.pubSubHandle) {
      this.workerProxy.terminateWorker(this.pubSubHandle);
    }

    this.isPubSubInitialized = false;
    this.connectionStatusSubject.next('disconnected');

    // Clear user-specific state
    this.currentUser = null;
    this.currentRoomId = null;
    this.currentRoomSubject.next(null);

    console.log('PubSub disconnected and state cleared');
  }

  /**
   * Get current user
   */
  getCurrentUser(): UserModel | null {
    return this.currentUser;
  }

  /**
   * Get typing users for a room
   */
  getTypingUsers(roomId: string): UserModelSummary[] {
    const typingUsers = Array.from(this.typingUsersSubject.value.values())
      .filter(typing => typing.roomId === roomId)
      .map(typing => typing.user);
    return typingUsers;
  }

  /**
   * Get current user's typing summary
   */
  getCurrentUserSummary(): UserModelSummary | null {
    if (!this.currentUser) return null;

    return {
      id: this.currentUser.id,
      name: this.currentUser.name,
      avatar: this.currentUser.avatar,
    };
  }

  // ========== CLEANUP ==========

  private cleanup(): void {
    this.destroy$.next();
    this.destroy$.complete();

    // Unsubscribe all
    if (this.syncSubscription) {
      this.syncSubscription.unsubscribe();
    }

    if (this.chatWorkerHandle) {
      this.workerProxy.terminateWorker(this.chatWorkerHandle);
    }

    if (this.eventsSubscription) {
      this.eventsSubscription.unsubscribe();
    }

    // Complete all subjects
    this.messagesSubject.complete();
    this.roomsSubject.complete();
    this.currentRoomSubject.complete();
    this.typingUsersSubject.complete();
    //this.presenceUpdatesSubject.complete();
    this.connectionStatusSubject.complete();
    this.eventBusSubject.complete();

    // Complete event-specific subjects
    this.typingStartedSubject.complete();
    this.typingFinishedSubject.complete();
    this.messageSentSubject.complete();
    this.messageUpdatedSubject.complete();
    this.messageDeletedSubject.complete();
    this.messageReadSubject.complete();
    this.userJoinedSubject.complete();
    this.userLeftSubject.complete();
    this.conversationUpdatedSubject.complete();
    this.conversationDeletedSubject.complete();
    this.reactionAddedSubject.complete();
    this.reactionRemovedSubject.complete();
  }
}
