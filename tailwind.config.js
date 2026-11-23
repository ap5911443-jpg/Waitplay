/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "#FFFFEB",
          muted: "#E4E4D0",
          card: "#FFFFFF",
        },
        ink: {
          DEFAULT: "#1A1A1A",
          soft: "#666666",
          muted: "#888888",
          light: "#A0A090",
        },
        forest: {
          DEFAULT: "#034F46",
          dark: "#023932",
          soft: "#639085",
          light: "#E1ECE9",
        },
        lavender: {
          DEFAULT: "#F0D7FF",
          hover: "#E8C4FF",
          subtle: "#F9F0FF",
          ink: "#1A1A1A",
        },
        amber: {
          accent: "#FFA946",
        },
        border: {
          standard: "rgba(26, 26, 26, 0.22)",
          soft: "rgba(26, 26, 26, 0.10)",
          light: "rgba(26, 26, 26, 0.06)",
        },
      },
      fontFamily: {
        serif: ["EB Garamond", "Georgia", "serif"],
        sans: ["Figtree", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: {
        "cta": "12px",
        "card": "20px",
        "panel": "32px",
        "pill": "9999px",
      },
      boxShadow: {
        "subtle": "0 1px 3px rgba(26, 26, 15, 0.05)",
        "card": "0 4px 16px rgba(26, 26, 15, 0.06)",
        "lift": "0 8px 24px rgba(26, 26, 15, 0.08)",
        "popover": "0 12px 32px rgba(26, 26, 15, 0.12)",
      },
      animation: {
        "pulse-subtle": "pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float": "float 4s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
    },
  },
  plugins: [],
};
