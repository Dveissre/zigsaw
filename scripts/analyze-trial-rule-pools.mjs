import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve(root, "public/data");
const outputDir = resolve(root, "docs/reports/trial-rule-pools");

const readJson = (name) =>
  JSON.parse(readFileSync(resolve(dataDir, name), "utf8"));

const symData = readJson("char_sym.json");
const levelData = readJson("tongyong_hanzi.json");
const assetData = readJson("component-assets.json");
const atlasData = readJson("component-atlas.json");
const answerCompatibility = readJson(
  "char_sym_answer_compat.json",
);

const componentNames = new Map(
  Object.entries(symData.symbols).map(([id, name]) => [
    Number(id),
    name,
  ]),
);
const assetIds = new Set(
  Object.keys(assetData.symbols ?? {}).map(Number),
);
const unsupportedIds = new Set(
  [...componentNames]
    .filter(([id, name]) => {
      if (name === "?" || name === "？") {
        return true;
      }
      return [...name].length > 1 && !assetIds.has(id);
    })
    .map(([id]) => id),
);
const levels = new Map();
for (const [level, names] of [
  [1, levelData.levels.一级],
  [2, levelData.levels.二级],
]) {
  for (const char of names ?? []) {
    levels.set(char, level);
  }
}

const eligibleWays = [];
const characterWays = new Map();
const allRenderableWays = [];
for (const [char, ways] of Object.entries(symData.chars)) {
  const level = levels.get(char);
  const charRenderable = !ways.some((way) =>
    way.some((symbolId) => unsupportedIds.has(symbolId)),
  );
  for (const way of ways) {
    if (
      way.length >= 2 &&
      way.length <= 10 &&
      !way.some((symbolId) => unsupportedIds.has(symbolId))
    ) {
      allRenderableWays.push({
        char,
        level: level ?? null,
        way,
      });
    }
  }
  if (
    (level !== 1 && level !== 2) ||
    !charRenderable
  ) {
    continue;
  }
  characterWays.set(char, ways);
  for (const way of ways) {
    if (way.length >= 2 && way.length <= 10) {
      eligibleWays.push({
        char,
        level,
        way,
        bag: [...way].sort((left, right) => left - right),
      });
    }
  }
}

const csvEscape = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
};
const writeCsv = (name, headers, rows) => {
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) =>
      headers.map((header) => csvEscape(row[header])).join(","),
    ),
  ];
  writeFileSync(
    resolve(outputDir, name),
    `\uFEFF${lines.join("\r\n")}\r\n`,
    "utf8",
  );
};
const formatLevel = (level) =>
  level === 1
    ? "一级"
    : level === 2
      ? "二级"
      : level === 3
        ? "三级"
        : "表外";
const formatUnicode = (char) =>
  `U+${(char.codePointAt(0) ?? 0)
    .toString(16)
    .toUpperCase()
    .padStart(4, "0")}`;
const componentLabel = (symbolId) =>
  `${symbolId}:${componentNames.get(symbolId) ?? "?"}`;

mkdirSync(outputDir, { recursive: true });

// Inspissation: unique one/two-level characters and decomposition ways by length.
const inspissationRows = [];
for (let length = 2; length <= 8; length += 1) {
  const ways = eligibleWays.filter((item) => item.way.length === length);
  const chars = new Set(ways.map((item) => item.char));
  const levelOne = new Set(
    ways.filter((item) => item.level === 1).map((item) => item.char),
  );
  const levelTwo = new Set(
    ways.filter((item) => item.level === 2).map((item) => item.char),
  );
  inspissationRows.push({
    部件数: length,
    可出题汉字数: chars.size,
    一级字数: levelOne.size,
    二级字数: levelTwo.size,
    拆法数: ways.length,
  });
}
writeCsv(
  "inspissation-part-counts.csv",
  ["部件数", "可出题汉字数", "一级字数", "二级字数", "拆法数"],
  inspissationRows,
);

// Gestalt: expand each answer downward through the answer-compatibility layer
// before testing whether a pair is covered. Multiple decompositions of the
// same answer still contribute only one answer to a pair.
const answerExpansions = new Map(
  Object.entries(answerCompatibility.expansions ?? {}).map(
    ([symbolId, alternatives]) => [
      Number(symbolId),
      alternatives.map((parts) => [...parts]),
    ],
  ),
);
const expansionCache = new Map();
const expandBag = (way) => {
  const initial = [...way].sort((left, right) => left - right);
  const initialKey = initial.join(",");
  const cached = expansionCache.get(initialKey);
  if (cached) {
    return cached;
  }
  const expanded = new Set([initialKey]);
  const pending = [initial];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const symbolId of new Set(current)) {
      for (const alternative of answerExpansions.get(symbolId) ?? []) {
        const next = [...current];
        next.splice(next.indexOf(symbolId), 1, ...alternative);
        next.sort((left, right) => left - right);
        const key = next.join(",");
        if (expanded.has(key)) {
          continue;
        }
        expanded.add(key);
        pending.push(next);
      }
    }
  }
  const result = [...expanded].map((key) =>
    key.split(",").map(Number),
  );
  expansionCache.set(initialKey, result);
  return result;
};

const pairAnswers = new Map();
for (const item of eligibleWays) {
  for (const parts of expandBag(item.way)) {
    for (let left = 0; left < parts.length; left += 1) {
      for (
        let right = left;
        right < parts.length;
        right += 1
      ) {
        const key = `${parts[left]}|${parts[right]}`;
        const answers = pairAnswers.get(key) ?? new Map();
        answers.set(item.char, item.level);
        pairAnswers.set(key, answers);
      }
    }
  }
}
const gestaltRows = [];
for (const [key, answers] of pairAnswers) {
  if (answers.size > 3) {
    continue;
  }
  const [leftId, rightId] = key.split("|").map(Number);
  gestaltRows.push({
    部件1id: leftId,
    部件1: componentNames.get(leftId) ?? "?",
    部件2id: rightId,
    部件2: componentNames.get(rightId) ?? "?",
    答案数: answers.size,
    可行答案: [...answers]
      .sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
      .map(
        ([char, level]) =>
          `${char}(${formatLevel(level)},${formatUnicode(char)})`,
      )
      .join("；"),
  });
}
gestaltRows.sort(
  (left, right) =>
    left.答案数 - right.答案数 ||
    left.部件1id - right.部件1id ||
    left.部件2id - right.部件2id,
);
writeCsv(
  "gestalt-component-pairs.csv",
  ["部件1id", "部件1", "部件2id", "部件2", "答案数", "可行答案"],
  gestaltRows,
);
const compatibilityExample = [
  ...(pairAnswers.get("1|171") ?? new Map()).entries(),
]
  .sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
  .map(([char, level]) => `${char}(${formatLevel(level)})`);

// Outland: find characters made from one base component plus a non-empty
// combination of components from each environmental distractor class.
const categoryNames = new Map([
  ["water", "绝九瀛"],
  ["herb", "开榛薮"],
  ["mount", "越嵩峦"],
  ["people", "脱尘网"],
  ["speech", "断声讯"],
]);
const categoryMembers = new Map([
  ["water", ["水", "氵", "冫", "雨"]],
  ["herb", ["艹", "屮", "木", "禾"]],
  ["mount", ["土", "石", "山"]],
  ["people", ["人", "亻", "彳"]],
  ["speech", ["口", "讠", "耳"]],
]);
const symbolIdsByName = new Map();
for (const [id, name] of componentNames) {
  const ids = symbolIdsByName.get(name) ?? [];
  ids.push(id);
  symbolIdsByName.set(name, ids);
}
const outlandRows = [];
const eligibleBaseIds = new Set(
  eligibleWays.flatMap((item) => item.way),
);
for (const [category, memberNames] of categoryMembers) {
  const memberIds = new Set(
    memberNames.flatMap((name) => symbolIdsByName.get(name) ?? []),
  );
  for (const item of allRenderableWays) {
    const uniqueBases = new Set(item.way);
    for (const baseId of uniqueBases) {
      if (
        !eligibleBaseIds.has(baseId)
      ) {
        continue;
      }
      const remaining = [...item.way];
      remaining.splice(remaining.indexOf(baseId), 1);
      if (
        remaining.length === 0 ||
        remaining.some((symbolId) => !memberIds.has(symbolId))
      ) {
        continue;
      }
      const added = [...remaining].sort(
        (left, right) => left - right,
      );
      outlandRows.push({
        类别: category,
        类别名: categoryNames.get(category),
        基础部件id: baseId,
        基础部件: componentNames.get(baseId) ?? "?",
        附着部件ids: added.join(" "),
        附着部件: added.map(componentLabel).join(" "),
        结果字: item.char,
        等级: formatLevel(item.level),
        Unicode: formatUnicode(item.char),
      });
    }
  }
}
const deduplicatedOutland = [
  ...new Map(
    outlandRows.map((row) => [
      [
        row.类别,
        row.基础部件id,
        row.附着部件ids,
        row.结果字,
      ].join("|"),
      row,
    ]),
  ).values(),
].sort(
  (left, right) =>
    left.类别.localeCompare(right.类别) ||
    left.基础部件id - right.基础部件id ||
    left.附着部件ids.localeCompare(
      right.附着部件ids,
      "en",
      { numeric: true },
    ) ||
    left.结果字.localeCompare(right.结果字, "zh-CN"),
);
writeCsv(
  "outland-composites.csv",
  [
    "类别",
    "类别名",
    "基础部件id",
    "基础部件",
    "附着部件ids",
    "附着部件",
    "结果字",
    "等级",
    "Unicode",
  ],
  deduplicatedOutland,
);

const summary = {
  format: "zigsaw-trial-rule-pool-analysis/1",
  sources: [
    "public/data/char_sym.json",
    "public/data/char_sym_answer_compat.json",
    "public/data/tongyong_hanzi.json",
    "public/data/component-assets.json",
    "public/data/component-atlas.json",
  ],
  scope: {
    levels: ["一级", "二级"],
    includeSupplementaryCharacters: true,
    selectableCharacterRule:
      "任一拆法包含不可渲染部件时排除整字",
  },
  sourceHash: createHash("sha256")
    .update(readFileSync(resolve(dataDir, "char_sym.json")))
    .digest("hex"),
  answerCompatibilityHash: createHash("sha256")
    .update(
      readFileSync(
        resolve(dataDir, "char_sym_answer_compat.json"),
      ),
    )
    .digest("hex"),
  eligible: {
    characters: characterWays.size,
    decompositionWays: eligibleWays.length,
  },
  inspissation: inspissationRows,
  gestalt: {
    totalPairsObserved: pairAnswers.size,
    pairsWithAtMostThreeAnswers: gestaltRows.length,
    byAnswerCount: Object.fromEntries(
      [1, 2, 3].map((count) => [
        count,
        gestaltRows.filter((row) => row.答案数 === count).length,
      ]),
    ),
    compatibilityExample: {
      components: "一 + 斤",
      answerCount: compatibilityExample.length,
      answers: compatibilityExample,
    },
  },
  outland: Object.fromEntries(
    [...categoryNames].map(([category, name]) => {
      const rows = deduplicatedOutland.filter(
        (row) => row.类别 === category,
      );
      return [
        category,
        {
          name,
          members: categoryMembers.get(category),
          baseComponents: new Set(
            rows.map((row) => row.基础部件id),
          ).size,
          resultCharacters: new Set(
            rows.map((row) => row.结果字),
          ).size,
          compositionVariants: rows.length,
        },
      ];
    }),
  ),
  atlas: {
    nRarityComponents: atlasData.components.filter(
      (component) => component.rarity === "N",
    ).length,
  },
};
writeFileSync(
  resolve(outputDir, "summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify(summary, null, 2));
