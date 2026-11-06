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
const sourceHash = createHash("sha256")
  .update(readFileSync(resolve(dataDir, "char_sym.json")))
  .digest("hex");
const answerCompatibilityHash = createHash("sha256")
  .update(
    readFileSync(
      resolve(dataDir, "char_sym_answer_compat.json"),
    ),
  )
  .digest("hex");

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

// Prefabrication: an ordinary question is usable when one pair of cards in
// its answer decomposition can directly form another renderable character.
const directPairTargets = new Map();
for (const item of allRenderableWays) {
  if (item.way.length !== 2) {
    continue;
  }
  const key = [...item.way]
    .sort((left, right) => left - right)
    .join(",");
  const targets = directPairTargets.get(key) ?? new Set();
  targets.add(item.char);
  directPairTargets.set(key, targets);
}
const prefabricationRows = [];
const prefabricationCharacters = new Set();
let prefabricationWayCount = 0;
const prefabricationPairs = new Set();
const prefabricationHints = new Set();
const symbolIdBagKey = (symbolIds) =>
  [...symbolIds].sort((left, right) => left - right).join(",");
const prefabricationSymbolIdsByName = new Map();
for (const ways of Object.values(symData.chars)) {
  for (const way of ways) {
    for (const symbolId of way) {
      const name = componentNames.get(symbolId);
      if (
        name &&
        !prefabricationSymbolIdsByName.has(name)
      ) {
        prefabricationSymbolIdsByName.set(name, symbolId);
      }
    }
  }
}
const prefabricationMatchesExistingWay = (
  char,
  way,
  left,
  right,
  glyph,
) => {
  const groupedSymbolId =
    prefabricationSymbolIdsByName.get(glyph);
  if (groupedSymbolId === undefined) {
    return false;
  }
  const displayedSymbolIds = [...way];
  displayedSymbolIds.splice(right, 1);
  displayedSymbolIds.splice(left, 1);
  displayedSymbolIds.push(groupedSymbolId);
  const target = symbolIdBagKey(displayedSymbolIds);
  return (symData.chars[char] ?? []).some(
    (candidate) =>
      symbolIdBagKey(candidate) === target,
  );
};
for (let length = 3; length <= 10; length += 1) {
  const chars = new Set();
  const levelOne = new Set();
  const levelTwo = new Set();
  const lengthPairs = new Set();
  const lengthHints = new Set();
  let wayCount = 0;
  for (const item of eligibleWays) {
    if (item.way.length !== length) {
      continue;
    }
    let usable = false;
    for (let left = 0; left < item.way.length; left += 1) {
      for (
        let right = left + 1;
        right < item.way.length;
        right += 1
      ) {
        const key = [item.way[left], item.way[right]]
          .sort((first, second) => first - second)
          .join(",");
        const targets = [
          ...(directPairTargets.get(key) ?? []),
        ].filter(
          (char) =>
            char !== item.char &&
            !prefabricationMatchesExistingWay(
              item.char,
              item.way,
              left,
              right,
              char,
            ),
        );
        if (targets.length === 0) {
          continue;
        }
        usable = true;
        lengthPairs.add(key);
        prefabricationPairs.add(key);
        for (const target of targets) {
          lengthHints.add(target);
          prefabricationHints.add(target);
        }
      }
    }
    if (!usable) {
      continue;
    }
    wayCount += 1;
    prefabricationWayCount += 1;
    chars.add(item.char);
    prefabricationCharacters.add(item.char);
    if (item.level === 1) {
      levelOne.add(item.char);
    } else {
      levelTwo.add(item.char);
    }
  }
  prefabricationRows.push({
    部件数: length,
    可出题汉字数: chars.size,
    一级字数: levelOne.size,
    二级字数: levelTwo.size,
    拆法数: wayCount,
    可用提示对数: lengthPairs.size,
    可用提示字数: lengthHints.size,
  });
}
writeCsv(
  "prefabrication-part-counts.csv",
  [
    "部件数",
    "可出题汉字数",
    "一级字数",
    "二级字数",
    "拆法数",
    "可用提示对数",
    "可用提示字数",
  ],
  prefabricationRows,
);

// Gestalt: both clue components must occur together in a direct answer
// decomposition. Compatibility may not introduce either clue by itself.
const excludedGestaltComponentNames = new Set([
  "一",
  "丨",
  "丿",
  "丶",
  "㇏",
  "乚",
  "亅",
  "㇆",
  "𠃊",
  "𰀁",
  "乛",
  "二",
  "十",
  "冂",
  "口",
]);
const directlyComposablePairs = new Set();
for (const item of eligibleWays) {
  if (item.way.length === 2) {
    const pair = [...item.way].sort(
      (first, second) => first - second,
    );
    directlyComposablePairs.add(`${pair[0]}|${pair[1]}`);
  }
}
const pairAnswers = new Map();
for (const item of eligibleWays) {
  for (let left = 0; left < item.way.length; left += 1) {
    for (
      let right = left + 1;
      right < item.way.length;
      right += 1
    ) {
      const leftName =
        componentNames.get(item.way[left]) ?? "?";
      const rightName =
        componentNames.get(item.way[right]) ?? "?";
      if (
        excludedGestaltComponentNames.has(leftName) ||
        excludedGestaltComponentNames.has(rightName)
      ) {
        continue;
      }
      const pair = [item.way[left], item.way[right]].sort(
        (first, second) => first - second,
      );
      const key = `${pair[0]}|${pair[1]}`;
      if (directlyComposablePairs.has(key)) {
        continue;
      }
      const answers = pairAnswers.get(key) ?? new Map();
      answers.set(item.char, item.level);
      pairAnswers.set(key, answers);
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
const gestaltDataPath = resolve(dataDir, "gestalt-pairs.json");
writeFileSync(
  gestaltDataPath,
  `${JSON.stringify(
    {
      format: "zigsaw-gestalt-pairs/1",
      sourceHash,
      answerCompatibilityHash,
      excludedComponents: [
        ...excludedGestaltComponentNames,
      ],
      pairs: gestaltRows.map((row) => {
        const key = `${row.部件1id}|${row.部件2id}`;
        return {
          components: [row.部件1id, row.部件2id],
          answers: [...(pairAnswers.get(key) ?? new Map())]
            .map(([char, level]) => ({ char, level }))
            .sort((left, right) =>
              left.char.localeCompare(right.char, "zh-CN"),
            ),
        };
      }),
    },
    null,
    2,
  )}\n`,
  "utf8",
);
const gestaltExampleEntry =
  [...pairAnswers.entries()].find(
    ([, answers]) => answers.size > 1,
  ) ?? [...pairAnswers.entries()][0];
const gestaltExample = gestaltExampleEntry
  ? [...gestaltExampleEntry[1].entries()]
  .sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
  .map(([char, level]) => `${char}(${formatLevel(level)})`)
  : [];

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
  sourceHash,
  answerCompatibilityHash,
  eligible: {
    characters: characterWays.size,
    decompositionWays: eligibleWays.length,
  },
  inspissation: inspissationRows,
  prefabrication: {
    eligibility:
      "答案至少三部件，同一拆法中至少一对卡能直接组成另一个可渲染汉字，且预组后的 symbol ID 组合不对应答案的任何既有拆法",
    characters: prefabricationCharacters.size,
    decompositionWays: prefabricationWayCount,
    usablePairs: prefabricationPairs.size,
    hintCharacters: prefabricationHints.size,
    byPartCount: prefabricationRows,
  },
  gestalt: {
    directPairSeeds: pairAnswers.size,
    pairPoolsWithAnswers: pairAnswers.size,
    excludedComponents: [
      ...excludedGestaltComponentNames,
    ],
    pairsWithAtMostThreeAnswers: gestaltRows.length,
    directlyComposablePairsExcluded: true,
    byAnswerCount: Object.fromEntries(
      [1, 2, 3].map((count) => [
        count,
        gestaltRows.filter((row) => row.答案数 === count).length,
      ]),
    ),
    example: {
      components: gestaltExampleEntry
        ? gestaltExampleEntry[0]
            .split("|")
            .map((id) => componentNames.get(Number(id)) ?? "?")
            .join(" + ")
        : "",
      answerCount: gestaltExample.length,
      answers: gestaltExample,
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
