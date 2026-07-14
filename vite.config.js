import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Netlify publica a pasta dist; as Functions ficam em netlify/functions.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: false },
  build: { outDir: "dist", sourcemap: false },
});
