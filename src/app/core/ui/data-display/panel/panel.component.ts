import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'panel',
  templateUrl: './panel.component.html',
  styleUrls: ['./panel.component.scss']
})
export class PanelComponent {
  @Input() title: string = '';
  @Input() subtitle: string = '';
  @Input() icon: string = '';
  @Input() status: 'active' | 'restricted' | 'critical' | 'secure' | 'encrypted' | 'interactive' = 'active';
  @Input() badge: string = '';
  @Input() borderColor: string = 'border-camo-tan';
  @Input() showGradientHeader: boolean = true;

  @Output() close = new EventEmitter<void>();
  @Output() maximize = new EventEmitter<void>();
  @Output() minimize = new EventEmitter<void>();

  getStatusClasses() {
    switch (this.status) {
      case 'active':
        return 'bg-green-50 text-success-green border border-success-green';
      case 'restricted':
        return 'bg-orange-50 text-alert-orange border border-alert-orange';
      case 'critical':
        return 'bg-red-50 text-alert-red border border-alert-red';
      case 'secure':
      case 'encrypted':
      case 'interactive':
        return 'bg-steel-blue text-white border border-steel-blue';
      default:
        return 'bg-green-50 text-success-green border border-success-green';
    }
  }

  getStatusDotColor() {
    switch (this.status) {
      case 'active':
        return 'bg-success-green';
      case 'restricted':
        return 'bg-alert-orange';
      case 'critical':
        return 'bg-alert-red';
      case 'secure':
      case 'encrypted':
      case 'interactive':
        return 'bg-white';
      default:
        return 'bg-success-green';
    }
  }

  getStatusText() {
    if (this.status === 'encrypted') return 'ENCRYPTED';
    if (this.status === 'secure') return 'SECURE';
    if (this.status === 'interactive') return 'INTERACTIVE';
    return this.status.toUpperCase();
  }

  getIconClass() {
    const iconMap: {[key: string]: string} = {
      'active': 'fas fa-check-circle',
      'restricted': 'fas fa-exclamation-triangle',
      'critical': 'fas fa-skull-crossbones',
      'secure': 'fas fa-shield-alt',
      'encrypted': 'fas fa-lock',
      'interactive': 'fas fa-bolt'
    };
    return iconMap[this.status] || 'fas fa-check-circle';
  }

  onClose() {
    this.close.emit();
  }

  onMaximize() {
    this.maximize.emit();
  }

  onMinimize() {
    this.minimize.emit();
  }
}
