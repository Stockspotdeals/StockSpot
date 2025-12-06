/**
 * Tailwind CSS Configuration for StockSpot
 * 
 * This configuration file sets up TailwindCSS for the
 * StockSpot dashboard and templates.
 * 
 * To use this configuration:
 * 1. Install TailwindCSS: npm install -D tailwindcss
 * 2. Build CSS: npx tailwindcss -i ./static/style.css -o ./static/output.css --watch
 * 3. Include output.css in your HTML templates
 */

module.exports = {
  // Content sources for TailwindCSS to scan for class names
  content: [
    './templates/**/*.html'
  ],
  
  // Theme configuration - using default theme with no extensions
  theme: {
    extend: {},
  },
  
  // Plugins - none required for this setup
  plugins: [],
};