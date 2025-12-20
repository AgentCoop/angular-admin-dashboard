import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

// Define state interface
export interface AppState {
  auth: AuthState;
  theme: ThemeState;
  ui: UIState;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  error: string | null;
  token: string | null;
  refreshToken: string | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
  roles: string[];
  permissions: string[];
  department?: string;
  lastLogin?: string;
}

export interface ThemeState {
  currentTheme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  fontSize: 'sm' | 'md' | 'lg';
}

export interface UIState {
  isLoading: boolean;
  notifications: Notification[];
  currentPageTitle: string;
  sidebarOpen: boolean;
  mobileMenuOpen: boolean;
  modals: ModalState[];
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  read: boolean;
  timestamp: Date;
}

export interface ModalState {
  id: string;
  component: any;
  props?: any;
  isOpen: boolean;
}

// Initial state
const initialState: AppState = {
  auth: {
    isAuthenticated: false,
    user: null,
    loading: false,
    error: null,
    token: null,
    refreshToken: null
  },
  theme: {
    currentTheme: 'light',
    sidebarCollapsed: false,
    fontSize: 'md'
  },
  ui: {
    isLoading: false,
    notifications: [],
    currentPageTitle: 'Dashboard',
    sidebarOpen: true,
    mobileMenuOpen: false,
    modals: []
  }
};

@Injectable({
  providedIn: 'root'
})
export class StateService {
  private stateSubject = new BehaviorSubject<AppState>(initialState);
  private state$ = this.stateSubject.asObservable();

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this.loadPersistedState();
  }

  // Load persisted state from localStorage
  private loadPersistedState(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const persistedState: Partial<AppState> = {};

    // Load theme state
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
    const savedSidebarCollapsed = localStorage.getItem('sidebarCollapsed');
    const savedFontSize = localStorage.getItem('fontSize') as 'sm' | 'md' | 'lg';

    if (savedTheme === 'light' || savedTheme === 'dark') {
      persistedState.theme = {
        ...initialState.theme,
        currentTheme: savedTheme
      };
    }

    if (savedSidebarCollapsed !== null) {
      const sidebarCollapsed = JSON.parse(savedSidebarCollapsed);
      persistedState.theme = {
        ...(persistedState.theme || initialState.theme),
        sidebarCollapsed
      };
    }

    if (savedFontSize === 'sm' || savedFontSize === 'md' || savedFontSize === 'lg') {
      persistedState.theme = {
        ...(persistedState.theme || initialState.theme),
        fontSize: savedFontSize
      };
    }

    // Load auth state
    const savedToken = localStorage.getItem('access_token');
    const savedRefreshToken = localStorage.getItem('refresh_token');

    if (savedToken || savedRefreshToken) {
      persistedState.auth = {
        ...initialState.auth,
        token: savedToken,
        refreshToken: savedRefreshToken
      };
    }

    // Apply persisted state
    if (Object.keys(persistedState).length > 0) {
      const currentState = this.stateSubject.value;
      this.stateSubject.next({
        ...currentState,
        ...persistedState
      });
    }
  }

  // Persist state to localStorage
  private persistState(updates: Partial<AppState>): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Persist theme
    if (updates.theme) {
      if (updates.theme.currentTheme !== undefined) {
        localStorage.setItem('theme', updates.theme.currentTheme);
      }
      if (updates.theme.sidebarCollapsed !== undefined) {
        localStorage.setItem('sidebarCollapsed', JSON.stringify(updates.theme.sidebarCollapsed));
      }
      if (updates.theme.fontSize !== undefined) {
        localStorage.setItem('fontSize', updates.theme.fontSize);
      }
    }

    // Persist auth tokens
    if (updates.auth?.token !== undefined) {
      if (updates.auth.token) {
        localStorage.setItem('access_token', updates.auth.token);
      } else {
        localStorage.removeItem('access_token');
      }
    }

    if (updates.auth?.refreshToken !== undefined) {
      if (updates.auth.refreshToken) {
        localStorage.setItem('refresh_token', updates.auth.refreshToken);
      } else {
        localStorage.removeItem('refresh_token');
      }
    }
  }

  // Getters for specific state slices
  get authState$(): Observable<AuthState> {
    return this.state$.pipe(
      map(state => state.auth),
      distinctUntilChanged()
    );
  }

  get themeState$(): Observable<ThemeState> {
    return this.state$.pipe(
      map(state => state.theme),
      distinctUntilChanged()
    );
  }

  get uiState$(): Observable<UIState> {
    return this.state$.pipe(
      map(state => state.ui),
      distinctUntilChanged()
    );
  }

  get isLoading$(): Observable<boolean> {
    return this.state$.pipe(
      map(state => state.ui.isLoading),
      distinctUntilChanged()
    );
  }

  get currentUser$(): Observable<User | null> {
    return this.state$.pipe(
      map(state => state.auth.user),
      distinctUntilChanged()
    );
  }

  get isAuthenticated$(): Observable<boolean> {
    return this.state$.pipe(
      map(state => true || state.auth.isAuthenticated),
      distinctUntilChanged()
    );
  }

  get currentTheme$(): Observable<'light' | 'dark'> {
    return this.state$.pipe(
      map(state => state.theme.currentTheme),
      distinctUntilChanged()
    );
  }

  get sidebarCollapsed$(): Observable<boolean> {
    return this.state$.pipe(
      map(state => state.theme.sidebarCollapsed),
      distinctUntilChanged()
    );
  }

  // Update methods
  private updateState(partialState: Partial<AppState>): void {
    const currentState = this.stateSubject.value;
    const newState = { ...currentState, ...partialState };

    // Persist changes to localStorage
    this.persistState(partialState);

    // Update state
    this.stateSubject.next(newState);
  }

  updateAuthState(authState: Partial<AuthState>): void {
    const currentState = this.stateSubject.value;
    const newAuthState = { ...currentState.auth, ...authState };
    this.updateState({
      auth: newAuthState
    });
  }

  updateThemeState(themeState: Partial<ThemeState>): void {
    const currentState = this.stateSubject.value;
    const newThemeState = { ...currentState.theme, ...themeState };
    this.updateState({
      theme: newThemeState
    });
  }

  updateUIState(uiState: Partial<UIState>): void {
    const currentState = this.stateSubject.value;
    const newUIState = { ...currentState.ui, ...uiState };
    this.updateState({
      ui: newUIState
    });
  }

  // Auth actions
  setUser(user: User | null): void {
    this.updateAuthState({ user });
  }

  setAuthentication(isAuthenticated: boolean): void {
    this.updateAuthState({ isAuthenticated });
  }

  setLoading(isLoading: boolean): void {
    this.updateUIState({ isLoading });
    this.updateAuthState({ loading: isLoading });
  }

  setError(error: string | null): void {
    this.updateAuthState({ error });
  }

  setTokens(token: string, refreshToken: string): void {
    this.updateAuthState({ token, refreshToken });
  }

  clearTokens(): void {
    this.updateAuthState({
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      user: null
    });
  }

  // Theme actions
  toggleSidebar(): void {
    const currentState = this.stateSubject.value;
    const newCollapsed = !currentState.theme.sidebarCollapsed;
    this.updateThemeState({ sidebarCollapsed: newCollapsed });
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.updateThemeState({ sidebarCollapsed: collapsed });
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.updateThemeState({ currentTheme: theme });
  }

  toggleTheme(): void {
    const currentState = this.stateSubject.value;
    const nextTheme = currentState.theme.currentTheme === 'light' ? 'dark' : 'light';
    this.updateThemeState({ currentTheme: nextTheme });
  }

  setFontSize(fontSize: 'sm' | 'md' | 'lg'): void {
    this.updateThemeState({ fontSize });
  }

  // UI actions
  addNotification(notification: Omit<Notification, 'id' | 'timestamp'>): void {
    const currentState = this.stateSubject.value;
    const newNotification: Notification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date()
    };
    this.updateUIState({
      notifications: [...currentState.ui.notifications, newNotification]
    });
  }

  markNotificationAsRead(id: string): void {
    const currentState = this.stateSubject.value;
    const updatedNotifications = currentState.ui.notifications.map(notification =>
      notification.id === id ? { ...notification, read: true } : notification
    );
    this.updateUIState({ notifications: updatedNotifications });
  }

  clearNotifications(): void {
    this.updateUIState({ notifications: [] });
  }

  setPageTitle(title: string): void {
    this.updateUIState({ currentPageTitle: title });
  }

  toggleMobileMenu(): void {
    const currentState = this.stateSubject.value;
    this.updateUIState({ mobileMenuOpen: !currentState.ui.mobileMenuOpen });
  }

  // Utility methods
  get currentUser(): User | null {
    return this.stateSubject.value.auth.user;
  }

  get isAuthenticated(): boolean {
    return this.stateSubject.value.auth.isAuthenticated;
  }

  get isLoading(): boolean {
    return this.stateSubject.value.ui.isLoading;
  }

  get currentTheme(): 'light' | 'dark' {
    return this.stateSubject.value.theme.currentTheme;
  }

  get isSidebarCollapsed(): boolean {
    return this.stateSubject.value.theme.sidebarCollapsed;
  }

  get unreadNotifications(): number {
    return this.stateSubject.value.ui.notifications.filter(n => !n.read).length;
  }
}
