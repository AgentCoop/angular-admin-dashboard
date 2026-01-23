import { Component, OnInit, OnDestroy, inject, signal, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { StateService } from './core/services/state.service';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';

//import { DraggableDirective, DropEvent, DragPosition, UiDropzoneDirective } from '@core/directives/draggable';

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

  // View References
  @ViewChild('draggableArea', { static: false }) draggableAreaRef!: ElementRef<HTMLDivElement>;
  @ViewChild('parentZone', { static: false }) parentZoneRef!: ElementRef<HTMLDivElement>;

  // Colored Squares
  squares = signal<ColoredSquare[]>([
    { id: 1, color: '#FF6B6B', name: 'Red Square', position: { x: 50, y: 50 } },
    { id: 2, color: '#4ECDC4', name: 'Teal Square', position: { x: 200, y: 150 } },
    { id: 3, color: '#FFD166', name: 'Yellow Square', position: { x: 350, y: 80 } }
  ]);

  // Panel visibility
  showCoordinatesPanel = signal(true);

  // Computed properties for template
  draggableAreaDimensions = signal({ width: 0, height: 0 });

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
      return route?.snapshot.data['title'] || titleMap[url] || 'Draggable Squares Demo';
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

    // Load saved positions
    this.loadSquarePositions();

    // Initialize with some dynamic zones
    this.addDynamicDropzone('Team Tasks', 'priority', 5);
    this.addDynamicDropzone('Backlog', 'review', 10);

    this.subscriptions.push(titleSub);
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
  // SQUARE DRAGGING METHODS
  // =====================

  onSquareDragStart(event: PointerEvent, squareId: number): void {
    console.log(`Started dragging square ${squareId}`);
  }

  onSquareDragMove(position: DragPosition, squareId: number): void {
    // this.squares.update(squares =>
    //   squares.map(square =>
    //     square.id === squareId
    //       ? { ...square, position: { x: position.absoluteX, y: position.absoluteY } }
    //       : square
    //   )
    // );
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
  }
}
