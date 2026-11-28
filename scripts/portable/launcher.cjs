const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { pipeline } = require("node:stream");
const { spawn } = require("node:child_process");

const root = path.join(path.dirname(process.execPath), "game");
const url = "http://127.0.0.1:45326";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".woff2": "font/woff2",
};
function openGame() {
  console.log(`Dynosty · 재의 왕조\n${url}\n게임을 마치면 이 창을 닫으세요.`);
  if (!process.argv.includes("--no-browser")) {
    spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
      windowsHide: true,
      detached: true,
      stdio: "ignore",
    }).unref();
  }
}
const server = http.createServer(async (req, res) => {
  const finish = (code) => {
    res.writeHead(code);
    res.end();
  };
  if (!["GET", "HEAD"].includes(req.method)) return finish(405);
  if (req.headers.host !== "127.0.0.1:45326") return finish(403);
  try {
    const pathname = decodeURIComponent(new URL(req.url, url).pathname);
    if (pathname === "/.dynosty-portable") return res.end("Dynosty portable 1");
    const entry =
      pathname === "/"
        ? "/index.html"
        : pathname === "/api/game/initial"
          ? "/initial.json"
          : pathname;
    if (/[\\:\0]/.test(entry)) return finish(400);
    const file = path.resolve(root, `.${entry}`);
    if (!file.startsWith(root + path.sep)) return finish(403);
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) return finish(404);
    let start = 0,
      end = stat.size - 1;
    const headers = {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Accept-Ranges": "bytes",
    };
    if (req.headers.range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (m && (m[1] || m[2])) {
        start = m[1] ? Number(m[1]) : Math.max(0, stat.size - Number(m[2]));
        end = m[1] && m[2] ? Math.min(end, Number(m[2])) : end;
      } else {
        start = stat.size;
      }
      if (start > end) {
        res.setHeader("Content-Range", `bytes */${stat.size}`);
        return finish(416);
      }
      headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers["Content-Length"] = end - start + 1;
    res.writeHead(req.headers.range ? 206 : 200, headers);
    if (req.method === "HEAD" || !stat.size) return res.end();
    pipeline(fs.createReadStream(file, { start, end }), res, () => {});
  } catch {
    if (!res.headersSent) finish(404);
    else res.destroy();
  }
});
server.on("error", async (error) => {
  if (error.code === "EADDRINUSE") {
    try {
      const response = await fetch(`${url}/.dynosty-portable`);
      if ((await response.text()) === "Dynosty portable 1") return openGame();
    } catch {}
  }
  console.error("게임을 실행할 수 없습니다.", error.message);
  process.exitCode = 1;
});
server.listen(45326, "127.0.0.1", openGame);
