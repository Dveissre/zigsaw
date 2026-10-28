import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const readJson = (path) =>
  JSON.parse(readFileSync(path, "utf8"));

const sym = readJson("public/data/char_sym.json");
const levelData = readJson("public/data/tongyong_hanzi.json");
const assets = readJson("public/data/component-assets.json");

const stageQuestions = 5;
const stageSize = 1500;
const stageShift = 300;
const unsupported = new Set(
  Object.entries(sym.symbols)
    .filter(
      ([symbolId, name]) =>
        [...name].length >= 2 &&
        !(symbolId in assets.symbols),
    )
    .map(([symbolId]) => Number(symbolId)),
);
const isSelectable = (char) =>
  !(sym.chars[char] ?? []).some((way) =>
    way.some((symbolId) => unsupported.has(symbolId)),
  );

const challengeOrder = [
  ...levelData.levels.一级,
  ...levelData.levels.二级,
  ...levelData.levels.三级,
].filter((char) => char in sym.chars);
const levelChars = new Set([
  ...levelData.levels.一级,
  ...levelData.levels.二级,
  ...levelData.levels.三级,
]);
const exOrder = Object.keys(sym.chars)
  .filter((char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    return (
      [...char].length === 1 &&
      codePoint >= 0x4e00 &&
      codePoint <= 0x9fff &&
      !levelChars.has(char) &&
      isSelectable(char) &&
      sym.chars[char].some((way) => way.length >= 3)
    );
  })
  .sort(
    (left, right) =>
      (left.codePointAt(0) ?? 0) - (right.codePointAt(0) ?? 0),
  );

const lastStart = Math.max(0, challengeOrder.length - stageSize);
const boundaryStage =
  lastStart === 0 ? 1 : Math.ceil(lastStart / stageShift) + 1;
const exStartStage = boundaryStage + 1;

function stageBounds(stage) {
  if (stage >= exStartStage) {
    return {
      label: "EX",
      start: 0,
      end: exOrder.length,
      isEx: true,
    };
  }
  const start = Math.min((stage - 1) * stageShift, lastStart);
  return {
    label: String(stage),
    start,
    end: Math.min(start + stageSize, challengeOrder.length),
    isEx: false,
  };
}

function countParts(chars, minimumParts) {
  const stats = new Map();
  for (const char of chars) {
    if (!isSelectable(char)) {
      continue;
    }
    for (const way of sym.chars[char] ?? []) {
      if (way.length < minimumParts) {
        continue;
      }
      const entry = stats.get(way.length) ?? {
        chars: new Set(),
        ways: 0,
      };
      entry.chars.add(char);
      entry.ways += 1;
      stats.set(way.length, entry);
    }
  }
  return new Map(
    [...stats.entries()].sort(
      ([left], [right]) => left - right,
    ),
  );
}

const rows = [];
for (let stage = 1; stage <= exStartStage; stage += 1) {
  const bounds = stageBounds(stage);
  const chars = (bounds.isEx ? exOrder : challengeOrder)
    .slice(bounds.start, bounds.end);
  const stats = countParts(chars, bounds.isEx ? 3 : 2);
  rows.push({
    ...bounds,
    chars: stats,
  });
}

function probabilities(stage, position) {
  const localProgress = Math.min(1, Math.max(0, (position - 1) / 4));
  const effectiveStage = Math.max(0, stage - 1) + 0.5 * localProgress;
  const two = Math.max(0.05, 0.25 - 0.2 * (effectiveStage / 7));
  const threeFour = 0.65 + 0.1 * Math.min(1, effectiveStage / 11);
  const fourThreeRatio = Math.min(
    1.2,
    0.55 + (0.47 * Math.max(0, stage - 1)) / 11,
  );
  const four = (threeFour * fourThreeRatio) / (1 + fourThreeRatio);
  return {
    two,
    three: threeFour - four,
    four,
    longer: Math.max(0, 1 - two - threeFour),
  };
}

function percentage(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function cell(stats, minimum = 0, maximum = minimum) {
  let chars = new Set();
  let ways = 0;
  for (const [parts, entry] of stats) {
    if (parts < minimum || parts > maximum) {
      continue;
    }
    for (const char of entry.chars) {
      chars.add(char);
    }
    ways += entry.ways;
  }
  return `${chars.size} / ${ways}`;
}

const tableRows = rows.map((row) => {
  const stageNumber =
    row.label === "EX" ? exStartStage : Number(row.label);
  const longerStart = probabilities(stageNumber, 1).longer;
  const longerEnd = probabilities(stageNumber, stageQuestions).longer;
  return [
    row.label,
    `${row.start + 1}–${row.end}`,
    cell(row.chars, 2),
    cell(row.chars, 3),
    cell(row.chars, 4),
    cell(row.chars, 5),
    cell(row.chars, 6),
    cell(row.chars, 7),
    cell(row.chars, 8),
    cell(row.chars, 9, Number.POSITIVE_INFINITY),
    cell(row.chars, 5, Number.POSITIVE_INFINITY),
    `${percentage(Math.min(longerStart, longerEnd))}–${percentage(
      Math.max(longerStart, longerEnd),
    )}`,
  ];
});

const markdown = `# 挑战模式各阶段部件拆法统计

参数：每阶段 ${stageQuestions} 题、窗口 ${stageSize}、滑移 ${stageShift}、
EX 启用。顺位为《通用规范汉字表》合并顺序中的 1-based 范围。

单元格格式为 **不同汉字数 / 实际拆法数**。同一汉字若有多套同部件数拆法，
“汉字数”只计一次，“拆法数”全部计入；同时存在于多个部件数的汉字会在对应行重复出现。

| 阶段 | 顺位 | 2部件 | 3部件 | 4部件 | 5部件 | 6部件 | 7部件 | 8部件 | 9+部件 | 5+合计 | 5+类别概率* |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${tableRows
  .map((row) => `| ${row.join(" | ")} |`)
  .join("\n")}

\\* “5+类别概率”是当前选字算法中长部件类别在阶段首题到末题之间的范围，
尚未归一化同部件组之间的汉字数量。EX 会剔除不存在的 2 部件类别，
因此其 5+ 类别原始权重 20% 会被归一化为约 21.05%。

说明：

- 挑战字池过滤后共 ${challengeOrder.length} 字，EX 字池共 ${exOrder.length} 字。
- 阶段1的五部件组只有 ${cell(rows[0].chars, 5)}，六部件组只有
  ${cell(rows[0].chars, 6)}。
- 阶段13–17和23–24的9+部件仅包含9部件字；阶段18–22另有一个10部件字。
  EX的9+部件包括
  9部件 ${cell(rows.at(-1).chars, 9, 9)}、10部件 ${cell(rows.at(-1).chars, 10)}、
  11部件 ${cell(rows.at(-1).chars, 11)}、12部件 ${cell(rows.at(-1).chars, 12)}、
  18部件 ${cell(rows.at(-1).chars, 18)}。
- 阶段23和24因窗口到达字表末端，顺位窗口重叠但略有差异。
`;

const outputPath = resolve(
  import.meta.dirname,
  "../docs/STAGE_PART_COUNTS.md",
);
writeFileSync(outputPath, markdown);
console.log(markdown);
