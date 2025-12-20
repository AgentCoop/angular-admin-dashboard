// src/app/core/services/theme.service.ts
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';


export type Theme = 'light' | 'dark';

const DEFAULT_THEME: Theme = 'light';
const STORAGE_KEY_THEME = 'military-theme';

const THEME_CLASSES: Record<Theme, string> = {
  light: 'light-theme',
  dark: 'dark-theme',
};

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly currentTheme$ = new BehaviorSubject<Theme>(DEFAULT_THEME);
  readonly theme$ = this.currentTheme$.asObservable();

  constructor(@Inject(PLATFORM_ID) private readonly platformId: Object) {
    this.loadTheme();
  }

  private loadTheme(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const savedTheme =
      (localStorage.getItem(STORAGE_KEY_THEME) as Theme) ?? DEFAULT_THEME;

    this.setTheme(savedTheme);
  }

  setTheme(theme: Theme): void {
    this.currentTheme$.next(theme);

    if (!isPlatformBrowser(this.platformId)) return;

    this.updateBodyClass(theme);
    localStorage.setItem(STORAGE_KEY_THEME, theme);
  }

  toggleTheme(): void {
    const nextTheme: Theme =
      this.currentTheme$.value === 'light' ? 'dark' : 'light';

    this.setTheme(nextTheme);
  }

  getCurrentTheme(): Theme {
    return this.currentTheme$.value;
  }

  private updateBodyClass(theme: Theme): void {
    Object.values(THEME_CLASSES).forEach(cssClass =>
      document.body.classList.remove(cssClass)
    );

    document.body.classList.add(THEME_CLASSES[theme]);
  }
}
