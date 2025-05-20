/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#EEF2FF",
          100: "#E0E7FF",
          200: "#C7D2FE",
          300: "#A5B4FC",
          400: "#818CF8",
          500: "#6366F1",
          600: "#4F46E5",
          700: "#4338CA",
          800: "#3730A3",
          900: "#312E81",
          950: "#1E1B4B",
        },
      },
      boxShadow: {
        "inner-lg": "inset 0 2px 6px 2px rgb(0 0 0 / 0.05)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      const newUtilities = {
        ".scrollbar-thin": {
          scrollbarWidth: "thin",
          "&::-webkit-scrollbar": {
            width: "6px",
            height: "6px",
          },
        },
        ".scrollbar-thumb-gray-300": {
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "#D1D5DB",
            borderRadius: "9999px",
          },
        },
        ".scrollbar-thumb-gray-300:hover": {
          "&::-webkit-scrollbar-thumb:hover": {
            backgroundColor: "#9CA3AF",
          },
        },
        ".scrollbar-track-gray-100": {
          "&::-webkit-scrollbar-track": {
            backgroundColor: "#F3F4F6",
            borderRadius: "9999px",
          },
        },
      };
      addUtilities(newUtilities, ["responsive", "hover"]);
    },
  ],
};
