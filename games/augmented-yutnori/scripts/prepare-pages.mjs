import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const dist = resolve(process.cwd(), "dist");
await mkdir(dist, { recursive: true });
await writeFile(resolve(dist, ".nojekyll"), "", "utf8");
console.log(`GitHub Pages static output prepared: ${dist}`);
