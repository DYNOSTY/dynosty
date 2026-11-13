import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../..", "API_");
  const apiTarget = `http://127.0.0.1:${env.API_PORT ?? 3101}`;
  const proxy = { "/api": { target: apiTarget } };
  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true, proxy },
    preview: { proxy },
    build: { target: "es2023" },
  };
});
