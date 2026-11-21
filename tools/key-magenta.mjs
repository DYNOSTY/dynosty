// 코덱스 그림(마젠타 #FF00FF 바탕) → 투명 webp. 반투명 가장자리는 마젠타를 빼서 원래 색을 되살림(분홍 테 없음)
// 쓰는 법: node tools/key-magenta.mjs <입력.png> <출력.webp> [폭]
import { execFileSync } from "node:child_process";

const [, , input, output, width = "512"] = process.argv;
const probe = execFileSync("ffprobe", [
  "-v",
  "error",
  "-select_streams",
  "v:0",
  "-show_entries",
  "stream=width,height",
  "-of",
  "csv=p=0",
  input,
])
  .toString()
  .trim();
const [w0, h0] = probe.split(",").map(Number);
const W = Number(width),
  H = Math.round((h0 / w0) * W);
const src = execFileSync(
  "ffmpeg",
  [
    "-loglevel",
    "error",
    "-i",
    input,
    "-vf",
    `scale=${W}:${H}`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-",
  ],
  { maxBuffer: 1 << 27 },
);
const out = Buffer.alloc(W * H * 4);
for (let i = 0, o = 0; i < src.length; i += 3, o += 4) {
  const r = src[i],
    g = src[i + 1],
    b = src[i + 2];
  // 마젠타와 거리 → 불투명도. 초록이 클수록 그림(마젠타엔 초록이 없음)
  const d = Math.hypot(255 - r, g, 255 - b);
  const a = Math.max(0, Math.min(1, (d - 70) / 120));
  const un = (c, k) =>
    a > 0.02 ? Math.max(0, Math.min(255, (c - (1 - a) * k) / a)) : 0;
  let rr = un(r, 255);
  const gg = un(g, 0);
  let bb = un(b, 255);
  // 가는 잎 끝처럼 반투명한 곳에 남는 자홍 기운 빼기: 빨강·파랑이 둘 다 초록보다 크면 그만큼 깎음
  const m = Math.min(rr, bb);
  if (m > gg) {
    rr -= m - gg;
    bb -= m - gg;
  }
  out[o] = rr;
  out[o + 1] = gg;
  out[o + 2] = bb;
  out[o + 3] = Math.round(a * 255);
}
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
    `${W}x${H}`,
    "-i",
    "-",
    "-c:v",
    "libwebp",
    "-pix_fmt",
    "yuva420p",
    "-q:v",
    "88",
    output,
  ],
  { input: out },
);
console.log(output, `${W}x${H}`);
