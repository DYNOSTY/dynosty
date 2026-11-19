import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../..", "API_");
  const apiTarget = `http://127.0.0.1:${env.API_PORT ?? 3101}`;
  const proxy = { "/api": { target: apiTarget } };
  return {
    plugins: [react()],
    // 지연 로딩하는 선택 모듈을 첫 클릭 전에 최적화해 개발 중 재로드를 피한다.
    optimizeDeps: {
      include: [
        "@babylonjs/core/Culling/ray",
        "@babylonjs/core/Rendering/outlineRenderer",
        "@babylonjs/core/Meshes/Builders/sphereBuilder",
        "@babylonjs/core/Meshes/Builders/cylinderBuilder",
        "@babylonjs/core/Buffers/buffer",
        "@babylonjs/core/Meshes/mesh.vertexData",
      ],
    },
    server: { port: 5173, strictPort: true, proxy },
    preview: { proxy },
    build: { target: "es2023" },
  };
});
