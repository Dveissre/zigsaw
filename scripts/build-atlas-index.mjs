import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const readJson = (relativePath) =>
  JSON.parse(
    readFileSync(resolve(projectRoot, relativePath), "utf8"),
  );

const symSource = readFileSync(
  resolve(projectRoot, "public/data/char_sym.json"),
);
const sym = JSON.parse(symSource.toString("utf8"));
const assetSource = readFileSync(
  resolve(projectRoot, "public/data/component-assets.json"),
);
const assetData = JSON.parse(assetSource.toString("utf8"));
const sourceHash = createHash("sha256")
  .update(symSource)
  .update("\0")
  .update(assetSource)
  .digest("hex")
  .slice(0, 16);
const levelData = readJson("public/data/tongyong_hanzi.json");

const levelKeys = ["一级", "二级", "三级"];
const levelValues = [1, 2, 3];
const rarityOrder = ["N", "R", "SR", "SSR", "UR", "XR"];
const milestoneThresholds = {
  N: [25, 50, 70],
  R: [40, 60, 80],
  SR: [50, 80],
  SSR: [],
  UR: [100],
  XR: [],
};

function milestonesFor(rarity, characterCount) {
  if (rarity === "SSR") {
    return characterCount <= 1
      ? [100]
      : [Math.round(((characterCount - 1) / characterCount) * 100)];
  }
  if (rarity === "SR" || rarity === "XR") {
    return [...milestoneThresholds[rarity]];
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
const completeCharacterMeta = new Map();
let completeCharacterRank = 0;
levelKeys.forEach((levelKey, index) => {
  for (const char of levelData.levels[levelKey] ?? []) {
    if (!completeCharacterMeta.has(char)) {
      completeCharacterRank += 1;
      completeCharacterMeta.set(char, {
        level: levelValues[index],
        rank: completeCharacterRank,
      });
    }
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
          chars: [],
          ...(asset ? { asset: asset.source } : {}),
        };
        components.set(key, component);
      }
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

const levelCharacters = new Set(
  levelKeys.flatMap((levelKey) => levelData.levels[levelKey] ?? []),
);
const exCharacters = new Set(
  Object.keys(sym.chars).filter((char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    return (
      !levelCharacters.has(char) &&
      codePoint >= 0x4e00 &&
      codePoint <= 0x9fff &&
      isSelectable(char) &&
      (sym.chars[char] ?? []).some((way) => way.length >= 3)
    );
  }),
);
const relationsBySymbol = new Map();
for (const [char, ways] of Object.entries(sym.chars)) {
  for (const way of ways) {
    for (const symbolId of new Set(way)) {
      const entries = relationsBySymbol.get(symbolId) ?? [];
      entries.push({
        char,
        wayLength: way.length,
        isLevelCharacter: levelCharacters.has(char),
        isExCharacter: exCharacters.has(char),
      });
      relationsBySymbol.set(symbolId, entries);
    }
  }
}

function characterReference(char, overrides = {}) {
  return {
    char,
    ...(completeCharacterMeta.get(char) ?? {
      level: 3,
      rank: 0,
    }),
    ...(completeCharacterMeta.has(char)
      ? {}
      : { isExternal: true }),
    ...overrides,
  };
}

function characterCategory(character) {
  if (character.isSelf) {
    return 0;
  }
  if (character.isUnreachable) {
    return 1;
  }
  if (character.isEx) {
    return 5;
  }
  return 1 + character.level;
}

function sortCharacterReferences(characters) {
  return characters.sort(
    (left, right) =>
      characterCategory(left) - characterCategory(right) ||
      left.rank - right.rank ||
      (left.char.codePointAt(0) ?? 0) -
        (right.char.codePointAt(0) ?? 0),
  );
}

function buildExclusiveComponents() {
  const existingIds = new Set(components.keys());
  const exclusive = [];
  for (const [key, name] of Object.entries(sym.symbols)) {
    const symbolId = Number(key);
    const related = relationsBySymbol.get(symbolId) ?? [];
    if (
      existingIds.has(key) ||
      [...name].length !== 1 ||
      name === "?" ||
      name === "？" ||
      related.length === 0 ||
      related.some(
        (entry) =>
          entry.isLevelCharacter && entry.wayLength >= 2,
      )
    ) {
      continue;
    }

    const exRelatedChars = [
      ...new Set(
        related
          .filter((entry) => entry.isExCharacter)
          .map((entry) => entry.char),
      ),
    ].sort(
      (left, right) =>
        (left.codePointAt(0) ?? 0) -
        (right.codePointAt(0) ?? 0),
    );
    const allRelatedChars = [
      ...new Set(related.map((entry) => entry.char)),
    ].sort(
      (left, right) =>
        Number(levelCharacters.has(right)) -
          Number(levelCharacters.has(left)) ||
        (completeCharacterMeta.get(left)?.rank ?? Infinity) -
          (completeCharacterMeta.get(right)?.rank ?? Infinity) ||
        (left.codePointAt(0) ?? 0) -
          (right.codePointAt(0) ?? 0),
    );
    const selfCharacter = allRelatedChars.find(
      (char) =>
        char === name &&
        (sym.chars[char] ?? []).some(
          (way) => way.length === 1 && way[0] === symbolId,
        ),
    );
    const isExclusive = exRelatedChars.length > 0;
    const displayedChars = allRelatedChars;
    const chars = displayedChars
      .map((char) => {
        const isSelf = char === selfCharacter;
        return characterReference(char, {
          isSelf,
          isEx:
            isExclusive &&
            !isSelf &&
            exCharacters.has(char),
          isUnreachable:
            !isSelf && !exCharacters.has(char),
        });
      })
      .sort(
        (left, right) =>
          characterCategory(left) - characterCategory(right) ||
          left.rank - right.rank ||
          (left.char.codePointAt(0) ?? 0) -
            (right.char.codePointAt(0) ?? 0),
      );
    const rarity = isExclusive
      ? rarityFor(exRelatedChars.length / 10)
      : "XR";
    const progressCharCount = isExclusive
      ? chars.filter((character) => character.isEx).length
      : 0;
    const asset = assetData.symbols[key];
    exclusive.push({
      symbolId,
      name,
      count: isExclusive
        ? chars.filter((character) => character.isEx).length
        : chars.filter(
            (character) =>
              !character.isSelf &&
              character.isUnreachable,
          ).length,
      rarity,
      isExclusive,
      milestones: milestonesFor(rarity, progressCharCount),
      chars,
      charCount: chars.length,
      progressCharCount,
      exCharCount: progressCharCount,
      ...(asset ? { asset: asset.source } : {}),
    });
  }
  return exclusive;
}

const outputComponents = [...components.values()]
  .map((component) => {
    const relatedChars = new Set(
      (relationsBySymbol.get(component.symbolId) ?? []).map(
        (entry) => entry.char,
      ),
    );
    const knownChars = new Set(
      component.chars.map((character) => character.char),
    );
    for (const char of relatedChars) {
      if (knownChars.has(char)) {
        continue;
      }
      component.chars.push(
        characterReference(char, {
          isEx: exCharacters.has(char),
          isUnreachable: !exCharacters.has(char),
        }),
      );
    }
    const sortedChars = sortCharacterReferences(component.chars);
    const progressCharCount = sortedChars.filter(
      (character) =>
        !character.isSelf &&
        !character.isEx &&
        !character.isUnreachable,
    ).length;
    const rarity = rarityFor(progressCharCount);
    const exCharCount = new Set(
      (relationsBySymbol.get(component.symbolId) ?? [])
        .filter((entry) => entry.isExCharacter)
        .map((entry) => entry.char),
    ).size;
    return {
      ...component,
      rarity,
      count: progressCharCount,
      milestones: milestonesFor(rarity, progressCharCount),
      chars: sortedChars,
      charCount: sortedChars.length,
      progressCharCount,
      exCharCount,
      isExclusive: false,
    };
  })
  .concat(buildExclusiveComponents())
  .sort(
    (left, right) =>
      rarityOrder.indexOf(left.rarity) -
        rarityOrder.indexOf(right.rarity) ||
      Number(Boolean(right.isExclusive)) -
        Number(Boolean(left.isExclusive)) ||
      right.count - left.count ||
      left.symbolId - right.symbolId,
  );

const summaries = outputComponents.map(
  ({ chars, ...component }) => ({
    ...component,
    selfChar: chars.find((character) => character.isSelf)?.char,
  }),
);

const byRarity = Object.fromEntries(
  rarityOrder.map((rarity) => [
    rarity,
    summaries.filter(
      (component) => component.rarity === rarity,
    ).length,
  ]),
);

const output = {
  format: "zigsaw-component-atlas/3",
  sourceHash,
  thresholds: {
    N: 100,
    R: 20,
    SR: 5,
    SSR: 2,
    UR: 1,
    XR: 0,
  },
  characterCount: orderedCharacters.length,
  componentCount: summaries.filter(
    (component) =>
      !component.isExclusive && component.rarity !== "XR",
  ).length,
  exclusiveCount: summaries.filter(
    (component) => component.isExclusive,
  ).length,
  xrCount: summaries.filter(
    (component) => component.rarity === "XR",
  ).length,
  totalRelatedCharacterCount: summaries.reduce(
    (total, component) => total + component.count,
    0,
  ),
  byRarity,
  components: summaries,
};

const outputPath = resolve(
  projectRoot,
  "public/data/component-atlas.json",
);
writeFileSync(outputPath, `${JSON.stringify(output)}\n`);

const detailDirectory = resolve(
  projectRoot,
  "public/data/component-atlas",
);
mkdirSync(detailDirectory, { recursive: true });
const shards = new Map();
for (const component of outputComponents) {
  const shard = component.symbolId % 16;
  const entries = shards.get(shard) ?? [];
  entries.push({
    symbolId: component.symbolId,
    chars: component.chars,
  });
  shards.set(shard, entries);
}
for (const [shard, componentsInShard] of shards) {
  writeFileSync(
    resolve(detailDirectory, `${shard}.json`),
    `${JSON.stringify({
      format: "zigsaw-component-characters/1",
      shard,
      components: componentsInShard,
    })}\n`,
  );
}

console.log(
  `component atlas: ${output.componentCount} components, ` +
    `N=${byRarity.N} R=${byRarity.R} SR=${byRarity.SR} ` +
    `SSR=${byRarity.SSR} UR=${byRarity.UR} XR=${byRarity.XR}`,
);
