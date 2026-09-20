import { context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
const ctx = await context({
  entryPoints: {
    background: "src/background/index.ts",
    content: "src/content/index.ts",
    search: "src/content/search.ts",
    searchIntercept: "src/content/searchIntercept.ts",
    popup: "src/popup/index.tsx",
  },
  outdir: "dist",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  jsx: "automatic",
  sourcemap: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
await ctx.rebuild();
if (process.argv.includes("--watch")) {
  await ctx.watch();
  console.log("Watching source. Reload the extension after edits. Restart after public/ edits.");
} else {
  await ctx.dispose();
}
