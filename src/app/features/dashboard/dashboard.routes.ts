import { Routes } from '@angular/router';
import { DashboardPageComponent } from './pages/dashboard-page/dashboard-page.component';

export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    component: DashboardPageComponent
  },
  // {
  //   path: 'users',
  //   loadComponent: () => import('./pages/users-page/users-page.component')
  //     .then(m => m.UsersPageComponent)
  // },
  // {
  //   path: 'settings',
  //   loadComponent: () => import('./pages/settings-page/settings-page.component')
  //     .then(m => m.SettingsPageComponent)
  // }
];
