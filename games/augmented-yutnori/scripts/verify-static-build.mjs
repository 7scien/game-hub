import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const dist = resolve(process.cwd(), "dist");
const html = await readFile(resolve(dist, "index.html"), "utf8");
await access(resolve(dist, ".nojekyll"));

const references = [...html.matchAll(/(?:src|href)="([^"]+)"/gu)].map((match) => match[1]);
const invalid = references.filter((reference) => reference.startsWith("/") || /^https?:/u.test(reference));
if (invalid.length) throw new Error(`정적 호스팅에서 안전하지 않은 자산 경로: ${invalid.join(", ")}`);
if (!references.some((reference) => reference.startsWith("./assets/"))) throw new Error("상대 assets 경로를 찾지 못했습니다.");

console.log(`Static build verified: ${references.length} relative asset references, no server dependency`);
