import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const readJson = (relativePath) =>
  JSON.parse(
    readFileSync(resolve(projectRoot, relativePath), "utf8"),
  );

const sym = readJson("public/data/char_sym.json");
const levelData = readJson("public/data/tongyong_hanzi.json");
const levelKeys = ["一级", "二级", "三级"];
const levelNames = ["一级", "二级", "三级"];
const levels = [1, 2, 3];
const levelChars = levelKeys.map(
  (key) => levelData.levels[key] ?? [],
);
const levelByChar = new Map();
const rankByChar = new Map();
let rank = 0;
for (const [index, chars] of levelChars.entries()) {
  for (const char of chars) {
    if (!levelByChar.has(char)) {
      rank += 1;
      rankByChar.set(char, rank);
    }
    levelByChar.set(char, levels[index]);
  }
}
const commonChars = [...levelByChar.keys()];

const sortChars = (chars) =>
  [...chars].sort(
    (left, right) =>
      (levelByChar.get(left) ?? Infinity) -
        (levelByChar.get(right) ?? Infinity) ||
      (rankByChar.get(left) ?? Infinity) -
        (rankByChar.get(right) ?? Infinity) ||
      (left.codePointAt(0) ?? 0) -
        (right.codePointAt(0) ?? 0),
  );

const levelLines = (chars) =>
  levels
    .map((level) => {
      const members = sortChars(
        [...chars].filter(
          (char) => levelByChar.get(char) === level,
        ),
      );
      return members.length
        ? `- ${levelNames[level - 1]}（${members.length}）：${members.join("、")}`
        : "";
    })
    .filter(Boolean)
    .join("\n");

const bagGroups = new Map();
const repeatedComponents = new Map();
for (const char of commonChars) {
  for (const way of sym.chars[char] ?? []) {
    const sortedWay = [...way].sort((left, right) => left - right);
    const key = sortedWay.join(",");
    const group = bagGroups.get(key) ?? {
      symbolIds: sortedWay,
      chars: new Set(),
    };
    group.chars.add(char);
    bagGroups.set(key, group);

    const counts = new Map();
    for (const symbolId of sortedWay) {
      counts.set(symbolId, (counts.get(symbolId) ?? 0) + 1);
    }
    for (const [symbolId, count] of counts) {
      if (count < 2) {
        continue;
      }
      const repeated = repeatedComponents.get(symbolId) ?? {
        symbolId,
        name: sym.symbols[String(symbolId)] ?? "?",
        chars: new Map(),
        decompositionCount: 0,
      };
      const repeatCounts = repeated.chars.get(char) ?? new Set();
      repeatCounts.add(count);
      repeated.chars.set(char, repeatCounts);
      repeated.decompositionCount += 1;
      repeatedComponents.set(symbolId, repeated);
    }
  }
}

const componentName = (symbolId) =>
  sym.symbols[String(symbolId)] ?? "?";
const componentExpression = (symbolIds) =>
  symbolIds.map(componentName).join(" + ");

const heterogeneousGroups = [...bagGroups.values()]
  .filter((group) => group.chars.size >= 2)
  .sort(
    (left, right) =>
      left.symbolIds.length - right.symbolIds.length ||
      right.chars.size - left.chars.size ||
      componentExpression(left.symbolIds).localeCompare(
        componentExpression(right.symbolIds),
        "zh-CN",
      ) ||
      left.symbolIds[0] - right.symbolIds[0],
  );

const heterogeneousChars = new Set(
  heterogeneousGroups.flatMap((group) => [...group.chars]),
);
const heterogeneousByPartCount = new Map();
for (const group of heterogeneousGroups) {
  heterogeneousByPartCount.set(
    group.symbolIds.length,
    (heterogeneousByPartCount.get(group.symbolIds.length) ??
      0) + 1,
  );
}

const heterogeneousLines = [
  "# 通规异构字表",
  "",
  "> 范围：通用规范汉字表一级、二级、三级。",
  ">",
  "> “异构”指顺序无关、重复次数计入的精确部件组合完全相同，但至少对应两个通规汉字。",
  "> 同一个字若有多种拆法，会分别出现在对应字组中。",
  "",
  "## 统计",
  "",
  `- 通规汉字：${commonChars.length}`,
  `- 异构字组：${heterogeneousGroups.length}`,
  `- 涉及汉字：${heterogeneousChars.size}`,
  `- 最大字组：${Math.max(0, ...heterogeneousGroups.map((group) => group.chars.size))} 字`,
  "",
  "| 部件数 | 异构组数 |",
  "| ---: | ---: |",
  ...[...heterogeneousByPartCount.entries()]
    .sort(([left], [right]) => left - right)
    .map(([partCount, count]) => `| ${partCount} | ${count} |`),
  "",
  "## 字组",
  "",
  ...heterogeneousGroups.flatMap((group, index) => [
    `### ${index + 1}. ${componentExpression(group.symbolIds)}`,
    "",
    `- 部件数：${group.symbolIds.length}`,
    `- 成员字：${group.chars.size}`,
    `- 部件 ID：${group.symbolIds.join(", ")}`,
    levelLines(group.chars),
    "",
  ]),
];

const repeatedComponentGroups = [
  ...repeatedComponents.values(),
].sort(
  (left, right) =>
    right.chars.size - left.chars.size ||
    right.decompositionCount - left.decompositionCount ||
    left.symbolId - right.symbolId,
);
const repeatedChars = new Set(
  repeatedComponentGroups.flatMap((component) => [
    ...component.chars.keys(),
  ]),
);
const repeatedLines = [
  "# 通规重复部件字表",
  "",
  "> 范围：通用规范汉字表一级、二级、三级。",
  ">",
  "> 只要同一部件在某个汉字的任一拆法中至少出现两次，就列入该部件的成员。",
  "> 部件以 `char_sym.json` 的精确 `symbolId` 为准，不合并异体写法。",
  "> 同一个字可能同时出现在多个部件下，或同时具有不同重复次数。",
  "",
  "## 统计",
  "",
  `- 通规汉字：${commonChars.length}`,
  `- 含重复部件的汉字：${repeatedChars.size}`,
  `- 被重复使用的部件：${repeatedComponentGroups.length}`,
  `- 部件关联字次：${repeatedComponentGroups.reduce(
    (total, component) => total + component.chars.size,
    0,
  )}`,
  "",
  "## 重复部件",
  "",
  ...repeatedComponentGroups.flatMap((component) => {
    const repeatCounts = [
      ...new Set(
        [...component.chars.values()].flatMap((counts) => [
          ...counts,
        ]),
      ),
    ].sort((left, right) => left - right);
    return [
      `## ${component.name} · ID ${component.symbolId}`,
      "",
      `- 成员字：${component.chars.size}`,
      `- 含该部件重复的拆法：${component.decompositionCount}`,
      `- 出现的重复次数：${repeatCounts.join("、")}`,
      "",
      ...repeatCounts.flatMap((count) => {
        const chars = [...component.chars.entries()]
          .filter(([, counts]) => counts.has(count))
          .map(([char]) => char);
        return [
          `### 重复 ${count} 次`,
          "",
          levelLines(chars),
          "",
        ];
      }),
      "",
      "---",
      "",
    ];
  }),
];

writeFileSync(
  resolve(projectRoot, "docs/TRIAL_HETEROGENEOUS_CHARS.md"),
  `${heterogeneousLines.join("\n").trimEnd()}\n`,
);
writeFileSync(
  resolve(projectRoot, "docs/TONGYONG_REPEATED_COMPONENT_CHARS.md"),
  `${repeatedLines.join("\n").trimEnd()}\n`,
);

console.log(
  `trial reports: ${heterogeneousGroups.length} heterogeneous groups, ` +
    `${heterogeneousChars.size} heterogeneous chars, ` +
    `${repeatedChars.size} repeated-component chars across ` +
    `${repeatedComponentGroups.length} components`,
);
