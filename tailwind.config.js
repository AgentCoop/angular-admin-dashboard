/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      // Extend with your military theme colors
      colors: {
        // Light theme color palette
        'camo-sand': '#d4c9a8',
        'camo-tan': '#c2b280',
        'camo-olive': '#8b8b6c',
        'camo-gray': '#a0a0a0',
        'camo-dark': '#6c6c5c',
        'steel-blue': '#5a7d9a',
        'field-green': '#7d8c6c',
        'desert-tan': '#e0d6b8',
        'military-white': '#f5f5f0',
        'military-black': '#3a3a35',
        'alert-red': '#b85252',
        'alert-orange': '#d18c5a',
        'success-green': '#5a8c6c',

        // Dark theme color palette
        'camo-sand-dark': '#5a5543',
        'camo-tan-dark': '#4a4535',
        'camo-olive-dark': '#3a3a2d',
        'camo-gray-dark': '#6a6a5a',
        'camo-dark-dark': '#2a2a23',
        'steel-blue-dark': '#3a5d7a',
        'field-green-dark': '#5d6c5a',
        'desert-tan-dark': '#4a4538',
        'military-white-dark': '#1a1a15',
        'military-black-dark': '#f0f0e0',
        'alert-red-dark': '#9a4242',
        'alert-orange-dark': '#b1744a',
        'success-green-dark': '#4a6c5a',
      },
      fontFamily: {
        sans: ['Segoe UI', 'Arial', 'Helvetica', 'sans-serif'],
        mono: ['Courier New', 'Consolas', 'monospace'],
      },
      borderRadius: {
        'military-sm': '3px',
        'military-md': '5px',
        'military-lg': '8px',
        'military-xl': '12px',
      },
      boxShadow: {
        'military-sm': '0 2px 4px rgba(58, 58, 53, 0.1)',
        'military-md': '0 4px 8px rgba(58, 58, 53, 0.15)',
        'military-lg': '0 8px 16px rgba(58, 58, 53, 0.2)',
        'military-xl': '0 12px 24px rgba(58, 58, 53, 0.25)',
      },
      transitionTimingFunction: {
        'military': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        'military': '0.2s',
        'military-slow': '0.3s',
      },
      spacing: {
        'military': '0.25rem',
        'military-md': '0.5rem',
        'military-lg': '1rem',
        'military-xl': '1.5rem',
      },
      zIndex: {
        'sidebar': '40',
        'header': '50',
        'modal': '100',
        'toast': '200',
      },
      backgroundImage: {
        'military-camo': "linear-gradient(45deg, #8b8b6c 25%, transparent 25%), linear-gradient(-45deg, #8b8b6c 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #8b8b6c 75%), linear-gradient(-45deg, transparent 75%, #8b8b6c 75%)",
        'military-stripes': "repeating-linear-gradient(45deg, transparent, transparent 10px, #d4c9a8 10px, #d4c9a8 20px)",
      },
      animation: {
        'pulse': 'pulse 2s infinite',
        'slide-down': 'slide-down 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
      },
    },
  },
  plugins: [],
  safelist: [
    // Safelist any custom classes you might use dynamically
    'military-grid-bg',
    'military-panel',
    'alert-panel',
    'success-panel',
    'warning-panel',
    'info-panel',
    'bg-military-camo',
    'bg-military-stripes',
  ],
}
