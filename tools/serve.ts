/**
 * 本地预览服务器（零依赖，只用 Deno 内置 API）
 * ---------------------------------------------------------------
 * 运行：deno task serve        默认 http://localhost:8000
 *      PORT=8080 deno task serve
 *
 * 用途：和 GitHub Pages 一样的 http 环境预览站点。
 *       直接双击 index.html（file://）也能用，但用服务器更接近线上。
 */

const PORT = Number(Deno.env.get("PORT") ?? 8000);
const ROOT = new URL("../", import.meta.url); // 项目根目录

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
};

/** 把 URL 路径转成安全的项目内相对路径，拦截路径穿越 */
function safePath(urlPath: string): string | null {
  let p: string;
  try {
    p = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (p.endsWith("/")) p += "index.html";
  const parts = p.split("/").filter((s) => s !== "" && s !== ".");
  if (parts.some((s) => s === "..")) return null;
  return parts.join("/");
}

Deno.serve({
  port: PORT,
  onListen: ({ port }) => {
    console.log(`\n  题库站点已启动\n`);
    console.log(`  导航页    http://localhost:${port}/`);
    console.log(`  查看器    http://localhost:${port}/viewer.html?p=<题库名>\n`);
    console.log(`  按 Ctrl+C 停止\n`);
  },
}, async (req) => {
  const rel = safePath(new URL(req.url).pathname);
  if (rel === null) {
    return new Response("403 Forbidden", { status: 403 });
  }

  // 目录自动补 index.html
  let path = rel;
  try {
    const stat = await Deno.stat(new URL(path, ROOT));
    if (stat.isDirectory) path = (path.endsWith("/") ? path : path + "/") + "index.html";
  } catch {
    // 交给下面 readFile 报 404
  }

  try {
    const data = await Deno.readFile(new URL(path, ROOT));
    const ext = path.split(".").pop()!.toLowerCase();
    return new Response(data, {
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "cache-control": "no-cache", // 改完文件刷新即可生效
      },
    });
  } catch {
    const body = `404 Not Found: /${rel}\n\n可用入口：\n  /\n  /viewer.html?p=<题库名>\n`;
    return new Response(body, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
});
