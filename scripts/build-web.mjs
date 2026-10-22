// Bundles the browser prototype (src/web/app.ts) into web/app.js.
// web/index.html loads it; publish both files together.
import { build } from "esbuild";

await build({
  entryPoints: ["src/web/app.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  loader: { ".png": "dataurl" },
  outfile: "web/app.js",
  logLevel: "info",
});
