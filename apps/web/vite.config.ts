import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

// React 19 development builds log every component render to the browser Performance
// panel and first diff the old and new props (three levels deep). With the whole
// village state passed as props that diff runs on every worker snapshot and drops the
// 1,000-resident capital to about 1 fps on the dev server (and in the browser tests,
// which use the dev server). React only does this when `console.timeStamp` exists, so
// the dev server hides it before React loads. Production builds never log these tracks.
// Set DYNOSTY_REACT_PERF_TRACKS=1 to keep them for a profiling session.
const skipReactPerformanceTracks: Plugin = {
  name: "dynosty-skip-react-performance-tracks",
  apply: () => process.env.DYNOSTY_REACT_PERF_TRACKS !== "1",
  transformIndexHtml: () => [
    {
      tag: "script",
      children: "console.timeStamp = undefined;",
      injectTo: "head-prepend",
    },
  ],
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../..", "API_");
  const apiTarget = `http://127.0.0.1:${env.API_PORT ?? 3101}`;
  const proxy = { "/api": { target: apiTarget } };
  return {
    plugins: [
      react(),
      ...(mode === "production" ? [] : [skipReactPerformanceTracks]),
    ],
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
