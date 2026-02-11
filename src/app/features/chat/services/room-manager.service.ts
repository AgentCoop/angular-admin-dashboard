// room-manager.service.ts
import { Injectable, OnDestroy, Inject } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  Subject,
  Subscription,
  filter,
  map,
  takeUntil,
  shareReplay,
  distinctUntilChanged,
  combineLatest,
  catchError,
  of
} from 'rxjs';
import { ChatService, TopicChatEvents } from './chat.service';
import {
  RoomModel,
  RoomDescriptor,
  RoomMember,
  RoomSendMessageHandler
} from '../models/room.model';
import {
  UserModel,
  UserModelSummary,
} from '../models/user.model';
import {
  RoomDataProvider,
  ROOM_DATA_PROVIDER,
  LoadUserRoomsOptions
} from './room-data-provider.interface';

@Injectable({
  providedIn: 'root'
})
export class RoomManagerService implements OnDestroy {
  // ========== STATE ==========

  /** Active rooms by ID */
  private rooms = new Map<string, RoomModel>();
  private roomsSubject = new BehaviorSubject<RoomModel[]>([]);

  /** Room subscriptions for cleanup */
  private roomSubscriptions = new Map<string, Subscription>();

  /** Current user */
  private currentUser: UserModelSummary | null = null;

  /** Loading state */
  private loadingSubject = new BehaviorSubject<boolean>(false);
  loading$ = this.loadingSubject.asObservable();

  /** Error state */
  private errorSubject = new Subject<Error>();
  error$ = this.errorSubject.asObservable();

  // ========== OBSERVABLES ==========

  /** All active rooms */
  rooms$ = this.roomsSubject.asObservable();

  /** Rooms grouped by type */
  // roomsByType$ = this.rooms$.pipe(
  //   map(rooms => rooms.reduce((acc, room) => {
  //     const type = room.type;
  //     if (!acc[type]) acc[type] = [];
  //     acc[type].push(room);
  //     return acc;
  //   }, {} as Record<string, RoomDescriptor[]>)),
  //   shareReplay(1)
  // );

  /** Direct message rooms only */
  directRooms$ = this.rooms$.pipe(
    map(rooms => rooms.filter(r => r.type === 'direct')),
    shareReplay(1)
  );

  /** Group chat rooms only */
  groupRooms$ = this.rooms$.pipe(
    map(rooms => rooms.filter(r => r.type === 'group')),
    shareReplay(1)
  );

  /** Channel rooms only */
  channelRooms$ = this.rooms$.pipe(
    map(rooms => rooms.filter(r => r.type === 'channel')),
    shareReplay(1)
  );

  /** Thread rooms only */
  threadRooms$ = this.rooms$.pipe(
    map(rooms => rooms.filter(r => r.type === 'thread')),
    shareReplay(1)
  );

  /** Unread count across all rooms */
  totalUnreadCount$ = this.rooms$.pipe(
    map(rooms => rooms.reduce((sum, room) => sum + room.unreadCount, 0)),
    distinctUntilChanged(),
    shareReplay(1)
  );

  // ========== SUBSCRIPTIONS ==========
  private destroy$ = new Subject<void>();
  private chatEventsSubscription?: Subscription;

  constructor(
    private chatService: ChatService,
    @Inject(ROOM_DATA_PROVIDER) private roomDataProvider: RoomDataProvider,
    @Inject(Window) private window: Window
  ) {
    this.initializeUser();
    this.setupEventListeners();
  }

  // ========== INITIALIZATION ==========

  private initializeUser(): void {
    // Get current user from chat service or auth
    const user = this.chatService.getCurrentUser();
    if (user) {
      this.currentUser = {
        id: user.id,
        name: user.name,
        avatar: user.avatar
      };
    }
  }

  private setupEventListeners(): void {
    // Listen for typing events to update room activity
    this.chatService.events.typingStarted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ roomId, participant }) => {
        // Update room typing state (would be implemented in RoomModel)
        console.log(`User ${participant.name} typing in ${roomId}`);
      });

    // Listen for new messages
    this.chatService.events.messageSent$
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ roomId, messageId, text }) => {
        this.handleNewMessage(roomId, {
          id: messageId,
          preview: text,
          sender: this.chatService.getCurrentUserSummary() || null
        });
      });

    // Listen for connection status
    this.chatService.connectionStatus$
      .pipe(
        filter(status => status === 'disconnected'),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        console.log('Connection lost, marking rooms as offline');
        this.markAllRoomsOffline();
      });
  }

  // ========== PUBLIC API ==========

  /**
   * Load rooms for a user and subscribe to their channels
   */
  async loadUserRooms(
    userId: string,
    token?: string,
    options?: LoadUserRoomsOptions
  ): Promise<RoomModel[]> {
    this.loadingSubject.next(true);

    try {
      // Fetch rooms from data provider with options
      const rooms = await this.roomDataProvider.getUserRooms(userId, options);

      // Clear existing rooms
      this.clearAllRooms();

      // Initialize each room
      for (const room of rooms) {
        await this.initializeRoom(room, token, options);
      }

      return rooms;
    } catch (error) {
      console.error('Failed to load user rooms:', error);
      this.errorSubject.next(error as Error);
      throw error;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Close a room and clean up subscriptions
   */
  async closeRoom(roomId: string): Promise<void> {
    const descriptor = this.rooms.get(roomId);
    if (!descriptor) {
      console.log(`Room ${roomId} is not open`);
      return;
    }

    try {
      // Unsubscribe from room channel
      const subscription = this.roomSubscriptions.get(roomId);
      if (subscription) {
        subscription.unsubscribe();
        this.roomSubscriptions.delete(roomId);
      }

      // Remove from active rooms
      this.rooms.delete(roomId);
      this.emitRooms();

      console.log(`Room ${roomId} closed successfully`);
    } catch (error) {
      console.error(`Failed to close room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Get a room by ID
   */
  getRoom(roomId: string): RoomModel | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get all open rooms
   */
  getAllRooms(): RoomModel[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Check if room is open
   */
  isRoomOpen(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  /**
   * Archive a room
   */
  async archiveRoom(roomId: string, options?: LoadUserRoomsOptions): Promise<void> {
    if (!this.currentUser) return;

    try {
      await this.roomDataProvider.archiveRoom(roomId, this.currentUser.id);
      await this.closeRoom(roomId);
    } catch (error) {
      console.error(`Failed to archive room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Mute a room
   */
  async muteRoom(roomId: string, duration?: number): Promise<void> {
    if (!this.currentUser) return;

    try {
      await this.roomDataProvider.muteRoom(roomId, this.currentUser.id, duration);
    } catch (error) {
      console.error(`Failed to mute room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Unmute a room
   */
  async unmuteRoom(roomId: string): Promise<void> {
    if (!this.currentUser) return;

    try {
      await this.roomDataProvider.unmuteRoom(roomId, this.currentUser.id);
    } catch (error) {
      console.error(`Failed to unmute room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Leave a room
   */
  async leaveRoom(roomId: string): Promise<void> {
    if (!this.currentUser) return;

    try {
      await this.roomDataProvider.leaveRoom(roomId, this.currentUser.id);
      await this.closeRoom(roomId);
    } catch (error) {
      console.error(`Failed to leave room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a room
   */
  async deleteRoom(roomId: string): Promise<void> {
    try {
      await this.roomDataProvider.deleteRoom(roomId);
      await this.closeRoom(roomId);
    } catch (error) {
      console.error(`Failed to delete room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Close all rooms
   */
  async closeAllRooms(reason?: string): Promise<void> {
    const roomIds = Array.from(this.rooms.keys());
    const promises = roomIds.map(roomId => this.closeRoom(roomId));

    try {
      await Promise.allSettled(promises);
      console.log(`All ${roomIds.length} rooms closed${reason ? `: ${reason}` : ''}`);
    } catch (error) {
      console.error('Error closing all rooms:', error);
    }
  }

  /**
   * Get observable for a specific room
   */
  getRoom$(roomId: string): Observable<RoomModel | undefined> {
    return this.rooms$.pipe(
      map(rooms => rooms.find(r => r.id === roomId)),
      distinctUntilChanged((prev, curr) => prev?.id === curr?.id)
    );
  }

  // ========== PRIVATE METHODS ==========

  /**
   * Initialize a room: fetch details, subscribe to channel, create descriptor
   */
  private async initializeRoom(
    room: RoomModel,
    token?: string,
    options?: LoadUserRoomsOptions
  ): Promise<void> {
    // Check if already initialized
    if (this.rooms.has(room.id)) {
      return;
    }

    // Subscribe to room events
    this.subscribeToRoomEvents(room.id, token);

    // Store room
    this.rooms.set(room.id, room);
    this.emitRooms();

    return;
  }

  /**
   * Subscribe to room-specific Centrifugo channels
   */
  private subscribeToRoomEvents(roomId: string, token?: string): void {
    if (!token) {
      console.warn(`No subscription token provided for room ${roomId}`);
      return;
    }

    // Subscribe to room events channel
    const channel = `room-events:${roomId}`;

    // this.chatService.subscribeToChannel(TopicRoomEvents, channel, token)
    //   .then(() => {
    //     console.log(`Subscribed to room events: ${channel}`);
    //
    //     // Set up event listener for this room
    //     const subscription = this.chatService.eventBus$
    //       .pipe(
    //         filter(event => {
    //           const payload = event.payload as any;
    //           return payload?.roomId === roomId;
    //         }),
    //         takeUntil(this.destroy$)
    //       )
    //       .subscribe(event => {
    //         this.handleRoomEvent(roomId, event);
    //       });
    //
    //     this.roomSubscriptions.set(roomId, subscription);
    //   })
    //   .catch(error => {
    //     console.error(`Failed to subscribe to room ${roomId}:`, error);
    //   });
  }

  /**
   * Handle room events
   */
  private handleRoomEvent(roomId: string, event: any): void {
    const descriptor = this.rooms.get(roomId);
    if (!descriptor) return;

    switch (event.type) {
      case 'message_sent':
        // descriptor.instance.updatedAt = Date.now();
        // descriptor.instance.lastMessage = {
        //   id: event.payload.messageId,
        //   preview: event.payload.text,
        //   sender: event.payload.sender
        // };
        // // Increment unread count if not current user
        // if (event.payload.sender?.id !== this.currentUser?.id) {
        //   descriptor.instance.unreadCount++;
        // }
        break;

      case 'user_joined':
        // Handle user joined
        break;

      case 'user_left':
        // Handle user left
        break;
    }

    this.rooms.set(roomId, descriptor);
    this.emitRooms();
  }

  /**
   * Handle new message event
   */
  private handleNewMessage(
    roomId: string,
    message: { id: string; preview: string; sender: UserModelSummary | null }
  ): void {
    const descriptor = this.rooms.get(roomId);
    if (descriptor) {
      // descriptor.instance.updatedAt = Date.now();
      // descriptor.instance.lastMessage = {
      //   id: message.id,
      //   preview: message.preview,
      //   sender: message.sender || {
      //     id: 'system',
      //     name: 'System',
      //     avatar: undefined
      //   }
      // };

      // Increment unread count if not current user
      if (message.sender?.id !== this.currentUser?.id) {
        descriptor.unreadCount++;
      }

      this.rooms.set(roomId, descriptor);
      this.emitRooms();
    }
  }

  /**
   * Fetch room data with options
   */
  private async fetchRoomData(
    roomId: string,
    options?: LoadUserRoomsOptions
  ): Promise<RoomModel> {
    try {
      return await this.roomDataProvider.getRoomById(roomId, options);
    } catch (error) {
      console.error(`Failed to fetch room data for ${roomId}:`, error);

      // Return fallback room data
      return {
        id: roomId,
        name: `Room ${roomId}`,
        type: 'group',
        privacy: 'private',
        createdAt: Date.now(),
        createdBy: this.currentUser || {
          id: 'system',
          name: 'System',
          avatar: undefined
        },
        unreadCount: 0,
        participants: []
      } as RoomModel;
    }
  }

  /**
   * Mark all rooms as offline
   */
  private markAllRoomsOffline(): void {
    // This would update presence status
    console.log('All rooms marked offline');
  }

  /**
   * Clear all rooms
   */
  private clearAllRooms(): void {
    // Clean up subscriptions
    this.roomSubscriptions.forEach(sub => sub.unsubscribe());
    this.roomSubscriptions.clear();

    // Clear rooms
    this.rooms.clear();
    this.emitRooms();
  }

  /**
   * Emit current rooms list
   */
  private emitRooms(): void {
    this.roomsSubject.next(Array.from(this.rooms.values()));
  }

  // ========== LIFECYCLE ==========

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.chatEventsSubscription) {
      this.chatEventsSubscription.unsubscribe();
    }

    // Close all rooms on service destruction
    this.closeAllRooms('service_destroyed').catch(console.error);

    this.roomsSubject.complete();
    this.errorSubject.complete();
    this.loadingSubject.complete();
  }
}
