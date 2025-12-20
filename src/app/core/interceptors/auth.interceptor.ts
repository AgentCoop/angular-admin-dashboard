import { HttpInterceptorFn, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, filter, take, switchMap } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

// Track if token refresh is in progress
let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Skip auth for certain endpoints
  if (shouldSkipAuth(req.url)) {
    return next(req);
  }

  // Add authorization header
  const authReq = addAuthHeader(req, authService);

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Handle 401 Unauthorized - try to refresh token
      if (error.status === 401 && !req.url.includes('/api/auth/refresh')) {
        return handle401Error(req, next, authService, router);
      }

      // Handle other errors
      return handleOtherErrors(error, router);
    })
  );
};

function addAuthHeader(req: any, authService: AuthService): any {
  const token = '';//authService.getAccessToken();

  if (!token || authService.isTokenExpired(token)) {
    return req;
  }

  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
      'Content-Type': req.headers.get('Content-Type') || 'application/json'
    }
  });
}

function shouldSkipAuth(url: string): boolean {
  const skipPatterns = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/assets/',
    '.json' // If you have JSON config files
  ];

  return skipPatterns.some(pattern => url.includes(pattern));
}

function handle401Error(
  req: any,
  next: any,
  authService: AuthService,
  router: Router
): Observable<any> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    return authService.refreshAccessToken().pipe(
      switchMap((tokens: any) => {
        isRefreshing = false;
        refreshTokenSubject.next(tokens.accessToken);

        // Retry the original request with new token
        const authReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${tokens.accessToken}`
          }
        });
        return next(authReq);
      }),
      catchError((error) => {
        isRefreshing = false;
        authService.logout();
        return throwError(() => error);
      })
    );
  } else {
    // Wait for token refresh to complete, then retry request
    return refreshTokenSubject.pipe(
      filter(token => token !== null),
      take(1),
      switchMap(token => {
        const authReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`
          }
        });
        return next(authReq);
      })
    );
  }
}

function handleOtherErrors(error: HttpErrorResponse, router: Router): Observable<never> {
  let userMessage = 'An error occurred';

  // Map status codes to user-friendly messages
  const errorMessages: { [key: number]: string } = {
    400: 'Bad request. Please check your input.',
    403: 'You do not have permission to perform this action.',
    404: 'The requested resource was not found.',
    429: 'Too many requests. Please try again later.',
    500: 'Internal server error. Please try again later.',
    502: 'Bad gateway. Please try again later.',
    503: 'Service unavailable. Please try again later.',
    504: 'Gateway timeout. Please try again later.',
  };

  userMessage = errorMessages[error.status] || userMessage;

  // Log error details (in production, send to logging service)
  console.error('HTTP Error Details:', {
    url: error.url,
    status: error.status,
    message: error.message,
    timestamp: new Date().toISOString()
  });

  // For client-side errors (0 status), show network error
  if (error.status === 0) {
    userMessage = 'Network error. Please check your internet connection.';
  }

  // Navigate to error page for certain errors
  if ([403, 404, 500].includes(error.status)) {
    router.navigate(['/error'], {
      queryParams: {
        code: error.status,
        message: userMessage
      }
    });
  }

  return throwError(() => new Error(userMessage));
}
