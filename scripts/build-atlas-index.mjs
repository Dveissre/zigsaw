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

const levelKeys = ["一级", "二级", "三级"];
const levelValues = [1, 2, 3];
const rarityOrder = ["N", "R", "SR", "SSR", "UR"];
const milestoneThresholds = {
  N: [25, 50, 70],
  R: [40, 60, 80],
  SR: [55, 75, 90],
  SSR: [50, 100],
  UR: [100],
};

function milestonesFor(rarity, characterCount) {
  if (rarity === "SSR" && characterCount <= 3) {
    return [100];
  }
  const count = Math.min(
    milestoneThresholds[rarity].length,
    Math.max(1, characterCount),
  );
  return milestoneThresholds[rarity].slice(-count);
}

function rarityFor(count) {
  if (count >= 100) {
    return "N";
  }
  if (count >= 20) {
    return "R";
  }
  if (count >= 5) {
    return "SR";
  }
  if (count >= 2) {
    return "SSR";
  }
  return "UR";
}

const unsupported = new Set(
  Object.entries(sym.symbols)
    .filter(
      ([symbolId, name]) =>
        [...name].length >= 2 &&
        !(symbolId in assetData.symbols),
    )
    .map(([symbolId]) => Number(symbolId)),
);
const isSelectable = (char) =>
  !(sym.chars[char] ?? []).some((way) =>
    way.some((symbolId) => unsupported.has(symbolId)),
  );

const orderedCharacters = [];
const characterMeta = new Map();
levelKeys.forEach((levelKey, index) => {
  for (const char of levelData.levels[levelKey] ?? []) {
    if (characterMeta.has(char) || !isSelectable(char)) {
      continue;
    }
    orderedCharacters.push(char);
    characterMeta.set(char, {
      level: levelValues[index],
      rank: orderedCharacters.length,
    });
  }
});

const components = new Map();
for (const char of orderedCharacters) {
  const ways = (sym.chars[char] ?? []).filter(
    (way) => way.length >= 2,
  );
  for (const way of ways) {
    for (const symbolId of way) {
      const key = String(symbolId);
      let component = components.get(key);
      if (!component) {
        const asset = assetData.symbols[key];
        component = {
          symbolId,
          name: sym.symbols[key] ?? "?",
          count: 0,
          chars: [],
          ...(asset ? { asset: asset.source } : {}),
        };
        components.set(key, component);
      }
      component.count += 1;
      if (!component.chars.some((entry) => entry.char === char)) {
        const meta = characterMeta.get(char);
        component.chars.push({
          char,
          level: meta.level,
          rank: meta.rank,
        });
      }
    }
  }
}

for (const [key, component] of components) {
  const selfCharacter = component.name;
  const meta = characterMeta.get(selfCharacter);
  const isSingleComponentCharacter = (sym.chars[selfCharacter] ?? []).some(
    (way) => way.length === 1 && way[0] === Number(key),
  );
  if (!meta || !isSingleComponentCharacter) {
    continue;
  }
  const existing = component.chars.find(
    (entry) => entry.char === selfCharacter,
  );
  if (existing) {
    existing.isSelf = true;
  } else {
    component.chars.push({
      char: selfCharacter,
      level: meta.level,
      rank: meta.rank,
      isSelf: true,
    });
  }
}

const outputComponents = [...components.values()]
  .map((component) => {
    const rarity = rarityFor(component.count);
    return {
      ...component,
      rarity,
      milestones: milestonesFor(rarity, component.chars.length),
      chars: component.chars.sort(
        (left, right) =>
          Number(Boolean(right.isSelf)) -
            Number(Boolean(left.isSelf)) ||
          left.rank - right.rank,
      ),
      charCount: component.chars.length,
    };
  })
  .sort(
    (left, right) =>
      rarityOrder.indexOf(left.rarity) -
        rarityOrder.indexOf(right.rarity) ||
      right.count - left.count ||
      left.symbolId - right.symbolId,
  );

const byRarity = Object.fromEntries(
  rarityOrder.map((rarity) => [
    rarity,
    outputComponents.filter(
      (component) => component.rarity === rarity,
    ).length,
  ]),
);

const output = {
  format: "zigsaw-component-atlas/1",
  thresholds: {
    N: 100,
    R: 20,
    SR: 5,
    SSR: 2,
    UR: 1,
  },
  characterCount: orderedCharacters.length,
  componentCount: outputComponents.length,
  totalUsageCount: outputComponents.reduce(
    (total, component) => total + component.count,
    0,
  ),
  byRarity,
  components: outputComponents,
};

const outputPath = resolve(
  projectRoot,
  "public/data/component-atlas.json",
);
writeFileSync(outputPath, `${JSON.stringify(output)}\n`);

console.log(
  `component atlas: ${output.componentCount} components, ` +
    `N=${byRarity.N} R=${byRarity.R} SR=${byRarity.SR} ` +
    `SSR=${byRarity.SSR} UR=${byRarity.UR}`,
);
