/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
  ],
  corePlugins: {
    // Disable Tailwind's CSS reset so it doesn't override our CSS variable styles
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
};
