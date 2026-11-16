import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const dist = resolve(process.cwd(), "dist");
const prefix = "/augmented-yutnori/";
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

const server = createServer(async (request, response) => {
  try {
    if (!request.url.startsWith(prefix)) { response.writeHead(404).end(); return; }
    const relative = decodeURIComponent(request.url.slice(prefix.length).split("?")[0]) || "index.html";
    const file = resolve(dist, relative);
    if (!file.startsWith(dist)) { response.writeHead(403).end(); return; }
    const data = await readFile(file);
    response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
    response.end(data);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const { port } = server.address();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
const failedResponses = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });

try {
  await page.goto(`http://127.0.0.1:${port}${prefix}`);
  await page.getByRole("heading", { name: "증강 윷놀이" }).waitFor();
  await page.getByRole("button", { name: "증강 도감" }).click();
  const cards = await page.locator("[data-codex-item]").count();
  if (cards !== 87 || errors.length || failedResponses.length) throw new Error(`cards=${cards}; pageErrors=${errors.join(" | ")}; responses=${failedResponses.join(" | ")}`);
  console.log(`GitHub Pages subpath runtime verified: ${cards} augments, 0 page errors, 0 failed assets`);
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
