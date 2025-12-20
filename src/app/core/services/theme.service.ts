import { Injectable, Inject, Renderer2, RendererFactory2 } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Observable, map } from 'rxjs';
import { StateService } from './state.service';

export type Theme = 'light' | 'dark';
export type FontSize = 'sm' | 'md' | 'lg';

const THEME_CLASSES: Record<Theme, string> = {
  light: 'light-theme',
  dark: 'dark-theme',
};

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private renderer: Renderer2;

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private rendererFactory: RendererFactory2,
    private state: StateService
  ) {
    this.renderer = rendererFactory.createRenderer(null, null);
    this.initializeTheme();
  }

  private initializeTheme(): void {
    // Apply initial theme from state
    const initialTheme = this.state.currentTheme;
    this.applyTheme(initialTheme);
  }

  // Theme methods
  setTheme(theme: Theme): void {
    // Update state (which will persist to localStorage)
    this.state.setTheme(theme);
    this.applyTheme(theme);
  }

  toggleTheme(): void {
    this.state.toggleTheme();
    this.applyTheme(this.state.currentTheme);
  }

  getCurrentTheme(): Theme {
    return this.state.currentTheme;
  }

  get theme$(): Observable<Theme> {
    return this.state.currentTheme$;
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
    const colors = {
      light: '#f5f5f0',
      dark: '#121212'
    };

    if (metaThemeColor && colors[theme]) {
      this.renderer.setAttribute(metaThemeColor, 'content', colors[theme]);
    }
  }

  // Sidebar methods (delegated to StateService)
  toggleSidebar(): void {
    this.state.toggleSidebar();
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.state.setSidebarCollapsed(collapsed);
  }

  getSidebarCollapsed(): boolean {
    return this.state.isSidebarCollapsed;
  }

  get sidebarCollapsed$(): Observable<boolean> {
    return this.state.sidebarCollapsed$;
  }

  // Font size methods
  setFontSize(fontSize: FontSize): void {
    this.state.setFontSize(fontSize);
    this.applyFontSize(fontSize);
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

  // getFontSize(): FontSize {
  //   return this.state.themeState$.pipe(
  //     map(theme => theme.fontSize)
  //   ) as Observable<FontSize>;
  // }
}
