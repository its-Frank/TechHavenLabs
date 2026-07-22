import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Design system: Deep Obsidian + Aurora
        void:     '#08080c',
        base:     '#0d0d12',
        surface:  '#111118',
        elevated: '#16161f',
        overlay:  '#1c1c28',
        // Accent palette
        violet:   '#8b5cf6',
        cyan:     '#06b6d4',
        emerald:  '#10b981',
        amber:    '#f59e0b',
        rose:     '#f43f5e',
      },
      backgroundImage: {
        aurora: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
        'aurora-soft': 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.15))',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'badge-pop': 'badge-pop 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        'modal-pop': 'modal-pop 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        'toast-in':  'toast-in 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        'toast-out': 'toast-out 0.25s ease forwards',
        'notif-pulse': 'notif-pulse 2.5s ease-in-out infinite',
      },
      keyframes: {
        'badge-pop': {
          '0%':   { transform: 'scale(0)', opacity: '0' },
          '70%':  { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'modal-pop': {
          from: { opacity: '0', transform: 'scale(0.94) translateY(8px)' },
          to:   { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateX(100%) scale(0.9)' },
          to:   { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'toast-out': {
          from: { opacity: '1', transform: 'translateX(0) scale(1)' },
          to:   { opacity: '0', transform: 'translateX(100%) scale(0.9)' },
        },
        'notif-pulse': {
          '0%,100%': { boxShadow: 'none' },
          '50%':     { boxShadow: '0 0 0 3px rgba(244,63,94,0.2)' },
        },
      },
      boxShadow: {
        glow:   '0 0 20px rgba(139,92,246,0.25)',
        'glow-sm': '0 0 12px rgba(139,92,246,0.15)',
      },
      borderColor: {
        DEFAULT: 'rgba(255,255,255,0.06)',
      },
    },
  },
  plugins: [
    require('tailwind-motionkit')({
    duration: '1s', // Change default animation duration
    delay: '500ms', // Add default delay
    iterationCount: '2' // Make animations repeat infinitely
    })
  ],
};

export default config;
