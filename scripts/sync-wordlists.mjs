import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(root, "data-source/wordlists");
const targetDir = resolve(root, "public/data");
const files = [
  "hanzi_pinyin12.json",
  "tongyong12_trad.json",
];

mkdirSync(targetDir, { recursive: true });
for (const name of files) {
  const source = resolve(sourceDir, name);
  const target = resolve(targetDir, name);
  const content = readFileSync(source);
  JSON.parse(content.toString("utf8"));
  copyFileSync(source, target);
  const hash = createHash("sha256")
    .update(content)
    .digest("hex");
  console.log(`${name}: ${content.length} bytes sha256=${hash}`);
}
