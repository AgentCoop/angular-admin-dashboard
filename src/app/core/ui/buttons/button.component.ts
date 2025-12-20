import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './button.component.html'
})
export class ButtonComponent {
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'md';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() fullWidth = false;
  @Input() routerLink: string | null = null;
  @Output() clicked = new EventEmitter<void>();

  get buttonClasses(): string {
    const baseClasses = [
      'font-mono',
      'font-medium',
      'rounded-military-md',
      'transition-all',
      'duration-200',
      'border',
      'flex',
      'items-center',
      'justify-center',
      'gap-2',
      'disabled:opacity-50',
      'disabled:cursor-not-allowed',
      this.fullWidth ? 'w-full' : ''
    ];

    const variantClasses = {
      primary: 'bg-steel-blue text-military-white border-steel-blue hover:bg-steel-blue/90',
      secondary: 'bg-camo-tan text-military-black border-camo-tan hover:bg-camo-tan/90',
      danger: 'bg-alert-red text-military-white border-alert-red hover:bg-alert-red/90',
      success: 'bg-success-green text-military-white border-success-green hover:bg-success-green/90',
      outline: 'bg-transparent text-military-black border-camo-gray hover:bg-camo-sand/30'
    };

    const sizeClasses = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2.5 text-base',
      lg: 'px-6 py-3.5 text-lg'
    };

    return [
      ...baseClasses,
      variantClasses[this.variant],
      sizeClasses[this.size]
    ].join(' ');
  }

  onClick(): void {
    if (!this.disabled && !this.loading) {
      this.clicked.emit();
    }
  }
}
