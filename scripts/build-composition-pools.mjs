import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve(root, "public/data");
const wordPath = resolve(root, "docs/words_2to4.txt");
const outputPath = resolve(dataDir, "composition-words.json");

const readJson = (name) =>
  JSON.parse(readFileSync(resolve(dataDir, name), "utf8"));
const symData = readJson("char_sym.json");
const levelData = readJson("tongyong_hanzi.json");
const assetData = readJson("component-assets.json");
const answerCompatibility = readJson(
  "char_sym_answer_compat.json",
);

const sourceHash = createHash("sha256")
  .update(readFileSync(wordPath))
  .digest("hex");
const symbolHash = createHash("sha256")
  .update(readFileSync(resolve(dataDir, "char_sym.json")))
  .digest("hex");
const answerCompatibilityHash = createHash("sha256")
  .update(
    readFileSync(
      resolve(dataDir, "char_sym_answer_compat.json"),
    ),
  )
  .digest("hex");

const assetIds = new Set(
  Object.keys(assetData.symbols ?? {}).map(Number),
);
const unsupportedSymbolIds = new Set(
  Object.entries(symData.symbols)
    .filter(([id, name]) => {
      if (name === "?" || name === "？") {
        return true;
      }
      return [...name].length > 1 && !assetIds.has(Number(id));
    })
    .map(([id]) => Number(id)),
);
const levels = new Map();
for (const [level, key] of [
  [1, "一级"],
  [2, "二级"],
]) {
  for (const char of levelData.levels[key] ?? []) {
    levels.set(char, level);
  }
}

const words = [
  ...new Set(
    readFileSync(wordPath, "utf8")
      .split(/\r?\n/)
      .map((word) => word.trim())
      .filter(Boolean),
  ),
];
const charWays = (char) => {
  const rawWays = symData.chars[char] ?? [];
  if (
    rawWays.length === 0 ||
    rawWays.some((way) =>
      way.some((symbolId) =>
        unsupportedSymbolIds.has(symbolId),
      ),
    )
  ) {
    return [];
  }
  return rawWays
    .filter(
      (way) =>
        way.length >= 1 &&
        way.length <= 10 &&
        !way.some((symbolId) =>
          unsupportedSymbolIds.has(symbolId),
        ),
    )
    .map((way) => [...way]);
};

const cartesianWays = (waysByChar) =>
  waysByChar.reduce(
    (combinations, ways) =>
      combinations.flatMap((combination) =>
        ways.map((way) => [...combination, [...way]]),
      ),
    [[]],
  );

const wordsByLength = { 2: [], 3: [], 4: [] };
const assonanceWordsByLength = { 2: [], 3: [], 4: [] };
const normal = [];
const boss = [];
const assonanceNormal = [];
const assonanceBoss = [];
for (const word of words) {
  const chars = [...word];
  if (
    chars.length < 2 ||
    chars.length > 4 ||
    chars.some((char) => !levels.has(char))
  ) {
    continue;
  }
  const waysByChar = chars.map(charWays);
  if (waysByChar.some((ways) => ways.length === 0)) {
    continue;
  }
  wordsByLength[chars.length].push(word);
  const recipes = cartesianWays(waysByChar);
  const entry = { word };
  const hasRepeatedCharacter =
    new Set(chars).size !== chars.length;
  if (!hasRepeatedCharacter) {
    assonanceWordsByLength[chars.length].push(word);
    for (const recipe of recipes) {
      const counts = new Map();
      const charCounts = recipe.map((way) => {
        const current = new Map();
        for (const symbolId of way) {
          counts.set(
            symbolId,
            (counts.get(symbolId) ?? 0) + 1,
          );
          current.set(
            symbolId,
            (current.get(symbolId) ?? 0) + 1,
          );
        }
        return current;
      });
      const crossSymbols = [...counts.entries()]
        .filter(
          ([symbolId]) =>
            charCounts.filter(
              (current) =>
                (current.get(symbolId) ?? 0) > 0,
            ).length >= 2,
        )
        .map(([symbolId]) => symbolId);
      const displayedCardCount =
        crossSymbols.length +
        [...counts.entries()].reduce(
          (sum, [symbolId, count]) =>
            sum +
            (crossSymbols.includes(symbolId) ? 0 : count),
          0,
        );
      if (
        chars.length === 2 &&
        displayedCardCount >= 4 &&
        displayedCardCount <= 5 &&
        crossSymbols.length >= 1
      ) {
        assonanceNormal.push({
          ...entry,
          recipes: [recipe],
        });
      }
      if (
        chars.length > 2 &&
        displayedCardCount >= 6 &&
        displayedCardCount <= 10 &&
        crossSymbols.length >= 2
      ) {
        assonanceBoss.push({
          ...entry,
          recipes: [recipe],
        });
      }
    }
  }
  if (chars.length === 2) {
    const matching = recipes.filter(
      (recipe) =>
        recipe.reduce((sum, way) => sum + way.length, 0) === 4,
    );
    if (matching.length > 0) {
      normal.push({ ...entry, recipes: matching });
    }
  } else {
    const matching = recipes.filter((recipe) => {
      const cardCount = recipe.reduce(
        (sum, way) => sum + way.length,
        0,
      );
      return cardCount >= 6 && cardCount <= 8;
    });
    if (matching.length > 0) {
      boss.push({ ...entry, recipes: matching });
    }
  }
}

normal.sort((left, right) => left.word.localeCompare(right.word, "zh-CN"));
boss.sort((left, right) => left.word.localeCompare(right.word, "zh-CN"));
const applyPoolWeights = (entries) => {
  const frequency = new Map();
  for (const entry of entries) {
    for (const char of entry.word) {
      frequency.set(char, (frequency.get(char) ?? 0) + 1);
    }
  }
  return entries.map((entry) => {
    const chars = [...entry.word];
    const logMean =
      chars.reduce(
        (sum, char) =>
          sum + Math.log(frequency.get(char) ?? 1),
        0,
      ) / chars.length;
    return {
      ...entry,
      weight: Number(
        (1 / Math.exp(logMean)).toFixed(12),
      ),
    };
  });
};
const weightedNormal = applyPoolWeights(normal);
const weightedBoss = applyPoolWeights(boss);
const mergeRecipes = (entries) => {
  const merged = new Map();
  for (const entry of entries) {
    const existing = merged.get(entry.word);
    if (existing) {
      existing.recipes.push(...entry.recipes);
    } else {
      merged.set(entry.word, {
        word: entry.word,
        recipes: [...entry.recipes],
      });
    }
  }
  return [...merged.values()].sort((left, right) =>
    left.word.localeCompare(right.word, "zh-CN"),
  );
};
const weightedAssonanceNormal = applyPoolWeights(
  mergeRecipes(assonanceNormal),
);
const weightedAssonanceBoss = applyPoolWeights(
  mergeRecipes(assonanceBoss),
);
mkdirSync(dataDir, { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      format: "zigsaw-composition-words/1",
      sourceHash,
      symbolHash,
      answerCompatibilityHash,
      weighting:
        "per candidate pool: 1 / geometric mean of character occurrences within that generated pool",
      words: wordsByLength,
      normal: weightedNormal,
      boss: weightedBoss,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
writeFileSync(
  resolve(dataDir, "assonance-words.json"),
  `${JSON.stringify(
    {
      format: "zigsaw-assonance-words/1",
      sourceHash,
      symbolHash,
      answerCompatibilityHash,
      weighting:
        "per candidate pool: 1 / geometric mean of character occurrences within that generated pool",
      words: assonanceWordsByLength,
      normal: weightedAssonanceNormal,
      boss: weightedAssonanceBoss,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  `composition: ${normal.length} normal words, ${boss.length} boss words`,
);
console.log(
  `assonance: ${weightedAssonanceNormal.length} normal words, ${weightedAssonanceBoss.length} boss words`,
);
