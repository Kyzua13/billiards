import { build } from "vite";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

process.env.VITE_YANDEX = "true";

await build({
  build: {
    modulePreload: false,
    rollupOptions: {
      input: "yandex.html"
    }
  }
});

await rename("dist/yandex.html", "dist/index.html");

let html = await readFile("dist/index.html", "utf8");
const scriptMatch = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/);
const styleMatch = html.match(/<link[^>]+href="([^"]+)"[^>]*>/);

if (styleMatch) {
  const cssPath = join("dist", styleMatch[1].replace(/^\//, ""));
  const css = await readFile(cssPath, "utf8");
  html = html.replace(styleMatch[0], `<style>${css}</style>`);
}

if (scriptMatch) {
  const scriptPath = join("dist", scriptMatch[1].replace(/^\//, ""));
  const script = await readFile(scriptPath, "utf8");
  html = html.replace(scriptMatch[0], `<script type="module">${script}</script>`);
}

await writeFile("dist/index.html", html);
await rm("dist/assets", { recursive: true, force: true });
