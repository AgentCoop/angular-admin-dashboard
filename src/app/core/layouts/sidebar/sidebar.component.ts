import { Component, Input, Output, EventEmitter, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';

interface MenuItem {
  title: string;
  icon: string;
  route: string;
  badge?: {
    text: string;
    type: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  };
  expanded?: boolean;
  children?: MenuItem[];
  roles?: string[];
  permissions?: string[];
}

interface UserStatus {
  name: string;
  rank: string;
  level: number;
  status: 'online' | 'offline' | 'away';
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit {
  @Input() collapsed = false;
  @Input() currentRoute = '';
  @Input() userPermissions: string[] = [];
  @Input() userStatus: UserStatus = {
    name: 'Operator-742',
    rank: 'Captain',
    level: 3,
    status: 'online'
  };

  @Output() menuToggle = new EventEmitter<void>();
  @Output() lockSystem = new EventEmitter<void>();
  @Output() emergencyProtocol = new EventEmitter<void>();

  // Menu state
  menuItems: MenuItem[] = [
    {
      title: 'Dashboard',
      icon: 'fas fa-tachometer-alt',
      route: '/dashboard',
      badge: { text: 'LIVE', type: 'primary' }
    },
    {
      title: 'Intelligence',
      icon: 'fas fa-binoculars',
      route: '/dashboard/intelligence',
      badge: { text: 'NEW', type: 'danger' },
      expanded: false,
      children: [
        {
          title: 'Geospatial Intel',
          icon: 'fas fa-map-marked-alt',
          route: '/dashboard/intelligence/geospatial',
          permissions: ['view_intel']
        },
        {
          title: 'SIGINT',
          icon: 'fas fa-satellite-dish',
          route: '/dashboard/intelligence/sigint',
          expanded: false,
          children: [
            {
              title: 'Signals Analysis',
              icon: 'fas fa-wifi',
              route: '/dashboard/intelligence/sigint/analysis',
              permissions: ['view_sigint']
            },
            {
              title: 'Code Breaking',
              icon: 'fas fa-code',
              route: '/dashboard/intelligence/sigint/code-breaking',
              permissions: ['decrypt_data']
            }
          ]
        },
        {
          title: 'HUMINT',
          icon: 'fas fa-user-secret',
          route: '/dashboard/intelligence/humint',
          permissions: ['view_humint']
        }
      ]
    },
    {
      title: 'Operations',
      icon: 'fas fa-crosshairs',
      route: '/dashboard/operations',
      badge: { text: '3 ACTIVE', type: 'warning' },
      expanded: false,
      children: [
        {
          title: 'Air Operations',
          icon: 'fas fa-plane',
          route: '/dashboard/operations/air',
          permissions: ['view_air_ops']
        },
        {
          title: 'Naval Operations',
          icon: 'fas fa-ship',
          route: '/dashboard/operations/naval',
          permissions: ['view_naval_ops']
        },
        {
          title: 'Special Forces',
          icon: 'fas fa-user-ninja',
          route: '/dashboard/operations/special-forces',
          permissions: ['view_special_ops']
        }
      ]
    },
    {
      title: 'Communications',
      icon: 'fas fa-satellite',
      route: '/dashboard/communications',
      badge: { text: 'ENCRYPTED', type: 'success' }
    },
    {
      title: 'Equipment',
      icon: 'fas fa-tools',
      route: '/dashboard/equipment',
      expanded: false,
      children: [
        {
          title: 'Aircraft',
          icon: 'fas fa-fighter-jet',
          route: '/dashboard/equipment/aircraft'
        },
        {
          title: 'Ground Vehicles',
          icon: 'fas fa-tank',
          route: '/dashboard/equipment/vehicles'
        },
        {
          title: 'Defense Systems',
          icon: 'fas fa-shield-alt',
          route: '/dashboard/equipment/defense'
        }
      ]
    },
    {
      title: 'Personnel',
      icon: 'fas fa-users',
      route: '/dashboard/personnel',
      badge: { text: '12', type: 'info' }
    },
    {
      title: 'Settings',
      icon: 'fas fa-cog',
      route: '/dashboard/settings'
    },
    {
      title: 'Mission Logs',
      icon: 'fas fa-clipboard-list',
      route: '/dashboard/logs'
    }
  ];

  // System status
  systemStatus = {
    online: true,
    alertLevel: 2,
    lastUpdate: new Date()
  };

  // Emergency menu item
  emergencyItem: MenuItem = {
    title: 'Emergency Protocol',
    icon: 'fas fa-exclamation-triangle',
    route: '/dashboard/emergency'
  };

  // Mobile menu state
  mobileMenuOpen = false;

  private routerSubscription: Subscription = new Subscription();

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Subscribe to route changes to update active state
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.currentRoute = this.router.url;
      });
  }

  ngOnDestroy(): void {
    this.routerSubscription.unsubscribe();
  }

  // Check if user has permission for menu item
  hasPermission(item: MenuItem): boolean {
    if (!item.permissions || item.permissions.length === 0) {
      return true;
    }
    return item.permissions.some(permission =>
      this.userPermissions.includes(permission)
    );
  }

  // Check if item or any child is active
  isItemActive(item: MenuItem): boolean {
    if (this.currentRoute === item.route) {
      return true;
    }

    if (item.children) {
      return item.children.some(child => this.isItemActive(child));
    }

    return false;
  }

  // Toggle menu item expansion
  toggleMenuItem(item: MenuItem): void {
    if (item.children && item.children.length > 0) {
      item.expanded = !item.expanded;
    } else {
      this.router.navigate([item.route]);
      this.closeMobileMenu();
    }
  }

  // Handle emergency protocol
  onEmergencyProtocol(): void {
    this.emergencyProtocol.emit();
    this.router.navigate(['/dashboard/emergency']);
    this.closeMobileMenu();
  }

  // Toggle mobile menu
  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    if (this.mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
    document.body.style.overflow = 'auto';
  }

  // Handle lock system
  onLockSystem(): void {
    this.lockSystem.emit();
  }

  // Get badge color classes
  getBadgeClasses(type: string): string {
    const badgeClasses = {
      primary: 'bg-steel-blue/10 text-steel-blue',
      success: 'bg-success-green/10 text-success-green',
      warning: 'bg-alert-orange/10 text-alert-orange',
      danger: 'bg-alert-red/10 text-alert-red',
      info: 'bg-steel-blue text-white'
    };

    return badgeClasses[type as keyof typeof badgeClasses] || badgeClasses.primary;
  }

  // Get status dot color
  getStatusColor(status: string): string {
    const statusColors = {
      online: 'bg-success-green',
      offline: 'bg-alert-red',
      away: 'bg-alert-orange'
    };

    return statusColors[status as keyof typeof statusColors] || statusColors.online;
  }

  // Close menu when clicking outside on mobile
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.mobileMenuOpen) {
      const target = event.target as HTMLElement;
      const mobileNav = document.getElementById('mobileNav');
      const menuToggle = document.querySelector('[data-menu-toggle]');

      if (mobileNav && !mobileNav.contains(target) &&
        menuToggle && !menuToggle.contains(target)) {
        this.closeMobileMenu();
      }
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    // Close mobile menu on resize to desktop
    if (window.innerWidth >= 1024 && this.mobileMenuOpen) {
      this.closeMobileMenu();
    }
  }
}
