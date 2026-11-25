import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { createAIMiddleware } from "./server/ai";
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const handler = createAIMiddleware({
    baseUrl: env.AI_BASE_URL || "https://api.openai.com/v1",
    model: env.AI_MODEL || "",
    apiKey: env.AI_API_KEY || "",
    jsonMode: env.AI_JSON_MODE !== "false",
  });
  return {
    plugins: [
      react(),
      {
        name: "katex-offline-woff2",
        enforce: "pre",
        transform(css, id) {
          if (!id.replaceAll("\\\\", "/").endsWith("/katex/dist/katex.css")) return;
          return css.replace(/(src:\s*url\([^)]*\.woff2\)\s*format\("woff2"\))[^;]*;/g, "$1;");
        },
      },
      {
        name: "axiom-ai",
        configureServer(server) {
          server.middlewares.use(handler);
        },
        configurePreviewServer(server) {
          server.middlewares.use(handler);
        },
      },
    ],
    server: {
      fs: { allow: [process.cwd(), resolve("../backend/app/modules/spoken_math.json")] },
      host: "127.0.0.1",
      port: 5174,
      strictPort: true,
      watch: { ignored: ["**/.tmp/**", "**/dist/**"] },
    },
    preview: { host: "127.0.0.1", port: 5175, strictPort: true },
  };
});
