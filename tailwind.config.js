/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Marca Impresilk — indigo da especificacao do painel
        brand: {
          DEFAULT: "#3840E8",
          ink: "#1b1f6b",
          50: "#eef0fe",
          100: "#dfe1fd",
          200: "#c2c6fb",
          300: "#9ba1f6",
          400: "#7076f0",
          500: "#3840E8",
          600: "#2c33cf",
          700: "#2529a6",
          800: "#212585",
          900: "#1f236b",
        },
        ok: {
          DEFAULT: "#16a34a",
          50: "#effdf4",
          100: "#d9fbe6",
          600: "#16a34a",
          700: "#15803d",
        },
        warn: {
          DEFAULT: "#d97706",
          50: "#fffbeb",
          100: "#fef3c7",
          600: "#d97706",
          700: "#b45309",
        },
        bad: {
          DEFAULT: "#dc2626",
          50: "#fef2f2",
          100: "#fee2e2",
          600: "#dc2626",
          700: "#b91c1c",
        },
        // superficies conforme spec
        canvas: "#f4f4f7",
        hairline: "#e6e6ee",
      },
      fontFamily: {
        // Poppins nos titulos/numeros, Spectral no corpo
        display: ['"Poppins"', "system-ui", "sans-serif"],
        body: ['"Spectral"', "Georgia", "serif"],
        sans: ['"Poppins"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(24, 26, 84, 0.04), 0 6px 20px -8px rgba(24, 26, 84, 0.10)",
        "card-hover":
          "0 2px 4px rgba(24, 26, 84, 0.06), 0 16px 36px -12px rgba(24, 26, 84, 0.20)",
        soft: "0 10px 40px -12px rgba(24, 26, 84, 0.20)",
      },
      transitionTimingFunction: {
        apple: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s var(--ease-apple) both",
        "slide-up": "slide-up 0.5s var(--ease-apple) both",
      },
    },
  },
  plugins: [],
};
