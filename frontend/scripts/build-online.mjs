import { build } from "vite";

process.env.VITE_API_BASE = "__SAME_ORIGIN__";
await build({
  build: {
    outDir: "dist-online",
    emptyOutDir: true,
  },
});
console.log("online bundle written to dist-online");
