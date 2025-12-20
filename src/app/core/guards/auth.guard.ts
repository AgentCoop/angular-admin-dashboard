import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, catchError, of, take } from 'rxjs';

export const authGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Check if user is authenticated
  if (authService.isAuthenticated()) {
    // Check if route requires specific roles
    const requiredRoles = route.data['roles'] as string[] | undefined;

    if (requiredRoles && requiredRoles.length > 0) {
      const hasRequiredRole = requiredRoles.some(role => authService.hasRole(role));

      if (!hasRequiredRole) {
        // User doesn't have required role, redirect to unauthorized page
        router.navigate(['/error'], {
          queryParams: {
            code: '403',
            message: 'You do not have permission to access this page'
          }
        });
        return false;
      }
    }

    // Check if route requires specific permissions
    const requiredPermissions = route.data['permissions'] as string[] | undefined;

    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPermissions = authService.getUserPermissions(); // You'll need to implement this
      const hasRequiredPermissions = requiredPermissions.every(permission =>
        userPermissions.includes(permission)
      );

      if (!hasRequiredPermissions) {
        router.navigate(['/error'], {
          queryParams: {
            code: '403',
            message: 'Insufficient permissions'
          }
        });
        return false;
      }
    }

    // All checks passed
    return true;
  }

  // User not authenticated, redirect to login with return URL
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url }
  });
};
