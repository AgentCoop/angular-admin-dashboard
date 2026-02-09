import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  OnInit, QueryList,
  signal,
  ViewChild,
  ViewChildren
} from '@angular/core';
import {CommonModule} from '@angular/common';
import {NavigationEnd, Router, RouterModule} from '@angular/router';
import {combineLatest, Subscription} from 'rxjs';
import {filter, map} from 'rxjs/operators';
import {FormsModule} from '@angular/forms';
import {StateService} from './core/services/state.service';
import {AuthService} from './core/services/auth.service';
import {ThemeService} from './core/services/theme.service';

import { ChatService } from './features/chat/chat.service';
import { ChatUserSummary, ChatUser } from './features/chat/chat.types';
import {v4 as uuid} from 'uuid';

import {
  Message,
  BaseMessageTypes,
  WorkerProxyService,
  ServiceHandle,
  BaseWorkerState
} from '@core/communication/worker'; // ✅ ADDED
import {AllMessageTypes} from '@core/communication/worker'; // ✅ ADDED
import {DraggableDirective, DragPosition} from '@core/drag-drop';
import {rpcSubscribeMethodName, rpcSubscribeParams} from '@core/communication/worker/pubsub';

interface ColoredSquare {
  id: number;
  color: string;
  name: string;
  position: { x: number; y: number };
}

interface DropzoneItem extends ColoredSquare {
  droppedAt: Date;
  zone: string;
}

interface DropzoneLog {
  timestamp: Date;
  message: string;
  type: 'enter' | 'leave' | 'drop' | 'error';
  zone: string;
}

interface DynamicZone {
  id: string;
  name: string;
  type: 'default' | 'priority' | 'review' | 'archive';
  capacity: number;
  items: ColoredSquare[];
}

// ✅ ADDED: Chat Window Interface
interface ChatWindow {
  id: number;
  title: string;
  position: { x: number; y: number };
  messages: ChatMessage[];
  newMessage: string;
  isMinimized: boolean;
  isConnected: boolean;
  unreadCount: number;
  color: string;
  tabId?: string; // Which tab sent the message
}

// ✅ ADDED: Chat Message Interface
interface ChatMessage {
  windowId: number;
  id: string;
  text: string;
  sender: string;
  timestamp: Date;
  isOwn: boolean;
  tabId: string; // Which tab sent the message
}

const ChatTopic = 'CHAT_MESSAGES';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    DraggableDirective
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class App implements OnInit, AfterViewInit, OnDestroy {
  // Services
  private router = inject(Router);
  private state = inject(StateService);
  private authService = inject(AuthService);
  private themeService = inject(ThemeService);
  private workerProxyService = inject(WorkerProxyService);
  private pubSubHandle: ServiceHandle | undefined;

  // ✅ ADDED: Chat Service
  private chatService = inject(ChatService);

  // View References
  @ViewChild('draggableArea', { static: false }) draggableAreaRef!: ElementRef<HTMLDivElement>;
  @ViewChild('parentZone', { static: false }) parentZoneRef!: ElementRef<HTMLDivElement>;
  @ViewChildren('chatMessages', { read: ElementRef }) chatMessageContainers!: QueryList<ElementRef<HTMLDivElement>>;

  // Colored Squares
  squares = signal<ColoredSquare[]>([
    { id: 1, color: '#FF6B6B', name: 'Red Square', position: { x: 50, y: 50 } },
    { id: 2, color: '#4ECDC4', name: 'Teal Square', position: { x: 200, y: 150 } },
    { id: 3, color: '#FFD166', name: 'Yellow Square', position: { x: 350, y: 80 } }
  ]);

  // ✅ ADDED: Chat Windows
  chatWindows = signal<ChatWindow[]>([
    {
      id: 1,
      title: 'Global Chat',
      position: { x: 50, y: 100 },
      messages: [],
      newMessage: '',
      isMinimized: false,
      isConnected: false,
      unreadCount: 0,
      color: '#4ECDC4'
    },
    {
      id: 2,
      title: 'Team Discussion',
      position: { x: 350, y: 150 },
      messages: [],
      newMessage: '',
      isMinimized: false,
      isConnected: false,
      unreadCount: 0,
      color: '#FF6B6B'
    },
    {
      id: 3,
      title: 'Support Channel',
      position: { x: 650, y: 200 },
      messages: [],
      newMessage: '',
      isMinimized: false,
      isConnected: false,
      unreadCount: 0,
      color: '#FFD166'
    }
  ]);

  // Panel visibility
  showCoordinatesPanel = signal(true);

  // Computed properties for template
  draggableAreaDimensions = signal({ width: 0, height: 0 });

  // ✅ ADDED: Worker connection state
  workerConnected = signal(false);
  connectedTabs = signal(1);
  currentTabId = signal('');


  // ✅ ADDED: Typing state for each chat window
  typingUsersByWindow = signal<Map<number, ChatUserSummary[]>>(new Map());
  currentUserSummary = signal<ChatUserSummary | null>(null);

  // ✅ ADDED: Typing input debouncing per window
  private typingInputTimeouts = new Map<number, ReturnType<typeof setTimeout>>();
  private typingCleanupTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

  // ✅ ADDED: Chat Logs
  chatLogs = signal<{timestamp: Date; message: string; windowId: number}[]>([]);


  // Nested Zones
  childZones = {
    A: [] as ColoredSquare[],
    B: [] as ColoredSquare[],
    C: [] as ColoredSquare[]
  };

  layoutType$ = combineLatest([
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.router.url)
    ),
    this.state.isAuthenticated$
  ]).pipe(
    map(([url, isAuthenticated]) => {
      const blankLayoutRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/error'];
      const isBlankLayout = blankLayoutRoutes.some(route => url.includes(route));
      return isBlankLayout ? 'blank' : 'dashboard';
    })
  );

  pageTitle$ = combineLatest([
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    )
  ]).pipe(
    map(() => {
      const route = this.getCurrentActivatedRoute();
      const url = this.router.url;
      const titleMap: { [key: string]: string } = {
        '/dashboard': 'Dashboard',
        '/dashboard/users': 'User Management',
        '/dashboard/settings': 'System Settings',
        '/dashboard/analytics': 'Analytics',
        '/dashboard/profile': 'My Profile'
      };
      return route?.snapshot.data['title'] || titleMap[url] || 'Cross-Tab Demo with Chat';
    })
  );

  isLoading$ = this.state.isLoading$;
  errorMessage$ = this.state.authState$.pipe(map(auth => auth.error));
  currentUser$ = this.state.currentUser$;

  currentRoute$ = this.router.events.pipe(
    filter(event => event instanceof NavigationEnd),
    map(() => this.router.url)
  );

  private subscriptions: Subscription[] = [];

  ngOnInit(): void {
    // Subscribe to update page title in state
    const titleSub = this.pageTitle$.subscribe(title => {
      this.state.setPageTitle(title);
    });

    // ✅ ADDED: Initialize Shared Worker
    this.initializeWorker();

    // Load saved positions
    this.loadSquarePositions();

    // ✅ ADDED: Load chat positions
    this.loadChatPositions();

    // ✅ ADDED: Add welcome messages to chat windows
    this.addSystemMessage(1, 'Welcome to Global Chat! Messages here are broadcast to all tabs.');
    this.addSystemMessage(2, 'Team Discussion channel created.');
    this.addSystemMessage(3, 'Support Channel - ask questions here.');


    // ✅ ADDED: Subscribe to chat service typing events
    this.subscribeToTypingEvents();

    // ✅ ADDED: Get current user summary for typing events
    const user = this.initializeCurrentUser() as ChatUser;

    this.chatService.initializePubSub(user, { connection: '', eventBus: '', commandBus: '' });

    this.subscriptions.push(titleSub);
  }

  private scrollToBottom(windowId: number): void {
    setTimeout(() => {
      const index = this.chatWindows().findIndex(w => w.id === windowId);
      if (index >= 0 && this.chatMessageContainers?.toArray()[index]) {
        const container = this.chatMessageContainers.toArray()[index].nativeElement;
        container.scrollTop = container.scrollHeight;
      }
    });
  }

  // ✅ ADDED: Initialize Shared Worker
  private initializeWorker(): void {
    this.pubSubHandle = this.workerProxyService.createWorker('pubsub-worker', 'shared', {
      'url': 'ws://192.168.1.150:8005/connection/websocket?format=json'
    });
    //http://192.168.1.150:8888/#/dashboard
    void this.workerProxyService.invoke<rpcSubscribeParams, void>(this.pubSubHandle, rpcSubscribeMethodName, {
      centrifugoChannel: 'chat',
      centrifugoToken: '',
      topic: ChatTopic
    }).catch(e => {
      console.error('Failed to subscribe to', e)
    });

    // Monitor connection status
    // const connectionSub = this.workerService.connection$.subscribe(status => {
    //   this.workerConnected.set(status.isConnected);
    //   this.connectedTabs.set(status.connectedTabs);
    //
    //   if (status.isConnected) {
    //     console.log(`✅ Connected to worker. Tabs: ${status.connectedTabs}`);
    //   }
    // });

    this.workerConnected.set(true);
    this.connectedTabs.set(1);

    // Get current tab ID
    this.currentTabId.set(this.workerProxyService.getTabId());

    // Listen for broadcast messages (chat messages)
    // const messageSub = this.workerService.messages$.subscribe(message => {
    //   this.handleWorkerMessage(message);
    // });

    // Listen for specific chat messages
    const chatSub = this.workerProxyService.onTabSyncData<ChatMessage>(ChatTopic).subscribe(({ op, value }) => {
      this.handleChatMessage(value);
    });

    this.subscriptions.push(chatSub);
  }

  // Handle incoming shared-worker messages
  private handleWorkerMessage(m: Message): void {
    switch (m.type) {
      case BaseMessageTypes.WORKER_CONNECTED:
        this.workerConnected.set(true);
        this.addChatLog('Worker connected', 0);
        break;

      // case BaseMessageTypes.WORKER_STATE:
      //   const state = m.payload.state as BaseWorkerState;
      //   this.connectedTabs.set(state.tabsConnected);
      //   this.addSystemMessage(1, `🔗 ${state.tabsConnected} tab(s) connected`);
      //   break;
    }
  }

  private handleChatMessage(message: ChatMessage): void {
    const { windowId, text, sender, tabId, timestamp } = message;

    console.log('Chta message', message);

    // Skip if this is our own message (we already added it locally)
    if (tabId === this.currentTabId()) {
      console.log(`tab id: ${tabId} ${this.currentTabId()}`)
      return; // We've already shown it locally
    }

    if (windowId && text) {
      const chatMessage: ChatMessage = {
        windowId,
        id: `${Date.now()}_${Math.random()}`,
        text,
        sender: sender || `Tab ${tabId?.substring(0, 8)}`,
        timestamp: new Date(timestamp || Date.now()),
        isOwn: false, // This is from another tab
        tabId: tabId || 'unknown'
      };

      this.chatWindows.update(windows =>
        windows.map(window => {
          if (window.id === windowId) {
            const updatedMessages = [...window.messages, chatMessage];

            // Increment unread count if window is minimized or not focused
            const unreadCount = window.isMinimized ? window.unreadCount + 1 : 0;

            setTimeout(() => this.scrollToBottom(windowId));

            return {
              ...window,
              messages: updatedMessages.slice(-50), // Keep last 50 messages
              unreadCount,
              isConnected: true
            };
          }
          return window;
        })
      );

      // Add to logs
      this.addChatLog(`Message from ${sender} in ${this.getWindowTitle(windowId)}: ${text}`, windowId);
    }
  }

  ngAfterViewInit(): void {
    // Update dimensions after view is initialized
    this.updateDraggableAreaDimensions();

    // Listen for window resize to update dimensions
    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = () => {
    this.updateDraggableAreaDimensions();
  }

  private updateDraggableAreaDimensions(): void {
    if (this.draggableAreaRef?.nativeElement) {
      this.draggableAreaDimensions.set({
        width: this.draggableAreaRef.nativeElement.clientWidth,
        height: this.draggableAreaRef.nativeElement.clientHeight
      });
    }
  }

  // =====================
  // ✅ CHAT WINDOW METHODS
  // =====================

// Helper method to add your own message locally
  private addOwnMessageToChat(windowId: number, text: string, tabId: string, timestamp: number): void {
    const ownMessage: ChatMessage = {
      windowId,
      id: `own_${timestamp}_${Math.random().toString(36).substring(2, 9)}`,
      text,
      sender: 'You', // Show "You" for your own messages
      timestamp: new Date(timestamp),
      isOwn: true,
      tabId: tabId
    };

    this.chatWindows.update(windows =>
      windows.map(window => {
        if (window.id === windowId) {
          return {
            ...window,
            messages: [...window.messages, ownMessage].slice(-50), // Keep last 50
            isConnected: true
          };
        }
        return window;
      })
    );
  }

  // Toggle chat window minimized state
  toggleChatWindow(windowId: number): void {
    this.chatWindows.update(windows =>
      windows.map(window => {
        if (window.id === windowId) {
          const newState = !window.isMinimized;

          // Clear unread when opening
          const unreadCount = newState ? window.unreadCount : 0;

          return {
            ...window,
            isMinimized: newState,
            unreadCount
          };
        }
        return window;
      })
    );
  }

  // Close chat window
  closeChatWindow(windowId: number): void {
    this.chatWindows.update(windows => windows.filter(w => w.id !== windowId));
    this.addChatLog(`Closed window ${windowId}`, 0);
  }

  // Save chat window positions
  saveChatPositions(): void {
    const positions: Record<number, {x: number, y: number}> = {};
    this.chatWindows().forEach(window => {
      positions[window.id] = window.position;
    });
    localStorage.setItem('chatPositions', JSON.stringify(positions));
  }

  // Load chat window positions
  loadChatPositions(): void {
    const saved = localStorage.getItem('chatPositions');
    if (saved) {
      try {
        const positions = JSON.parse(saved);
        this.chatWindows.update(windows =>
          windows.map(window => {
            const savedPos = positions[window.id];
            return savedPos ? { ...window, position: savedPos } : window;
          })
        );
      } catch (e) {
        console.warn('Failed to load chat positions:', e);
      }
    }
  }

  // Add system message to chat
  private addSystemMessage(windowId: number, text: string): void {
    const systemMessage: ChatMessage = {
      windowId,
      id: `sys_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      text,
      sender: 'System',
      timestamp: new Date(),
      isOwn: false,
      tabId: 'system'
    };

    this.chatWindows.update(windows =>
      windows.map(window => {
        if (window.id === windowId) {
          return {
            ...window,
            messages: [...window.messages, systemMessage].slice(-50),
            isConnected: true
          };
        }
        return window;
      })
    );
  }

  // Add chat log
  private addChatLog(message: string, windowId: number): void {
    this.chatLogs.update(logs => {
      const newLog = {
        timestamp: new Date(),
        message: `[Window ${windowId}] ${message}`,
        windowId
      };
      return [newLog, ...logs].slice(0, 20); // Keep last 20 logs
    });
  }

  // Get window title by ID
  private getWindowTitle(windowId: number): string {
    const window = this.chatWindows().find(w => w.id === windowId);
    return window?.title || `Window ${windowId}`;
  }

  loadSquarePositions(): void {
    const saved = localStorage.getItem('squarePositions');
    if (saved) {
      try {
        const positions = JSON.parse(saved);
        this.squares.update(squares =>
          squares.map(square => {
            const savedPos = positions.find((p: any) => p.id === square.id);
            return savedPos
              ? { ...square, position: savedPos.position }
              : square;
          })
        );
      } catch (e) {
        console.warn('Failed to load square positions:', e);
      }
    }
  }

  // =====================
  // PUBLIC UI METHODS
  // =====================

  // ✅ ADDED: Get chat window styles
  getChatWindowStyles(window: ChatWindow): any {
    return {
      'left.px': window.position.x,
      'top.px': window.position.y,
      'background-color': window.color + '20', // Add transparency
      'border-color': window.color,
      'position': 'absolute'
    };
  }

  // ✅ ADDED: Clear all chat windows
  clearAllChats(): void {
    this.chatWindows.update(windows =>
      windows.map(window => ({
        ...window,
        messages: [],
        unreadCount: 0
      }))
    );

    this.addSystemMessage(1, 'All chats cleared');
  }

  // ✅ ADDED: Test cross-tab message
  testCrossTabMessage(): void {
    if (this.workerConnected()) {
      // this.workerService.sendData(
      //   'CHAT_MESSAGE',
      //   {
      //     windowId: 1,
      //     text: `Test message from Tab ${this.currentTabId().substring(0, 8)}`,
      //     sender: 'System',
      //     tabId: this.currentTabId(),
      //     timestamp: Date.now()
      //   }
      // );

      this.addSystemMessage(1, 'Test message sent to all tabs');
    } else {
      this.addSystemMessage(1, 'Worker not connected. Cannot send cross-tab message.');
    }
  }

  // ✅ ADDED: Subscribe to typing events from ChatService
  private subscribeToTypingEvents(): void {
    // Listen for typing started events
    const typingStartedSub = this.chatService.events.typingStarted$.subscribe(
      ({ roomId, participant }) => {
        // Convert roomId to windowId (you might need to map these)
        const windowId = this.getWindowIdFromRoomId(roomId);
        if (windowId) {
          this.addTypingUser(windowId, participant);
        }
      }
    );

    // Listen for typing finished events
    const typingFinishedSub = this.chatService.events.typingFinished$.subscribe(
      ({ roomId, participant }) => {
        const windowId = this.getWindowIdFromRoomId(roomId);
        if (windowId) {
          this.removeTypingUser(windowId, participant);
        }
      }
    );

    // Subscribe to chat service's typing users observable
    const typingUsersSub = this.chatService.typingUsers$.subscribe(typingUsersMap => {
      // Update typing indicators for all windows
      this.updateAllTypingIndicators(typingUsersMap);
    });

    this.subscriptions.push(typingStartedSub, typingFinishedSub, typingUsersSub);
  }

  // ✅ ADDED: Initialize current user summary
  private initializeCurrentUser(): ChatUserSummary {
    const randomId = uuid();

    // Generate a random display name, e.g., "User_1234"
    const randomSuffix = Math.floor(Math.random() * 9000 + 1000); // 1000-9999
    const randomName = `User_${randomSuffix}`;

    // Optional: random avatar URL placeholder
    const defaultAvatar = `https://api.dicebear.com/6.x/bottts/svg?seed=${randomId}`;

    const user = {
      id: randomId,
      name: randomName,
      avatar: defaultAvatar,
    };

    this.currentUserSummary.set(user);

    return user;
  }

  // ✅ ADDED: Handle typing input in chat windows
  onChatInputTyping(windowId: number, event: Event): void {
    if (!this.currentUserSummary()) return;

    const window = this.chatWindows().find(w => w.id === windowId);
    if (!window) return;

    // Get roomId from windowId (you need to implement this mapping)
    const roomId = this.getRoomIdFromWindowId(windowId);
    if (!roomId) return;

    // Send typing start event
    this.chatService.typingStart(roomId);
  }

  // ✅ ADDED: Send message with typing cleanup
  sendMessage(windowId: number): void {
    const window = this.chatWindows().find(w => w.id === windowId);
    if (!window || !window.newMessage.trim()) return;

    // Clear typing indicators
    this.clearTypingIndicators(windowId);

    // Get roomId for typing cleanup
    const roomId = this.getRoomIdFromWindowId(windowId);
    if (roomId && this.currentUserSummary()) {
      this.chatService.typingEnd(roomId);
    }

    // ... existing send message logic
    const messageText = window.newMessage;
    const tabId = this.currentTabId();
    const timestamp = Date.now();

    // 1. FIRST: Add message to your own UI immediately
    this.addOwnMessageToChat(windowId, messageText, tabId, timestamp);

    // 2. THEN: Broadcast to other tabs
    this.workerProxyService.syncTabData(this.pubSubHandle!,  ChatTopic, {
      windowId,
      text: messageText,
      sender: tabId,
      tabId: tabId,
      timestamp: timestamp
    }, 'add', { upstreamChannel: 'chat' });

    // 3. Clear input
    this.chatWindows.update((windows) => {
      const updatedWindows = windows.map(w =>
        w.id === windowId ? {...w, newMessage: ''} : w
      );

      setTimeout(() => this.scrollToBottom(windowId));
      return updatedWindows;
    });

    // 4. Add to logs
    this.addChatLog(`You sent: ${messageText}`, windowId);
  }

  // ✅ ADDED: Clear typing indicators for a window
  private clearTypingIndicators(windowId: number): void {
    // Clear local typing state
    this.typingUsersByWindow.update(current => {
      const updated = new Map(current);
      updated.delete(windowId);
      return updated;
    });
  }

  // ✅ ADDED: Add typing user to window
  private addTypingUser(windowId: number, user: ChatUserSummary): void {
    this.typingUsersByWindow.update(current => {
      const updated = new Map(current);
      const existingUsers = updated.get(windowId) || [];

      // Check if user is already in the list
      if (!existingUsers.some(u => u.id === user.id)) {
        updated.set(windowId, [...existingUsers, user]);
      }

      return updated;
    });
  }

  // ✅ ADDED: Remove typing user from window
  private removeTypingUser(windowId: number, user: ChatUserSummary): void {
    this.typingUsersByWindow.update(current => {
      const updated = new Map(current);
      const existingUsers = updated.get(windowId) || [];

      const filteredUsers = existingUsers.filter(u => u.id !== user.id);
      if (filteredUsers.length === 0) {
        updated.delete(windowId);
      } else {
        updated.set(windowId, filteredUsers);
      }

      return updated;
    });
  }

  // ✅ ADDED: Update all typing indicators
  private updateAllTypingIndicators(typingUsersMap: Map<string, { roomId: string, user: ChatUserSummary, timestamp: number }>): void {
    // Clear current typing indicators
    this.typingUsersByWindow.set(new Map());

    // Group typing users by window
    typingUsersMap.forEach(({ roomId, user }) => {
      const windowId = this.getWindowIdFromRoomId(roomId);
      if (windowId) {
        this.addTypingUser(windowId, user);
      }
    });
  }

  // ✅ ADDED: Get typing users for a specific window
  getTypingUsersForWindow(windowId: number): ChatUserSummary[] {
    return this.typingUsersByWindow().get(windowId) || [];
  }

  // ✅ ADDED: Get formatted typing text for display
  getTypingDisplayText(windowId: number): string {
    const users = this.getTypingUsersForWindow(windowId);

    if (users.length === 0) return '';
    if (users.length === 1) return `${users[0].name} is typing...`;
    if (users.length === 2) return `${users[0].name} and ${users[1].name} are typing...`;

    return `${users[0].name} and ${users.length - 1} others are typing...`;
  }

  // ✅ ADDED: Check if window has typing activity
  isWindowTyping(windowId: number): boolean {
    return this.getTypingUsersForWindow(windowId).length > 0;
  }

  // ✅ ADDED: Map windowId to roomId (you need to implement your mapping logic)
  private getRoomIdFromWindowId(windowId: number): string | null {
    // This is a simple example - you might have a more complex mapping
    // For example, store roomId in the ChatWindow interface
    const window = this.chatWindows().find(w => w.id === windowId);
    if (window) {
      // You might want to add roomId to ChatWindow interface
      return `room_${windowId}`;
    }
    return null;
  }

  // ✅ ADDED: Map roomId to windowId
  private getWindowIdFromRoomId(roomId: string): number | null {
    // Extract windowId from roomId or use a mapping
    // For example, if roomId is "room_1", extract 1
    const match = roomId.match(/room_(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  // =====================
  // EXISTING METHODS
  // =====================

  private getCurrentActivatedRoute(): any {
    let route = this.router.routerState.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return route;
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    window.removeEventListener('resize', this.handleResize);

    // Save chat positions before leaving
    this.saveChatPositions();
  }
}
