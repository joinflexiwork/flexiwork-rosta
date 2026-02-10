import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Clean white base
        background: "#FFFFFF",
        foreground: "#1F2937",

        // Accent colors (minimal use)
        primary: {
          DEFAULT: "#3B82F6",
          dark: "#2563EB",
          light: "#60A5FA",
        },
        secondary: {
          DEFAULT: "#8B5CF6",
          dark: "#7C3AED",
          light: "#A855F7",
        },

        // Gray scale
        muted: {
          DEFAULT: "#F9FAFB",
          foreground: "#6B7280",
        },
        border: "#E5E7EB",

        // Status (minimal use)
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
      },
      backgroundImage: {
        "gradient-primary":
          "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
