import { ApplicationConfig, provideZoneChangeDetection, InjectionToken } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const CENTRIFUGO_URL = new InjectionToken<string>('CENTRIFUGO_URL');

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withHashLocation()), // Hash-based routing
    //provideHttpClient(withInterceptors([authInterceptor])),c

    { provide: CENTRIFUGO_URL, useValue: 'ws://192.168.1.150:8005/connection/websocket' },
  ]
};
