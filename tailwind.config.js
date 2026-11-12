/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { pixel: ["'Pixelify Sans'", "ui-monospace", "monospace"] },
      colors: {
        // "Nachtlager": Tailwind's slate, shifted towards a deep night blue. The text steps (400–600) are lighter than
        // the stock ones so the many small secondary labels stay readable on the dark surfaces.
        slate: {
          50: "#f5f7fb",
          100: "#e9edf5",
          200: "#d3dae8",
          300: "#b3bed3",
          400: "#909db8",
          500: "#6f7d99",
          600: "#515d78",
          700: "#2b3449",
          800: "#1b2233",
          900: "#111624",
          950: "#080b14",
        },
        night: "#080b14",
        gold: "#fbbf24",
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 10px 30px -18px rgba(0,0,0,0.9)",
        lift: "0 18px 50px -20px rgba(0,0,0,0.95)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
        pop: { "0%": { transform: "scale(0.85)", opacity: "0" }, "60%": { transform: "scale(1.04)", opacity: "1" }, "100%": { transform: "scale(1)" } },
        sheet: { from: { transform: "translateY(100%)" }, to: { transform: "none" } },
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
      },
      animation: {
        rise: "rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) backwards",
        fade: "fade 0.3s ease-out both",
        pop: "pop 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2) backwards",
        sheet: "sheet 0.32s cubic-bezier(0.2, 0.85, 0.25, 1) backwards",
        shimmer: "shimmer 2.4s linear infinite",
      },
    },
  },
  plugins: [],
};
