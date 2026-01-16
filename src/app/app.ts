import { Component, OnInit, OnDestroy, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { StateService } from './core/services/state.service';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';
import { DraggableDirective, DragPosition } from '@core/directives/draggable.directive';

interface ColoredSquare {
  id: number;
  color: string;
  name: string;
  position: { x: number; y: number };
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    DraggableDirective
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class App implements OnInit, OnDestroy {
  // Services
  private router = inject(Router);
  private state = inject(StateService);
  private authService = inject(AuthService);
  private themeService = inject(ThemeService);

  // View References - CORRECT TYPE HERE
  @ViewChild('draggableArea', { static: false }) draggableAreaRef!: ElementRef<HTMLDivElement>;

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
    //       ? { ...square, position: { x: position.deltaX, y: position.deltaY } }
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
  // HELPER METHODS
  // =====================

  getSquareStyles(square: ColoredSquare): any {
    return {
      'background-color': square.color,
      'left.px': square.position.x,
      'top.px': square.position.y
    };
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
