/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        up: "#16a34a",
        down: "#dc2626",
      },
    },
  },
  plugins: [],
};
