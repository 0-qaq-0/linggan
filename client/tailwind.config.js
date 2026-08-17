/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#00d4ff',
        'primary-dark': '#0099cc',
        accent: '#a78bfa',
        'accent-light': '#c4b5fd',
        'bg-deep': '#0a0a1a',
        'bg-card': 'rgba(15, 15, 40, 0.55)',
      },
      backdropBlur: {
        glass: '20px',
      },
      animation: {
        'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
    },
  },
  plugins: [],
};
