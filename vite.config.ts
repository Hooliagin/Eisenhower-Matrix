import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // three.js (the 3D island) is one lazy chunk of ~145 kB gzip – expected, so no warning for it.
  build: { chunkSizeWarningLimit: 700 },
});
