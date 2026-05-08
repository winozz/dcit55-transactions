import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// When you have Node installed, run `npm install` then `npm run dev`.
// Vite will serve src/app.jsx etc. instead of relying on Babel-standalone.
export default defineConfig({
  root: ".",
  server: { port: 5173, open: true },
  build:  { outDir: "dist" },
  plugins: [react()],
});
