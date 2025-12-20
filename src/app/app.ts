import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { StateService } from './core/services/state.service';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';

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
  templateUrl: './app.html'
})
export class App implements OnInit, OnDestroy {
  // Services
  private router = inject(Router);
  private state = inject(StateService);
  private authService = inject(AuthService);
  private themeService = inject(ThemeService);

  // Reactive properties
  sidebarCollapsed$ = this.themeService.sidebarCollapsed$;

  // Layout observables
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

  showSidebar$ = true//this.showHeader$;

  showFooter$ = combineLatest([
    this.showHeader$,
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.router.url)
    )
  ]).pipe(
    map(([showHeader, url]) => {
      if (!showHeader) return false;
      const noFooterRoutes = ['/dashboard/editor', '/dashboard/chat'];
      return !noFooterRoutes.some(route => url.includes(route));
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
      return route?.snapshot.data['title'] || titleMap[url] || 'Admin Dashboard';
    })
  );

  // Other observables
  isLoading$ = this.state.isLoading$;
  errorMessage$ = this.state.authState$.pipe(map(auth => auth.error));
  currentUser$ = this.state.currentUser$;
  userPermissions$ = this.currentUser$.pipe(
    map(user => user?.permissions || [])
  );

  // Current route for sidebar
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

    this.subscriptions.push(titleSub);
  }

  private getCurrentActivatedRoute(): any {
    let route = this.router.routerState.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return route;
  }

  toggleSidebar(): void {
    //this.themeService.toggleSidebar();
  }

  logout(): void {
    this.authService.logout();
  }

  clearError(): void {
    this.state.updateAuthState({ error: null });
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}
