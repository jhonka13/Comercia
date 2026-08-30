import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Todo el código fuente ya existente importa con "@/..." (ej.
      // "@/shared/lib/supabaseClient") — este alias es obligatorio para
      // que esos imports resuelvan.
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
});
