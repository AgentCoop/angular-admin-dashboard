import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError, of } from 'rxjs';
import { catchError, tap, switchMap, map, delay, finalize } from 'rxjs/operators';
import { jwtDecode } from 'jwt-decode';
import { StateService, User } from './state.service';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface DecodedToken {
  sub: string;
  email: string;
  exp: number;
  iat: number;
  roles: string[];
  permissions?: string[];
  userId: string;
  name?: string;
  avatar?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private tokenRefreshInProgress = false;

  constructor(
    private http: HttpClient,
    private router: Router,
    private state: StateService
  ) {
    this.checkInitialAuth();
  }

  private checkInitialAuth(): void {
    const token = localStorage.getItem('access_token');

    if (token && !this.isTokenExpired(token)) {
      const decoded = this.decodeToken(token);
      if (decoded) {
        const user: User = {
          id: decoded.userId,
          email: decoded.email,
          name: decoded.name || 'User',
          avatar: decoded.avatar || 'assets/images/default-avatar.png',
          roles: decoded.roles || ['USER'],
          permissions: decoded.permissions || ['view_dashboard']
        };

        this.state.setUser(user);
        this.state.setAuthentication(true);
      }
    }
  }

  login(username: string, password: string): Observable<AuthTokens> {
    this.state.setLoading(true);
    this.state.setError(null);

    // Mock API call for development
    const mockTokens: AuthTokens = {
      accessToken: this.generateMockToken(username),
      refreshToken: 'mock_refresh_token_' + Date.now(),
      expiresIn: 3600
    };

    return of(mockTokens).pipe(
      delay(800),
      tap(tokens => {
        this.storeTokens(tokens);
        const decoded = this.decodeToken(tokens.accessToken);

        if (decoded) {
          const user: User = {
            id: decoded.userId,
            email: decoded.email,
            name: decoded.name || username,
            avatar: decoded.avatar || 'assets/images/default-avatar.png',
            roles: decoded.roles || ['USER'],
            permissions: decoded.permissions || ['view_dashboard']
          };

          this.state.setUser(user);
          this.state.setAuthentication(true);
          this.state.setError(null);

          // Add login notification
          this.state.addNotification({
            type: 'success',
            title: 'Login Successful',
            message: `Welcome back, ${user.name}!`,
            read: false
          });
        }
      }),
      catchError(error => {
        this.clearTokens();
        this.state.setError('Invalid credentials. Please try again.');

        this.state.addNotification({
          type: 'error',
          title: 'Login Failed',
          message: 'Invalid username or password',
          read: false
        });

        return throwError(() => error);
      }),
      finalize(() => {
        this.state.setLoading(false);
      })
    );
  }

  logout(): void {
    this.state.setLoading(true);

    // Simulate logout API call
    of({}).pipe(
      delay(300),
      finalize(() => {
        this.clearTokens();
        this.state.setAuthentication(false);
        this.state.setUser(null);
        this.state.setError(null);
        this.state.setLoading(false);

        // Add logout notification
        this.state.addNotification({
          type: 'info',
          title: 'Logged Out',
          message: 'You have been successfully logged out.',
          read: false
        });

        // Redirect to login
        this.router.navigate(['/login']);
      })
    ).subscribe();
  }

  refreshAccessToken(): Observable<AuthTokens> {
    const refreshToken = this.state.currentUser ?
      localStorage.getItem('refresh_token') : null;

    if (!refreshToken) {
      this.logout();
      return throwError(() => new Error('No refresh token available'));
    }

    if (this.tokenRefreshInProgress) {
      // If refresh is already in progress, we should handle this differently
      return throwError(() => new Error('Token refresh already in progress'));
    }

    this.tokenRefreshInProgress = true;
    this.state.setLoading(true);

    // Mock refresh for development
    const mockTokens: AuthTokens = {
      accessToken: this.generateMockToken('refreshed'),
      refreshToken: 'refreshed_mock_token_' + Date.now(),
      expiresIn: 3600
    };

    return of(mockTokens).pipe(
      delay(600),
      tap(tokens => {
        this.storeTokens(tokens);
        this.tokenRefreshInProgress = false;

        // Add notification
        this.state.addNotification({
          type: 'info',
          title: 'Session Refreshed',
          message: 'Your session has been refreshed.',
          read: false
        });
      }),
      catchError(error => {
        this.tokenRefreshInProgress = false;
        this.state.setError('Session expired. Please login again.');

        this.state.addNotification({
          type: 'error',
          title: 'Session Expired',
          message: 'Your session has expired. Please login again.',
          read: false
        });

        this.logout();
        return throwError(() => error);
      }),
      finalize(() => {
        this.state.setLoading(false);
      })
    );
  }

  // Helper methods
  private decodeToken(token: string): DecodedToken | null {
    try {
      // For mock tokens
      if (token.includes('mock')) {
        return {
          sub: 'user_' + Date.now(),
          email: 'user@example.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          roles: ['ADMIN', 'USER'],
          permissions: ['view_dashboard', 'manage_users', 'edit_content', 'view_reports'],
          userId: 'user_123',
          name: 'John Doe',
          avatar: 'assets/images/default-avatar.png'
        };
      }

      // For real JWT tokens
      return jwtDecode<DecodedToken>(token);
    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  }

  private storeTokens(tokens: AuthTokens): void {
    this.state.setTokens(tokens.accessToken, tokens.refreshToken);
  }

  private clearTokens(): void {
    this.state.clearTokens();
  }

  private generateMockToken(username: string): string {
    const mockPayload = {
      username: username,
      timestamp: Date.now()
    };
    return 'mock_jwt_token_' + btoa(JSON.stringify(mockPayload));
  }

  public isTokenExpired(token: string): boolean {
    try {
      const decoded = jwtDecode<DecodedToken>(token);
      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp < currentTime;
    } catch {
      return true;
    }
  }

  // Public methods that use state service
  getCurrentUser(): User | null {
    return this.state.currentUser;
  }

  getCurrentUserObservable() {
    return this.state.currentUser$;
  }

  getUserRoles(): string[] {
    return this.state.currentUser?.roles || [];
  }

  getUserPermissions(): string[] {
    return this.state.currentUser?.permissions || [];
  }

  getUserId(): string | null {
    return this.state.currentUser?.id || null;
  }

  hasRole(role: string): boolean {
    const roles = this.getUserRoles();
    return roles.includes(role);
  }

  hasAnyRole(roles: string[]): boolean {
    const userRoles = this.getUserRoles();
    return roles.some(role => userRoles.includes(role));
  }

  hasAllRoles(roles: string[]): boolean {
    const userRoles = this.getUserRoles();
    return roles.every(role => userRoles.includes(role));
  }

  hasPermission(permission: string): boolean {
    const permissions = this.getUserPermissions();
    return permissions.includes(permission);
  }

  hasAnyPermission(permissions: string[]): boolean {
    const userPermissions = this.getUserPermissions();
    return permissions.some(permission => userPermissions.includes(permission));
  }

  hasAllPermissions(permissions: string[]): boolean {
    const userPermissions = this.getUserPermissions();
    return permissions.every(permission => userPermissions.includes(permission));
  }

  isAuthenticated(): boolean {
    return this.state.isAuthenticated;
  }

  getAuthStatus() {
    return this.state.isAuthenticated$;
  }

  getLoadingState() {
    return this.state.isLoading$;
  }

  getError() {
    return this.state.authState$.pipe(map(auth => auth.error));
  }

  // API methods (uncomment when backend is ready)
  /*
  loadUserProfile(): Observable<User> {
    return this.http.get<User>('/api/auth/profile').pipe(
      tap(profile => {
        this.state.setUser(profile);
      })
    );
  }

  updateUserProfile(userData: Partial<User>): Observable<User> {
    return this.http.put<User>('/api/auth/profile', userData).pipe(
      tap(updatedProfile => {
        this.state.setUser(updatedProfile);
      })
    );
  }
  */
}
