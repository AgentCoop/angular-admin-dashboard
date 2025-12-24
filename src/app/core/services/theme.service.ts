import { Injectable, Inject, Renderer2, RendererFactory2, OnDestroy } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { NamespacedStateService } from './state/namespaced-state.service';
import { UnifiedStateService } from './state/unified-state.service';

export type Theme = 'light' | 'dark';
export type FontSize = 'sm' | 'md' | 'lg';

export interface ThemeState {
  theme: Theme;
  fontSize: FontSize;
  sidebarCollapsed: boolean;
}

const INITIAL_THEME_STATE: ThemeState = {
  theme: 'light',
  fontSize: 'md',
  sidebarCollapsed: false
};

const THEME_CLASSES: Record<Theme, string> = {
  light: 'light-theme',
  dark: 'dark-theme',
};

const THEME_COLORS: Record<Theme, string> = {
  light: '#f5f5f0',
  dark: '#121212'
};

@Injectable({
  providedIn: 'root',
})
export class ThemeService extends NamespacedStateService<ThemeState> implements OnDestroy {
  private renderer: Renderer2;
  private themeSubscription: Subscription;

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private rendererFactory: RendererFactory2,
    stateService: UnifiedStateService
  ) {
    // Pass namespace and initialState via super() call
    super(stateService, 'theme', INITIAL_THEME_STATE);

    this.renderer = rendererFactory.createRenderer(null, null);

    // Subscribe to theme changes to apply CSS classes reactively
    this.themeSubscription = this.select(state => state.theme).subscribe(theme => {
      this.applyTheme(theme);
    });

    // Subscribe to font size changes
    this.subscriptions.push(
      this.select(state => state.fontSize).subscribe(fontSize => {
        this.applyFontSize(fontSize);
      })
    );

    // Apply initial theme
    this.applyInitialTheme();
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    this.themeSubscription?.unsubscribe();
  }

  private applyInitialTheme(): void {
    const state = this.getState();
    this.applyTheme(state.theme);
    this.applyFontSize(state.fontSize);
  }

  // ============ PUBLIC API ============

  // Theme methods
  setTheme(theme: Theme): void {
    this.patchState({ theme });
  }

  toggleTheme(): void {
    const currentTheme = this.getState().theme;
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
  }

  getCurrentTheme(): Theme {
    return this.getState().theme;
  }

  get theme$(): Observable<Theme> {
    return this.select(state => state.theme);
  }

  private applyTheme(theme: Theme): void {
    const body = this.document.body;

    // Remove existing theme classes
    Object.values(THEME_CLASSES).forEach(cssClass =>
      this.renderer.removeClass(body, cssClass)
    );

    // Add new theme class
    this.renderer.addClass(body, THEME_CLASSES[theme]);

    // Update theme color meta tag
    this.updateThemeColorMeta(theme);
  }

  private updateThemeColorMeta(theme: Theme): void {
    const metaThemeColor = this.document.querySelector('meta[name="theme-color"]');
    const color = THEME_COLORS[theme];

    if (metaThemeColor && color) {
      this.renderer.setAttribute(metaThemeColor, 'content', color);
    }
  }

  // Sidebar methods
  toggleSidebar(): void {
    const currentState = this.getState();
    this.patchState({ sidebarCollapsed: !currentState.sidebarCollapsed });
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.patchState({ sidebarCollapsed: collapsed });
  }

  getSidebarCollapsed(): boolean {
    return this.getState().sidebarCollapsed;
  }

  get sidebarCollapsed$(): Observable<boolean> {
    return this.select(state => state.sidebarCollapsed);
  }

  // Font size methods
  setFontSize(fontSize: FontSize): void {
    this.patchState({ fontSize });
  }

  private applyFontSize(fontSize: FontSize): void {
    const body = this.document.body;

    // Remove existing font size classes
    ['sm', 'md', 'lg'].forEach(size => {
      this.renderer.removeClass(body, `font-size-${size}`);
    });

    // Add new font size class
    this.renderer.addClass(body, `font-size-${fontSize}`);
  }

  // Optionally add a getter for fontSize observable
  get fontSize$(): Observable<FontSize> {
    return this.select(state => state.fontSize);
  }
}
