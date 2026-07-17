/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        up: "#46be86",
        down: "#e5605c",
        accent: "#e3b24a",
        crit: "#e5605c",
        warn: "#e0a93e",
        ok: "#46be86",
        info: "#5d9bd6",
      },
      fontFamily: {
        serif: ['Georgia', '"Times New Roman"', "ui-serif", "serif"],
        mono: ["ui-monospace", '"SF Mono"', "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
