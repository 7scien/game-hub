import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(projectRoot, "dist");
const outputPath = resolve(process.argv[2] || join(distDir, "augmented-yutnori.html"));

let html = await readFile(join(distDir, "index.html"), "utf8");
const cssHref = html.match(/<link rel="stylesheet"[^>]+href="([^"]+)"/u)?.[1];
const scriptSrc = html.match(/<script type="module"[^>]+src="([^"]+)"/u)?.[1];

if (!cssHref || !scriptSrc) throw new Error("Vite 빌드 자산을 찾지 못했습니다. 먼저 pnpm build를 실행하세요.");

const toAssetPath = (assetUrl) => join(distDir, assetUrl.replace(/^\//u, ""));
const css = await readFile(toAssetPath(cssHref), "utf8");
const js = (await readFile(toAssetPath(scriptSrc), "utf8")).replaceAll("</script", "<\\/script");

html = html
  .replace(/\s*<link rel="stylesheet"[^>]+>/u, () => `\n    <style>${css}</style>`)
  .replace(/<script type="module"[^>]+><\/script>/u, () => `<script type="module">${js}</script>`);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, html, "utf8");
console.log(`Portable HTML: ${outputPath}`);
