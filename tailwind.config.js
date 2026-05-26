/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gov: {
          950: '#030712', // Deepest background
          900: '#0b0f19', // Primary panel background
          850: '#111827', // Rich dark panels
          800: '#1f2937', // Intermediate background
          750: '#2d3748', // Card background
          700: '#374151', // Active elements / borders
          600: '#4b5563', // Borders & text-muted
          500: '#6b7280', // Text secondary
          400: '#9ca3af', // Muted highlights
          300: '#d1d5db', // Subtitles
          200: '#e5e7eb', // Reading body
          100: '#f3f4f6', // Clean highlights
          50: '#f9fafb',
        },
        brand: {
          cyan: '#06b6d4',     // Agent actions
          indigo: '#6366f1',   // Navigation & key elements
          emerald: '#10b981',  // Clean status match
          amber: '#f59e0b',    // Warning/Conflict status
          rose: '#ef4444',     // No-match / Error status
          blue: '#3b82f6',     // Fallback status
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Fira Mono', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
