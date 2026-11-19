// 십이시 시계 테(코덱스 생성, 마젠타 바탕) → 투명 webp, 구멍 중심·크기를 모두 같게 맞춤
// 쓰는 법: node tools/ring-normalize.mjs <입력 ring_*.png 폴더> <출력 폴더>
// 출력: 512×512, 구멍 반지름 = 128px(캔버스의 25%), 구멍 중심 = 캔버스 중심
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const [, , inDir, outDir] = process.argv;
const N = 1024,
  S = 512,
  R = S * 0.25;
const isKey = (r, g, b) => Math.hypot(255 - r, g, 255 - b) < 110;

for (const f of readdirSync(inDir).filter((x) => /^ring_\w+\.png$/.test(x))) {
  const src = execFileSync(
    "ffmpeg",
    [
      "-loglevel",
      "error",
      "-i",
      join(inDir, f),
      "-vf",
      `scale=${N}:${N}`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 1 << 26 },
  );
  const px = (x, y) => (y * N + x) * 3;
  // 가운데에서 마젠타를 채워 구멍 찾기
  const seen = new Uint8Array(N * N);
  const stack = [[N >> 1, N >> 1]];
  let minX = N,
    maxX = 0,
    minY = N,
    maxY = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= N || y >= N || seen[y * N + x]) continue;
    const i = px(x, y);
    if (!isKey(src[i], src[i + 1], src[i + 2])) continue;
    seen[y * N + x] = 1;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2,
    r = (maxX - minX + maxY - minY) / 4;
  const k = R / r;
  const out = Buffer.alloc(S * S * 4);
  let top = S;
  for (let v = 0; v < S; v++)
    for (let u = 0; u < S; u++) {
      const sx = Math.round(cx + (u - S / 2) / k),
        sy = Math.round(cy + (v - S / 2) / k);
      const o = (v * S + u) * 4;
      if (sx < 0 || sy < 0 || sx >= N || sy >= N) continue;
      const i = px(sx, sy);
      let [rr, gg, bb] = [src[i], src[i + 1], src[i + 2]];
      const d = Math.hypot(255 - rr, gg, 255 - bb);
      const a = Math.max(0, Math.min(1, (d - 90) / 90));
      if (a < 1) {
        const m = Math.min(rr, bb);
        if (m > gg) {
          rr -= (m - gg) * 0.7;
          bb -= (m - gg) * 0.7;
        }
      }
      out[o] = rr;
      out[o + 1] = gg;
      out[o + 2] = bb;
      out[o + 3] = Math.round(a * 255);
      if (a > 0.5 && v < top) top = v;
    }
  const name = f.replace(".png", ".webp");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${S}x${S}`,
      "-i",
      "-",
      "-c:v",
      "libwebp",
      "-pix_fmt",
      "yuva420p",
      "-q:v",
      "88",
      join(outDir, name),
    ],
    { input: out },
  );
  console.log(
    name,
    `구멍 r=${r.toFixed(0)} 중심=(${cx.toFixed(0)},${cy.toFixed(0)})`,
    `맨 위 픽셀 y=${top}`,
    top <= 1 ? "⚠ 위가 잘림" : "",
  );
}
