import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const readJson = (relativePath) =>
  JSON.parse(
    readFileSync(resolve(projectRoot, relativePath), "utf8"),
  );

const sym = readJson("public/data/char_sym.json");
const levelData = readJson("public/data/tongyong_hanzi.json");
const assetData = readJson("public/data/component-assets.json");
const characters = new Set([
  ...levelData.levels.一级,
  ...levelData.levels.二级,
  ...levelData.levels.三级,
]);

const usage = new Map();
let decompositionCount = 0;
for (const char of characters) {
  for (const way of sym.chars[char] ?? []) {
    decompositionCount += 1;
    for (const symbolId of way) {
      const key = String(symbolId);
      const entry = usage.get(key) ?? {
        symbolId,
        name: sym.symbols[key] ?? "?",
        count: 0,
        chars: new Set(),
      };
      entry.count += 1;
      entry.chars.add(char);
      usage.set(key, entry);
    }
  }
}

const symbols = [...usage.values()]
  .map((entry) => ({
    symbolId: entry.symbolId,
    name: entry.name,
    count: entry.count,
    charCount: entry.chars.size,
    ...(assetData.symbols[String(entry.symbolId)]
      ? {
          asset:
            assetData.symbols[String(entry.symbolId)].source,
        }
      : {}),
  }))
  .sort(
    (left, right) =>
      right.count - left.count ||
      left.symbolId - right.symbolId,
  );

const output = {
  format: "zigsaw-component-usage/1",
  source: "tongyong_hanzi.json + char_sym.json",
  characterCount: characters.size,
  decompositionCount,
  totalUsageCount: symbols.reduce(
    (total, symbol) => total + symbol.count,
    0,
  ),
  componentCount: symbols.length,
  symbols,
};

const outputPath = resolve(
  projectRoot,
  "public/data/component-usage.json",
);
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

const quoteCsv = (value) =>
  `"${String(value).replaceAll('"', '""')}"`;
const csv = [
  "symbolId,name,count,charCount,asset",
  ...symbols.map((symbol) =>
    [
      symbol.symbolId,
      symbol.name,
      symbol.count,
      symbol.charCount,
      symbol.asset ?? "",
    ]
      .map(quoteCsv)
      .join(","),
  ),
].join("\n");
writeFileSync(
  resolve(projectRoot, "docs/component-usage.csv"),
  `${csv}\n`,
);

console.log(
  `component usage: ${characters.size} chars, ${decompositionCount} ways, ` +
    `${symbols.length} components, ${output.totalUsageCount} usages`,
);
