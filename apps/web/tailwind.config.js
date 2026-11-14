/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "#FFFFEB",
          muted: "#E4E4D0",
        },
        ink: {
          DEFAULT: "#1A1A1A",
          soft: "#666666",
          muted: "#888888",
        },
        forest: {
          DEFAULT: "#034F46",
          soft: "#639085",
          dark: "#02352F",
        },
        lavender: {
          DEFAULT: "#F0D7FF",
          ink: "#1A1A1A",
          hover: "#E8C2FF",
        },
        orange: {
          DEFAULT: "#FFA946",
          soft: "#FFBE73",
        },
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
      },
      fontFamily: {
        serif: ['"EB Garamond"', "Georgia", "serif"],
        sans: ["Figtree", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        "2xl": "20px",
        "3xl": "28px",
        "4xl": "36px",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(26,26,15,.05)",
        hover: "0 4px 12px rgba(26,26,15,.06)",
        popover: "0 12px 24px rgba(26,26,15,.10)",
      },
      animation: {
        "pulse-subtle": "pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
