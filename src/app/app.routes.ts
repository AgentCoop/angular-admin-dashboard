import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login-page/login-page.component')
      .then(m => m.LoginPageComponent)
  },
  {
    path: 'error',
    loadComponent: () => import('./pages/error-page/error-page.component')
      .then(m => m.ErrorPageComponent)
  },
  {
    path: 'dashboard',
    //canActivate: [authGuard],
    loadChildren: () => import('./features/dashboard/dashboard.routes')
      .then(m => m.DASHBOARD_ROUTES)
  },
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: '/error'
  }
];
