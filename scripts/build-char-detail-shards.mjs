import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const sourcePath = resolve(
  process.argv[2] ??
    process.env.CHAR_DETAIL_SOURCE ??
    "C:/Projects/Python/wordlist/char_detail.json",
);
const outputDirectory = resolve(projectRoot, "public/data/char-detail");
const bucketCount = 256;

const source = readFileSync(sourcePath, "utf8");
const entries = JSON.parse(source);

if (!Array.isArray(entries)) {
  throw new Error("char_detail.json: expected a top-level array");
}

const buckets = Array.from({ length: bucketCount }, () => []);
for (const entry of entries) {
  if (
    typeof entry !== "object" ||
    entry === null ||
    typeof entry.char !== "string" ||
    !Array.isArray(entry.pronunciations)
  ) {
    continue;
  }
  const codePoint = entry.char.codePointAt(0);
  if (codePoint === undefined) {
    continue;
  }
  buckets[codePoint & (bucketCount - 1)].push(entry);
}

mkdirSync(outputDirectory, { recursive: true });
const sizes = [];
for (let index = 0; index < bucketCount; index += 1) {
  const content = `${JSON.stringify(buckets[index])}\n`;
  const filename = `${index.toString(16).padStart(2, "0")}.json`;
  writeFileSync(resolve(outputDirectory, filename), content);
  sizes.push(Buffer.byteLength(content));
}

sizes.sort((left, right) => left - right);
const percentile = (ratio) =>
  sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * ratio))];
const sourceHash = createHash("sha256").update(source).digest("hex");

console.log(
  [
    `char-detail shards: ${entries.length} entries / ${bucketCount} files`,
    `source-sha256=${sourceHash}`,
    `raw-bytes min=${sizes[0]} median=${percentile(0.5)} p95=${percentile(0.95)} max=${sizes.at(-1)}`,
  ].join("\n"),
);
