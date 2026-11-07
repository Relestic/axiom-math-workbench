// Bundled as app/server.cjs for the Windows portable distribution.
import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, join, extname, sep } from "node:path";
import { spawn } from "node:child_process";
import { createAIMiddleware } from "./ai";

const root = resolve(__dirname, "..");
const webRoot = join(root, "web");
const envPath = join(root, ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);
const port = Number(process.env.AXIOM_PORT || "5174");
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error("AXIOM_PORT must be an integer between 1024 and 65535.");
  process.exit(1);
}
const middleware = createAIMiddleware({
  baseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
  model: process.env.AI_MODEL || "",
  apiKey: process.env.AI_API_KEY || "",
  jsonMode: process.env.AI_JSON_MODE !== "false",
});
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const server = createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (
    !["127.0.0.1", "localhost"].some(
      (host) => req.headers.host === `${host}:${port}`,
    )
  ) {
    res.writeHead(403);
    res.end("Local access only");
    return;
  }
  void middleware(req, res, () => {
    void (async () => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end("Method not allowed");
        return;
      }
      let pathname: string;
      try {
        pathname = decodeURIComponent((req.url || "/").split("?")[0]);
      } catch {
        res.writeHead(400);
        res.end("Invalid URL");
        return;
      }
      if (
        !pathname.startsWith("/") ||
        pathname.includes("\\") ||
        pathname.includes("\0")
      ) {
        res.writeHead(400);
        res.end("Invalid path");
        return;
      }
      const file = resolve(
        webRoot,
        `.${pathname === "/" ? "/index.html" : pathname}`,
      );
      if (!file.startsWith(webRoot + sep)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      try {
        if (!(await stat(file)).isFile()) throw new Error("Not a file");
      } catch {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.setHeader(
        "Content-Type",
        mime[extname(file)] || "application/octet-stream",
      );
      res.setHeader("Cache-Control", "no-cache");
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      const stream = createReadStream(file);
      stream.on("error", () => res.destroy());
      stream.pipe(res);
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end("Request failed");
    });
  }).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end("Request failed");
  });
});
server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${port} is already in use. Close the other Axiom window, or set AXIOM_PORT in .env.`
      : `Unable to start Axiom: ${error.code || "unknown error"}`,
  );
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(
    `Axiom is ready: ${url}\nKeep this window open. Press Ctrl+C to stop.`,
  );
  if (process.platform === "win32" && process.env.AXIOM_NO_OPEN !== "1") {
    const browser = spawn("explorer.exe", [url], {
      windowsHide: true,
      stdio: "ignore",
    });
    browser.on("error", () => console.log(`Open ${url} in your browser.`));
    browser.unref();
  }
});
process.on("SIGINT", () => {
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
