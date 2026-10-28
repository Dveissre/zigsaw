import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const sourceDirectory = resolve(
  process.argv[2] ??
    process.env.SCHOOL_DATA_DIRECTORY ??
    "C:/Projects/Python/wordlist",
);
const outputPath = resolve(projectRoot, "public/data/char-school.json");

const readSource = (filename) =>
  JSON.parse(readFileSync(resolve(sourceDirectory, filename), "utf8"));
const shizi = readSource("shizi_biao.json");
const xiezi = readSource("xiezi_biao.json");

const shortVolume = (volume) => volume.replace("年级", "");
const entries = {};

for (const [kind, table] of [
  ["read", shizi.index],
  ["write", xiezi.index],
]) {
  for (const [char, metadata] of Object.entries(table)) {
    const school = (entries[char] ??= {});
    school[kind] = [
      ...new Set((metadata.volumes ?? []).map(shortVolume)),
    ];
  }
}

mkdirSync(resolve(outputPath, ".."), { recursive: true });
const content = `${JSON.stringify(entries)}\n`;
writeFileSync(outputPath, content);

console.log(
  `char-school: ${Object.keys(entries).length} entries, ${Buffer.byteLength(content)} bytes`,
);
