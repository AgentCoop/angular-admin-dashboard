import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService } from './core/services/auth.service';

// Import components
import { HeaderComponent } from './core/layouts/header/header.component';
import { SidebarComponent } from './core/layouts/sidebar/sidebar.component';
import { FooterComponent } from './core/layouts/footer/footer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    HeaderComponent,
    SidebarComponent,
    FooterComponent
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class App implements OnInit, OnDestroy {
  layoutType: 'blank' | 'dashboard' = 'blank';
  showHeader = false;
  showSidebar = false;
  showFooter = false;
  sidebarCollapsed = false;
  pageTitle = '';
  currentUser: any = null;
  userPermissions: string[] = [];
  isLoading = false;
  errorMessage: string | null = null;

  private routerSubscription: Subscription = new Subscription();
  private authSubscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.setupSubscriptions();
    this.restoreSidebarState();
  }

  private setupSubscriptions(): void {
    // Router subscription
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.updateLayoutBasedOnRoute();
        this.updatePageTitle();
      });

    // Auth subscriptions
    this.authSubscriptions.push(
      this.authService.getCurrentUserObservable().subscribe(user => {
        this.currentUser = user;
        this.userPermissions = this.authService.getUserPermissions();
      }),

      this.authService.getLoadingState().subscribe(loading => {
        this.isLoading = loading;
      }),

      this.authService.getError().subscribe(error => {
        this.errorMessage = error;
      }),

      this.authService.getAuthStatus().subscribe(isAuthenticated => {
        if (!isAuthenticated && this.layoutType === 'dashboard') {
          // Auto-redirect to login if not authenticated on dashboard
          this.router.navigate(['/login']);
        }
      })
    );
  }

  private restoreSidebarState(): void {
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState) {
      this.sidebarCollapsed = JSON.parse(savedState);
    }
  }

  private updateLayoutBasedOnRoute(): void {
    const currentRoute = this.router.url;

    // Routes that use blank layout (no header/sidebar)
    const blankLayoutRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/error'];

    // Check if current route should use blank layout
    const isBlankLayout = blankLayoutRoutes.some(route => currentRoute.includes(route));

    this.layoutType = isBlankLayout ? 'blank' : 'dashboard';

    // Show/hide layout components for dashboard layout
    if (this.layoutType === 'dashboard') {
      this.showHeader = true;
      this.showSidebar = true;
      this.showFooter = this.shouldShowFooter(currentRoute);
    } else {
      this.showHeader = false;
      this.showSidebar = false;
      this.showFooter = false;
    }
  }

  private shouldShowFooter(route: string): boolean {
    // Hide footer for specific routes
    const noFooterRoutes = ['/dashboard/editor', '/dashboard/chat'];
    return !noFooterRoutes.some(noFooterRoute => route.includes(noFooterRoute));
  }

  private updatePageTitle(): void {
    // Extract title from route data or set default
    const route = this.getCurrentActivatedRoute();
    this.pageTitle = route?.snapshot.data['title'] || this.getDefaultTitle(this.router.url);
  }

  private getCurrentActivatedRoute(): any {
    let route = this.router.routerState.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return route;
  }

  private getDefaultTitle(url: string): string {
    const titleMap: { [key: string]: string } = {
      '/dashboard': 'Dashboard',
      '/dashboard/users': 'User Management',
      '/dashboard/settings': 'System Settings',
      '/dashboard/analytics': 'Analytics',
      '/dashboard/profile': 'My Profile',
      '/dashboard/reports': 'Reports',
      '/dashboard/billing': 'Billing'
    };

    return titleMap[url] || 'Admin Dashboard';
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    // Save preference to localStorage
    localStorage.setItem('sidebarCollapsed', JSON.stringify(this.sidebarCollapsed));
  }

  logout(): void {
    this.authService.logout();
  }

  clearError(): void {
    //this.authService.clearError();
  }

  ngOnDestroy(): void {
    this.routerSubscription.unsubscribe();
    this.authSubscriptions.forEach(sub => sub.unsubscribe());
  }
}
