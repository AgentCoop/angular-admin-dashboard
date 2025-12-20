import { Injectable } from '@angular/core';
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
  currentTheme: 'light' | 'dark' | 'military';
  sidebarCollapsed: boolean;
  fontSize: 'sm' | 'md' | 'lg';
  colorScheme: 'blue' | 'green' | 'red' | 'military';
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
    token: localStorage.getItem('access_token'),
    refreshToken: localStorage.getItem('refresh_token')
  },
  theme: {
    currentTheme: 'military',
    sidebarCollapsed: localStorage.getItem('sidebarCollapsed') === 'true',
    fontSize: 'md',
    colorScheme: 'military'
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
      map(state => state.auth.isAuthenticated),
      distinctUntilChanged()
    );
  }

  // Update methods
  updateState(partialState: Partial<AppState>): void {
    const currentState = this.stateSubject.value;
    const newState = { ...currentState, ...partialState };
    this.stateSubject.next(newState);
  }

  updateAuthState(authState: Partial<AuthState>): void {
    const currentState = this.stateSubject.value;
    const newAuthState = { ...currentState.auth, ...authState };
    this.stateSubject.next({
      ...currentState,
      auth: newAuthState
    });
  }

  updateThemeState(themeState: Partial<ThemeState>): void {
    const currentState = this.stateSubject.value;
    const newThemeState = { ...currentState.theme, ...themeState };
    this.stateSubject.next({
      ...currentState,
      theme: newThemeState
    });
  }

  updateUIState(uiState: Partial<UIState>): void {
    const currentState = this.stateSubject.value;
    const newUIState = { ...currentState.ui, ...uiState };
    this.stateSubject.next({
      ...currentState,
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
    // Also update auth loading if needed
    this.updateAuthState({ loading: isLoading });
  }

  setError(error: string | null): void {
    this.updateAuthState({ error });
  }

  setTokens(token: string, refreshToken: string): void {
    localStorage.setItem('access_token', token);
    localStorage.setItem('refresh_token', refreshToken);
    this.updateAuthState({ token, refreshToken });
  }

  clearTokens(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
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
    localStorage.setItem('sidebarCollapsed', newCollapsed.toString());
    this.updateThemeState({ sidebarCollapsed: newCollapsed });
  }

  setTheme(theme: 'light' | 'dark' | 'military'): void {
    localStorage.setItem('theme', theme);
    this.updateThemeState({ currentTheme: theme });
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

  get currentTheme(): ThemeState {
    return this.stateSubject.value.theme;
  }

  get unreadNotifications(): number {
    return this.stateSubject.value.ui.notifications.filter(n => !n.read).length;
  }
}
