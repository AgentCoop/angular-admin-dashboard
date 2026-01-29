import { Component, OnInit, OnDestroy, inject, signal, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { StateService } from './core/services/state.service';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';
import { SharedWorkerService } from './core/communication/worker'; // ✅ ADDED
import { WorkerMessageType } from './core/communication/worker/types'; // ✅ ADDED

import { DragPosition, DraggableDirective, UiDropzoneDirective, DropEvent } from '@core/drag-drop';

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
  id: string;
  text: string;
  sender: string;
  timestamp: Date;
  isOwn: boolean;
  tabId: string; // Which tab sent the message
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    DraggableDirective,
    UiDropzoneDirective
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
  private workerService = inject(SharedWorkerService); // ✅ ADDED

  // View References
  @ViewChild('draggableArea', { static: false }) draggableAreaRef!: ElementRef<HTMLDivElement>;
  @ViewChild('parentZone', { static: false }) parentZoneRef!: ElementRef<HTMLDivElement>;

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

  // Reactive properties
  sidebarCollapsed$ = this.themeService.sidebarCollapsed$;

  // Dropzone State
  showDropzones = signal(true);
  snapToDropzones = false;

  // Dropped Items
  droppedItems = {
    priority: [] as DropzoneItem[],
    review: [] as DropzoneItem[],
    archive: [] as DropzoneItem[],
    trash: [] as DropzoneItem[]
  };

  // Last Drop Times
  lastDropTime = {
    priority: new Date(),
    review: new Date(),
    archive: new Date(),
    trash: new Date()
  };

  // Dropzone Logs
  dropzoneLogs = signal<DropzoneLog[]>([]);

  // ✅ ADDED: Chat Logs
  chatLogs = signal<{timestamp: Date; message: string; windowId: number}[]>([]);

  // Dynamic Zones
  dynamicZones = signal<DynamicZone[]>([]);
  newZoneName = '';
  newZoneType: 'default' | 'priority' | 'review' | 'archive' = 'default';

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

  showHeader$ = combineLatest([this.layoutType$, this.state.isAuthenticated$]).pipe(
    map(([layoutType, isAuthenticated]) =>
      layoutType === 'dashboard' && isAuthenticated
    )
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

    // Initialize with some dynamic zones
    this.addDynamicDropzone('Team Tasks', 'priority', 5);
    this.addDynamicDropzone('Backlog', 'review', 10);

    // ✅ ADDED: Add welcome messages to chat windows
    this.addSystemMessage(1, 'Welcome to Global Chat! Messages here are broadcast to all tabs.');
    this.addSystemMessage(2, 'Team Discussion channel created.');
    this.addSystemMessage(3, 'Support Channel - ask questions here.');

    this.subscriptions.push(titleSub);
  }

  // ✅ ADDED: Initialize Shared Worker
  private initializeWorker(): void {
    // Monitor connection status
    const connectionSub = this.workerService.connection$.subscribe(status => {
      this.workerConnected.set(status.isConnected);
      this.connectedTabs.set(status.connectedTabs);

      if (status.isConnected) {
        console.log(`✅ Connected to worker. Tabs: ${status.connectedTabs}`);
      }
    });

    // Get current tab ID
    this.currentTabId.set(this.workerService.getTabId());

    // Listen for tab count updates
    const tabCountSub = this.workerService.tabCount$.subscribe(count => {
      this.connectedTabs.set(count);
      this.addSystemMessage(1, `📊 ${count} tab(s) connected`);
    });

    // Listen for broadcast messages (chat messages)
    const messageSub = this.workerService.messages$.subscribe(message => {
      this.handleWorkerMessage(message);
    });

    // Listen for specific chat messages
    const chatSub = this.workerService.on('CHAT_MESSAGE').subscribe((message: any) => {
      this.handleChatMessage(message);
    });

    // Listen for window sync messages
    const syncSub = this.workerService.on('CHAT_WINDOW_SYNC').subscribe((message: any) => {
      this.handleWindowSync(message);
    });

    this.subscriptions.push(connectionSub, tabCountSub, messageSub, chatSub, syncSub);
  }

  // ✅ ADDED: Handle incoming worker messages
  private handleWorkerMessage(message: any): void {
    switch (message.type) {
      case WorkerMessageType.WORKER_CONNECTED:
        this.workerConnected.set(true);
        this.addChatLog('Worker connected', 0);
        break;

      case WorkerMessageType.TAB_REGISTER:
        if (message.count !== undefined) {
          this.connectedTabs.set(message.count);
          this.addSystemMessage(1, `🔗 ${message.count} tab(s) connected`);
        }
        break;

      case 'CHAT_MESSAGE':
        this.handleChatMessage(message);
        break;

      case 'CHAT_WINDOW_SYNC':
        this.handleWindowSync(message);
        break;

      case 'SYNC_DATA':
        if (message.key === 'chat_window_positions') {
          this.syncChatWindowPositions(message.value);
        }
        break;
    }
  }

  // ✅ ADDED: Handle chat messages
  private handleChatMessage(message: any): void {
    const { windowId, text, sender, tabId, timestamp } = message.payload || {};

    if (windowId && text) {
      const chatMessage: ChatMessage = {
        id: `${Date.now()}_${Math.random()}`,
        text,
        sender: sender || `Tab ${tabId?.substring(0, 8)}`,
        timestamp: new Date(timestamp || Date.now()),
        isOwn: tabId === this.currentTabId(),
        tabId: tabId || 'unknown'
      };

      this.chatWindows.update(windows =>
        windows.map(window => {
          if (window.id === windowId) {
            const updatedMessages = [...window.messages, chatMessage];

            // Increment unread count if window is minimized or not focused
            const unreadCount = window.isMinimized ? window.unreadCount + 1 : 0;

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
      this.addChatLog(`Message in ${this.getWindowTitle(windowId)}: ${text}`, windowId);
    }
  }

  // ✅ ADDED: Handle window sync
  private handleWindowSync(message: any): void {
    const { action, windowId, position, isMinimized } = message.payload || {};

    if (action === 'window_moved' && windowId && position) {
      this.chatWindows.update(windows =>
        windows.map(window => {
          if (window.id === windowId && message.tabId !== this.currentTabId()) {
            return { ...window, position };
          }
          return window;
        })
      );
    }

    if (action === 'window_minimized' && windowId !== undefined) {
      this.chatWindows.update(windows =>
        windows.map(window => {
          if (window.id === windowId && message.tabId !== this.currentTabId()) {
            return { ...window, isMinimized };
          }
          return window;
        })
      );
    }
  }

  // ✅ ADDED: Sync chat window positions
  private syncChatWindowPositions(positions: any): void {
    this.chatWindows.update(windows =>
      windows.map(window => {
        const savedPosition = positions[window.id];
        if (savedPosition) {
          return { ...window, position: savedPosition };
        }
        return window;
      })
    );
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

  // Send message from a chat window
  sendMessage(windowId: number): void {
    const window = this.chatWindows().find(w => w.id === windowId);
    if (!window || !window.newMessage.trim()) return;

    // Create message
    const message = {
      windowId,
      text: window.newMessage,
      sender: 'me', //this.currentUser$.value?.name || 'Anonymous',
      tabId: this.currentTabId(),
      timestamp: Date.now()
    };

    // Broadcast to all tabs
    this.workerService.broadcast({
      type: 'CHAT_MESSAGE',
      ...message
    });

    // Clear input
    this.chatWindows.update(windows =>
      windows.map(w =>
        w.id === windowId ? { ...w, newMessage: '' } : w
      )
    );

    // Add to logs
    this.addChatLog(`You sent: ${window.newMessage}`, windowId);
  }

  // Toggle chat window minimized state
  toggleChatWindow(windowId: number): void {
    this.chatWindows.update(windows =>
      windows.map(window => {
        if (window.id === windowId) {
          const newState = !window.isMinimized;

          // Broadcast state change
          if (this.workerConnected()) {
            this.workerService.broadcast({
              type: 'CHAT_WINDOW_SYNC',
              payload: {
                action: 'window_minimized',
                windowId,
                isMinimized: newState
              }
            });
          }

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

  // Drag chat window
  onChatWindowDrag(windowId: number, position: DragPosition): void {
    this.chatWindows.update(windows =>
      windows.map(window => {
        if (window.id === windowId) {
          const newPosition = { x: position.absoluteX, y: position.absoluteY };

          // Sync position to other tabs
          if (this.workerConnected()) {
            this.workerService.broadcast({
              type: 'CHAT_WINDOW_SYNC',
              payload: {
                action: 'window_moved',
                windowId,
                position: newPosition
              }
            });
          }

          return { ...window, position: newPosition };
        }
        return window;
      })
    );
  }

  // Save chat window positions
  saveChatPositions(): void {
    const positions: Record<number, {x: number, y: number}> = {};
    this.chatWindows().forEach(window => {
      positions[window.id] = window.position;
    });
    localStorage.setItem('chatPositions', JSON.stringify(positions));

    // Also sync via worker
    if (this.workerConnected()) {
      this.workerService.syncData('chat_window_positions', positions);
    }
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
      id: `sys_${Date.now()}`,
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

  // =====================
  // SQUARE DRAGGING METHODS
  // =====================

  onSquareDragStart(event: PointerEvent, squareId: number): void {
    console.log(`Started dragging square ${squareId}`);
  }

  onSquareDragMove(position: DragPosition, squareId: number): void {
    // Optional: Update position in real-time
  }

  onSquareDragEnd(position: DragPosition, squareId: number): void {
    console.log(`Square ${squareId} dropped at (${position.absoluteX}, ${position.absoluteY})`);
    this.saveSquarePositions();
  }

  resetSquarePositions(): void {
    this.squares.set([
      { id: 1, color: '#FF6B6B', name: 'Red Square', position: { x: 50, y: 50 } },
      { id: 2, color: '#4ECDC4', name: 'Teal Square', position: { x: 200, y: 150 } },
      { id: 3, color: '#FFD166', name: 'Yellow Square', position: { x: 350, y: 80 } }
    ]);
    this.saveSquarePositions();
  }

  randomizeSquarePositions(): void {
    const areaWidth = this.draggableAreaDimensions().width || 800;
    const areaHeight = this.draggableAreaDimensions().height || 500;

    this.squares.update(squares =>
      squares.map(square => ({
        ...square,
        position: {
          x: Math.floor(Math.random() * (areaWidth - 100)), // -100 to keep within bounds
          y: Math.floor(Math.random() * (areaHeight - 100))
        }
      }))
    );
    this.saveSquarePositions();
  }

  alignSquares(alignment: 'horizontal' | 'vertical' | 'grid'): void {
    this.squares.update(squares => {
      const sorted = [...squares].sort((a, b) => a.id - b.id);

      switch(alignment) {
        case 'horizontal':
          return sorted.map((square, index) => ({
            ...square,
            position: { x: 50 + (index * 200), y: 150 }
          }));

        case 'vertical':
          return sorted.map((square, index) => ({
            ...square,
            position: { x: 300, y: 50 + (index * 150) }
          }));

        case 'grid':
          return sorted.map((square, index) => ({
            ...square,
            position: {
              x: 100 + ((index % 2) * 250),
              y: 100 + (Math.floor(index / 2) * 200)
            }
          }));

        default:
          return squares;
      }
    });
    this.saveSquarePositions();
  }

  saveSquarePositions(): void {
    const positions = this.squares().map(s => ({
      id: s.id,
      position: s.position
    }));
    localStorage.setItem('squarePositions', JSON.stringify(positions));
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
  // DROPZONE METHODS
  // =====================

  // Dropzone Event Handlers
  onDragEnter(event: DropEvent, zone: string): void {
    this.addLog({
      timestamp: new Date(),
      message: `Drag entered ${zone} zone`,
      type: 'enter',
      zone
    });

    console.log('drag enter');

    // Optional: Visual feedback
    this.highlightZone(zone, true);
  }

  onDragOver(event: DropEvent, zone: string): void {
    // Update visual feedback while dragging
    console.log(`Dragging over ${zone}: ${event.overlapPercentage.toFixed(2)}% overlap`);
  }

  onDragLeave(event: DropEvent, zone: string): void {
    this.addLog({
      timestamp: new Date(),
      message: `Drag left ${zone} zone`,
      type: 'leave',
      zone
    });

    this.highlightZone(zone, false);
  }

  onDrop(event: DropEvent, zone: string): void {
    const square = this.getSquareFromElement(event.draggable);
    if (!square) return;

    const dropzoneItem: DropzoneItem = {
      ...square,
      droppedAt: new Date(),
      zone
    };

    // Add to appropriate zone
    (this.droppedItems as any)[zone].push(dropzoneItem);
    (this.lastDropTime as any)[zone] = new Date();

    // Log the drop
    this.addLog({
      timestamp: new Date(),
      message: `Dropped "${square.name}" into ${zone}`,
      type: 'drop',
      zone
    });

    // Special handling for trash zone
    if (zone === 'trash') {
      this.removeSquare(square.id);
    }

    // Visual feedback
    this.showDropAnimation(event.draggable, zone);
    this.highlightZone(zone, false);
  }

  // Dynamic Zone Methods
  addDynamicDropzone(name?: string, type?: any, capacity?: number): void {
    const zoneName = name || this.newZoneName || `Zone ${this.dynamicZones().length + 1}`;
    const zoneType = type || this.newZoneType;
    const zoneCapacity = capacity || 5;

    const newZone: DynamicZone = {
      id: `zone-${Date.now()}`,
      name: zoneName,
      type: zoneType,
      capacity: zoneCapacity,
      items: []
    };

    this.dynamicZones.update(zones => [...zones, newZone]);
    this.newZoneName = '';

    this.addLog({
      timestamp: new Date(),
      message: `Created new dropzone: ${zoneName}`,
      type: 'enter',
      zone: 'system'
    });
  }

  removeDynamicDropzone(zoneId: string): void {
    const zone = this.dynamicZones().find(z => z.id === zoneId);
    if (!zone) return;

    // Return items to original positions
    zone.items.forEach(item => {
      this.resetSquarePosition(item.id);
    });

    this.dynamicZones.update(zones => zones.filter(z => z.id !== zoneId));

    this.addLog({
      timestamp: new Date(),
      message: `Removed dropzone: ${zone.name}`,
      type: 'leave',
      zone: 'system'
    });
  }

  onDynamicDrop(event: DropEvent, zoneId: string): void {
    const square = this.getSquareFromElement(event.draggable);
    if (!square) return;

    const zone = this.dynamicZones().find(z => z.id === zoneId);
    if (!zone) return;

    // Check capacity
    if (zone.items.length >= zone.capacity) {
      this.addLog({
        timestamp: new Date(),
        message: `Dropzone "${zone.name}" is full!`,
        type: 'error',
        zone: zoneId
      });
      return;
    }

    zone.items.push(square);

    this.addLog({
      timestamp: new Date(),
      message: `Added "${square.name}" to "${zone.name}"`,
      type: 'drop',
      zone: zoneId
    });
  }

  // Nested Zone Methods
  onParentDrop(event: DropEvent): void {
    const square = this.getSquareFromElement(event.draggable);
    if (!square) return;

    this.addLog({
      timestamp: new Date(),
      message: `Dropped into parent container`,
      type: 'drop',
      zone: 'parent'
    });
  }

  onChildDrop(event: DropEvent, child: 'A' | 'B' | 'C'): void {
    const square = this.getSquareFromElement(event.draggable);
    if (!square) return;

    (this.childZones as any)[child].push(square);

    this.addLog({
      timestamp: new Date(),
      message: `Added to child zone ${child}`,
      type: 'drop',
      zone: `child-${child}`
    });
  }

  getParentZoneElement(): HTMLElement {
    return this.parentZoneRef?.nativeElement;
  }

  // =====================
  // UTILITY METHODS
  // =====================

  private getSquareFromElement(element: HTMLElement): ColoredSquare | null {
    // Extract square data from the draggable element
    const idAttr = element.getAttribute('data-square-id');
    if (!idAttr) return null;

    const id = parseInt(idAttr);
    const name = element.getAttribute('data-square-name') || '';
    const color = element.style.backgroundColor || '#ccc';

    const square = this.squares().find(s => s.id === id);
    return square || null;
  }

  private addLog(log: DropzoneLog): void {
    this.dropzoneLogs.update(logs => {
      const newLogs = [log, ...logs];
      // Keep only last 20 logs
      return newLogs.slice(0, 20);
    });
  }

  private highlightZone(zone: string, highlight: boolean): void {
    // Implementation depends on your styling approach
    console.log(`${zone} ${highlight ? 'highlighted' : 'unhighlighted'}`);
  }

  private showDropAnimation(element: HTMLElement, zone: string): void {
    // Add animation class
    element.classList.add('dropped-animation');

    setTimeout(() => {
      element.classList.remove('dropped-animation');
    }, 500);
  }

  // Square Management
  private removeSquare(squareId: number): void {
    this.squares.update(squares => squares.filter(s => s.id !== squareId));
  }

  private resetSquarePosition(squareId: number): void {
    this.squares.update(squares =>
      squares.map(square =>
        square.id === squareId
          ? { ...square, position: { x: 50, y: 50 } }
          : square
      )
    );
  }

  // =====================
  // PUBLIC UI METHODS
  // =====================

  getSquareStyles(square: ColoredSquare): any {
    return {
      'background-color': square.color,
      'left.px': square.position.x,
      'top.px': square.position.y,
      'position': 'absolute'
    };
  }

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

  resetDropzones(): void {
    this.droppedItems = {
      priority: [],
      review: [],
      archive: [],
      trash: []
    };

    this.dropzoneLogs.set([]);

    this.addLog({
      timestamp: new Date(),
      message: 'All dropzones cleared',
      type: 'leave',
      zone: 'system'
    });
  }

  toggleDropzoneVisibility(): void {
    this.showDropzones.update(show => !show);
  }

  emptyTrash(): void {
    this.droppedItems.trash = [];

    this.addLog({
      timestamp: new Date(),
      message: 'Trash emptied',
      type: 'leave',
      zone: 'trash'
    });
  }

  getZoneColor(zone: string): string {
    const colors: { [key: string]: string } = {
      priority: '#ff6b6b',
      review: '#4ecdc4',
      archive: '#45b7d1',
      trash: '#96a6a6',
      parent: '#feca57',
      'child-A': '#ff9ff3',
      'child-B': '#54a0ff',
      'child-C': '#5f27cd',
      system: '#8395a7'
    };

    return colors[zone] || '#576574';
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
      this.workerService.broadcast({
        type: 'CHAT_MESSAGE',
        payload: {
          windowId: 1,
          text: `Test message from Tab ${this.currentTabId().substring(0, 8)}`,
          sender: 'System',
          tabId: this.currentTabId(),
          timestamp: Date.now()
        }
      });

      this.addSystemMessage(1, 'Test message sent to all tabs');
    } else {
      this.addSystemMessage(1, 'Worker not connected. Cannot send cross-tab message.');
    }
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

  toggleSidebar(): void {
    this.themeService.toggleSidebar();
  }

  toggleCoordinatesPanel(): void {
    this.showCoordinatesPanel.update(visible => !visible);
  }

  logout(): void {
    this.authService.logout();
  }

  clearError(): void {
    this.state.updateAuthState({ error: null });
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    window.removeEventListener('resize', this.handleResize);

    // Save chat positions before leaving
    this.saveChatPositions();
  }
}
