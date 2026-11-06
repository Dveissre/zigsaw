import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { externalCharacterMeta, GameData } from "../src/game/data";

type SymTable = {
  counts: {
    chars: number;
    symbols: number;
  };
  chars: Record<string, number[][]>;
  symbols: Record<string, string>;
};

type LevelTable = {
  levels: {
    一级: string[];
    二级: string[];
    三级: string[];
  };
};

type ComponentAssetTable = {
  symbols: Record<string, { name: string; source: string }>;
};

type AnswerCompatibilityTable = {
  format: string;
  expansions: Record<string, number[][]>;
};

type GestaltPairsTable = {
  format: string;
  sourceHash: string;
  answerCompatibilityHash: string;
  excludedComponents: string[];
  pairs: Array<{
    components: [number, number];
    answers: Array<{ char: string; level: number }>;
  }>;
};

type CompositionWordsTable = {
  format: string;
  sourceHash: string;
  symbolHash: string;
  answerCompatibilityHash: string;
  words: Record<"2" | "3" | "4", string[]>;
  normal: Array<{
    word: string;
    weight: number;
    recipes: number[][][];
  }>;
  boss: Array<{
    word: string;
    weight: number;
    recipes: number[][][];
  }>;
};

type AssonanceWordsTable = Omit<
  CompositionWordsTable,
  "format"
> & {
  format: "zigsaw-assonance-words/1";
};

type WordAnswersTable = {
  format: string;
  sourceHash: string;
  symbolsHash: string;
  words: Record<"2" | "3" | "4", string[]>;
};

type CharDetailTable = Array<{
  char: string;
  pronunciations: Array<{
    pinyin: string;
    explanations: Array<{ content?: string }>;
  }>;
}>;

type SchoolIndex = Record<
  string,
  { read?: string[]; write?: string[] }
>;

type ComponentUsageTable = {
  format: string;
  characterCount: number;
  decompositionCount: number;
  totalUsageCount: number;
  componentCount: number;
  symbols: Array<{
    symbolId: number;
    name: string;
    count: number;
    charCount: number;
    asset?: string;
  }>;
};

type ComponentAtlasTable = {
  format: string;
  sourceHash: string;
  componentCount: number;
  exclusiveCount: number;
  xrCount: number;
  characterCount: number;
  byRarity: Record<string, number>;
  components: Array<{
    symbolId: number;
    name: string;
    rarity: string;
    count: number;
    charCount: number;
    progressCharCount: number;
    isExclusive: boolean;
    milestones: number[];
  }>;
};

type ComponentCharacterShard = {
  format: string;
  shard: number;
  components: Array<{
    symbolId: number;
    chars: Array<{
      char: string;
      level: number;
      rank: number;
      isSelf?: boolean;
      isExternal?: boolean;
      isEx?: boolean;
      isUnreachable?: boolean;
    }>;
  }>;
};

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;

describe("static game data", () => {
  it("keeps copied lexicon assets synchronized with their sources", () => {
    for (const name of [
      "hanzi_pinyin12.json",
      "tongyong12_trad.json",
    ]) {
      expect(
        readFileSync(
          resolve(
            process.cwd(),
            "public/data",
            name,
          ),
        ),
      ).toEqual(
        readFileSync(
          resolve(
            process.cwd(),
            "data-source/wordlists",
            name,
          ),
        ),
      );
    }
  });

  it("keeps the generated composition pool synchronized with words and decompositions", () => {
    const composition = readJson<CompositionWordsTable>(
      "public/data/composition-words.json",
    );
    expect(composition.format).toBe(
      "zigsaw-composition-words/1",
    );
    expect(composition.sourceHash).toBe(
      createHash("sha256")
        .update(
          readFileSync(
            resolve(
              process.cwd(),
              "data-source/wordlists/words_2to4.txt",
            ),
          ),
        )
        .digest("hex"),
    );
    expect(composition.symbolHash).toBe(
      createHash("sha256")
        .update(
          readFileSync(
            resolve(process.cwd(), "public/data/char_sym.json"),
          ),
        )
        .digest("hex"),
    );
    expect(composition.answerCompatibilityHash).toBe(
      createHash("sha256")
        .update(
          readFileSync(
            resolve(
              process.cwd(),
              "public/data/char_sym_answer_compat.json",
            ),
          ),
        )
        .digest("hex"),
    );
    expect(composition.normal).toHaveLength(7558);
    expect(composition.boss).toHaveLength(6388);
    expect(composition.words["2"]).toHaveLength(36947);
    expect(composition.words["3"]).toHaveLength(6858);
    expect(composition.words["4"]).toHaveLength(8341);
    expect(
      composition.normal.every(
        (entry) =>
          entry.weight > 0 &&
          entry.recipes.every(
            (recipe) =>
              recipe.reduce(
                (sum, way) => sum + way.length,
                0,
              ) === 4,
          ),
      ),
    ).toBe(true);
    expect(
      composition.boss.every((entry) =>
        entry.recipes.every((recipe) => {
          const cards = recipe.reduce(
            (sum, way) => sum + way.length,
            0,
          );
          return cards >= 6 && cards <= 8;
        }),
      ),
    ).toBe(true);
    for (const pool of [
      composition.normal,
      composition.boss,
    ]) {
      const frequency = new Map<string, number>();
      for (const entry of pool) {
        for (const char of entry.word) {
          frequency.set(
            char,
            (frequency.get(char) ?? 0) + 1,
          );
        }
      }
      for (const entry of pool.slice(0, 50)) {
        const chars = [...entry.word];
        const expectedWeight =
          1 /
          Math.exp(
            chars.reduce(
              (sum, char) =>
                sum +
                Math.log(frequency.get(char) ?? 1),
              0,
            ) / chars.length,
          );
        expect(entry.weight).toBeCloseTo(
          expectedWeight,
          10,
        );
      }
    }
  });

  it("keeps the assonance pool restricted to cross-character repeated components", () => {
    const assonance = readJson<AssonanceWordsTable>(
      "public/data/assonance-words.json",
    );
    expect(assonance.format).toBe(
      "zigsaw-assonance-words/1",
    );
    expect(assonance.sourceHash).toBe(
      createHash("sha256")
        .update(
          readFileSync(
            resolve(
              process.cwd(),
              "data-source/wordlists/words_2to4.txt",
            ),
          ),
        )
        .digest("hex"),
    );
    expect(assonance.symbolHash).toBe(
      createHash("sha256")
        .update(
          readFileSync(
            resolve(process.cwd(), "public/data/char_sym.json"),
          ),
        )
        .digest("hex"),
    );
    expect(assonance.answerCompatibilityHash).toBe(
      createHash("sha256")
        .update(
          readFileSync(
            resolve(
              process.cwd(),
              "public/data/char_sym_answer_compat.json",
            ),
          ),
        )
        .digest("hex"),
    );
    expect(assonance.normal).toHaveLength(3111);
    expect(assonance.boss).toHaveLength(722);
    expect(assonance.words["2"]).toHaveLength(36717);
    expect(assonance.words["3"]).toHaveLength(6586);
    expect(assonance.words["4"]).toHaveLength(7603);
    for (const words of Object.values(assonance.words)) {
      expect(
        words.every(
          (word) =>
            new Set([...word]).size === [...word].length,
        ),
      ).toBe(true);
    }
    const displayedShape = (recipe: number[][]) => {
      const counts = new Map<number, number>();
      for (const way of recipe) {
        for (const symbolId of way) {
          counts.set(
            symbolId,
            (counts.get(symbolId) ?? 0) + 1,
          );
        }
      }
      const cross = [...counts.keys()].filter(
        (symbolId) =>
          recipe.filter((way) =>
            way.includes(symbolId),
          ).length >= 2,
      );
      return {
        cards:
          cross.length +
          [...counts.entries()].reduce(
            (sum, [symbolId, count]) =>
              sum +
              (cross.includes(symbolId) ? 0 : count),
            0,
          ),
        cross: cross.length,
        crossSymbols: cross,
      };
    };
    expect(
      assonance.normal.every((entry) =>
        entry.recipes.every((recipe) => {
          const shape = displayedShape(recipe);
          return (
            shape.cards >= 4 &&
            shape.cards <= 6 &&
            shape.cross >= 1 &&
            recipe.every((way) =>
              way.some(
                (symbolId) =>
                  !shape.crossSymbols.includes(symbolId),
              ),
            )
          );
        }),
      ),
    ).toBe(true);
    expect(
      assonance.boss.every((entry) =>
        entry.recipes.every((recipe) => {
          const shape = displayedShape(recipe);
          return (
            shape.cards >= 6 &&
            shape.cards <= 10 &&
            shape.cross >= 2
          );
        }),
      ),
    ).toBe(true);
  });

  it("keeps the extended answer lexicon separate from question generation", () => {
    const answers = readJson<WordAnswersTable>(
      "public/data/word-answers.json",
    );
    expect(answers.format).toBe("zigsaw-word-answers/1");
    expect(answers.sourceHash).toBe(
      createHash("sha256")
        .update(
          readFileSync(
            resolve(
              process.cwd(),
              "data-source/wordlists/common_word.txt",
            ),
          ),
        )
        .digest("hex"),
    );
    expect(answers.symbolsHash).toBe(
      createHash("sha256")
        .update(
          readFileSync(
            resolve(process.cwd(), "public/data/char_sym.json"),
          ),
        )
        .digest("hex"),
    );
    expect(answers.words["2"]).toHaveLength(108685);
    expect(answers.words["3"]).toHaveLength(11143);
    expect(answers.words["4"]).toHaveLength(8384);
    expect(answers.words["2"]).toEqual(
      expect.arrayContaining(["日晕", "混沌", "馄饨"]),
    );
  });

  it("keeps generated Gestalt pairs free of direct-answer and compatibility-only seeds", () => {
    const symTable = readJson<SymTable>(
      "public/data/char_sym.json",
    );
    const levelTable = readJson<LevelTable>(
      "public/data/tongyong_hanzi.json",
    );
    const answerCompatibility =
      readJson<AnswerCompatibilityTable>(
        "public/data/char_sym_answer_compat.json",
      );
    const gestalt = readJson<GestaltPairsTable>(
      "public/data/gestalt-pairs.json",
    );
    const allowedChars = new Set([
      ...levelTable.levels.一级,
      ...levelTable.levels.二级,
    ]);
    const directPairSeeds = new Set<string>();
    const directTwoPartAnswers = new Set<string>();
    for (const [char, ways] of Object.entries(symTable.chars)) {
      if (!allowedChars.has(char)) {
        continue;
      }
      for (const way of ways) {
        for (let left = 0; left < way.length; left += 1) {
          for (
            let right = left + 1;
            right < way.length;
            right += 1
          ) {
            const pair = [way[left], way[right]].sort(
              (first, second) => first - second,
            );
            directPairSeeds.add(`${pair[0]}|${pair[1]}`);
            if (way.length === 2) {
              directTwoPartAnswers.add(
                `${pair[0]}|${pair[1]}`,
              );
            }
          }
        }
      }
    }

    expect(gestalt.format).toBe(
      "zigsaw-gestalt-pairs/1",
    );
    expect(gestalt.sourceHash).toBe(
      createHash("sha256")
        .update(
          readFileSync(
            resolve(process.cwd(), "public/data/char_sym.json"),
          ),
        )
        .digest("hex"),
    );
    expect(gestalt.answerCompatibilityHash).toBe(
      createHash("sha256")
        .update(
          readFileSync(
            resolve(
              process.cwd(),
              "public/data/char_sym_answer_compat.json",
            ),
          ),
        )
        .digest("hex"),
    );
    expect(gestalt.excludedComponents).toContain("𰀁");
    expect(gestalt.pairs).toHaveLength(4535);
    expect(
      gestalt.pairs.find(
        (pair) =>
          pair.components[0] === 91 &&
          pair.components[1] === 148,
      )?.answers.map((answer) => answer.char),
    ).toEqual(["圄"]);
    const game = new GameData(
      symTable,
      levelTable,
      null,
      "",
      answerCompatibility,
    );
    const accepted = game.acceptedContaining([91, 148]);
    expect(accepted.has("圄")).toBe(true);
    expect(accepted.has("晤")).toBe(true);
    expect(
      gestalt.pairs.some(
        (pair) =>
          pair.components.includes(91) &&
          pair.components.includes(164),
      ),
    ).toBe(false);
    for (const pair of gestalt.pairs) {
      const key = `${pair.components[0]}|${pair.components[1]}`;
      expect(directPairSeeds.has(key)).toBe(true);
      expect(directTwoPartAnswers.has(key)).toBe(false);
      expect(pair.answers.length).toBeGreaterThanOrEqual(1);
      expect(pair.answers.length).toBeLessThanOrEqual(3);
      for (const answer of pair.answers) {
        expect(
          symTable.chars[answer.char]?.some((way) =>
            pair.components.every((symbolId) =>
              way.includes(symbolId),
            ),
          ),
        ).toBe(true);
      }
    }
  });

  it("keeps the expected sym table shape", () => {
    const data = readJson<SymTable>("public/data/char_sym.json");

    expect(data.counts.chars).toBe(27692);
    expect(data.counts.symbols).toBe(428);
    expect(data.chars["氢"]).toEqual([[168, 429, 75]]);
    expect(
      data.chars["氢"][0].map((symbolId) => data.symbols[String(symbolId)]),
    ).toEqual(["气", "ス", "工"]);
    expect(
      data.chars["里"].map((way) =>
        way.map((symbolId) => data.symbols[String(symbolId)]).join("+"),
      ),
    ).toContain("日+土");
    expect(
      data.chars["秉"].map((way) =>
        way.map((symbolId) => data.symbols[String(symbolId)]).join("+"),
      ),
    ).toContain("禾+⺕");
    expect(
      data.chars["觑"].map((way) =>
        way.map((symbolId) => data.symbols[String(symbolId)]).join("+"),
      ),
    ).toContain("虍+业+冂+丿+乚");
    expect(
      data.chars["浉"].map((way) =>
        way.map((symbolId) => data.symbols[String(symbolId)]).join("+"),
      ),
    ).toContain("氵+リ+一+巾");
  });

  it("keeps the complete three-level hanzi order", () => {
    const data = readJson<LevelTable>("public/data/tongyong_hanzi.json");

    expect(data.levels.一级).toHaveLength(3500);
    expect(data.levels.二级).toHaveLength(3000);
    expect(data.levels.三级).toHaveLength(1605);
  });

  it("keeps the lazily loaded character detail library", () => {
    const directory = resolve(
      process.cwd(),
      "public/data/char-detail",
    );
    const shardFiles = readdirSync(directory)
      .filter((name) => name.endsWith(".json"))
      .sort();
    const data = shardFiles.flatMap((filename) =>
      readJson<CharDetailTable>(`public/data/char-detail/${filename}`),
    );
    const find = (char: string) =>
      data.find((entry) => entry.char === char);

    expect(shardFiles).toHaveLength(256);
    expect(data).toHaveLength(21041);
    expect(find("厂")?.pronunciations.map((item) => item.pinyin)).toEqual([
      "chǎng",
      "ān",
      "hàn",
    ]);
    expect(
      find("厂")?.pronunciations[0].explanations.map(
        (item) => item.content,
      ),
    ).toContain("工厂。");
    expect(find("丒")?.pronunciations[0].pinyin).toBe("chǒu");
    expect(
      readJson<CharDetailTable>("public/data/char-detail/82.json").some(
        (entry) => entry.char === "厂",
      ),
    ).toBe(true);
  });

  it("keeps the primary-school reading and writing index", () => {
    const school = readJson<SchoolIndex>(
      "public/data/char-school.json",
    );

    expect(Object.keys(school)).toHaveLength(2997);
    expect(school["庞"]).toEqual({
      read: ["四上"],
      write: ["四上"],
    });
    expect(school["览"]).toEqual({
      read: ["二下"],
      write: ["五上"],
    });
    expect(school["丒"]).toBeUndefined();
  });

  it("maps every component SVG to an existing sym", () => {
    const symTable = readJson<SymTable>("public/data/char_sym.json");
    const assets = readJson<ComponentAssetTable>(
      "public/data/component-assets.json",
    );
    const svgFiles = readdirSync(resolve(process.cwd(), "public/component_svg"))
      .filter((name) => name.endsWith(".svg"))
      .sort();
    const mappedFiles = Object.values(assets.symbols)
      .map((asset) => asset.source.replace(/^component_svg\//, ""))
      .sort();
    const supersededFiles = svgFiles.filter((filename) => {
      const base = filename.replace(/\.svg$/, "");
      return (
        /[0-9]$/.test(base) &&
        mappedFiles.includes(`${base}N.svg`)
      );
    });

    expect(mappedFiles).toEqual(
      svgFiles.filter((filename) => !supersededFiles.includes(filename)),
    );
    expect(supersededFiles).toEqual([
      "121.svg",
      "159.svg",
      "182.svg",
      "198.svg",
      "240.svg",
      "266.svg",
      "298.svg",
      "338.svg",
      "347.svg",
      "355.svg",
      "425.svg",
      "431.svg",
    ]);
    for (const [symbolId, asset] of Object.entries(assets.symbols)) {
      expect(symTable.symbols[symbolId]).toBe(asset.name);
      const path = resolve(process.cwd(), "public", asset.source);
      expect(existsSync(path)).toBe(true);
      const svg = readFileSync(path, "utf8");
      expect(svg).toContain('viewBox="0 0 1024 1024"');
      expect(svg).toContain("<path");
    }
    expect(assets.symbols["433"]?.source).toBe(
      "component_svg/433.svg",
    );
  });

  it("covers every multi-character component used by tongyong characters", () => {
    const symTable = readJson<SymTable>("public/data/char_sym.json");
    const levels = readJson<LevelTable>(
      "public/data/tongyong_hanzi.json",
    );
    const assets = readJson<ComponentAssetTable>(
      "public/data/component-assets.json",
    );
    const usedMultiCharacterSymbols = new Set<string>();
    const characters = new Set([
      ...levels.levels.一级,
      ...levels.levels.二级,
      ...levels.levels.三级,
    ]);

    for (const char of characters) {
      for (const way of symTable.chars[char] ?? []) {
        for (const symbolId of way) {
          const name = symTable.symbols[String(symbolId)] ?? "";
          if ([...name].length >= 2) {
            usedMultiCharacterSymbols.add(String(symbolId));
          }
        }
      }
    }

    expect(
      [...usedMultiCharacterSymbols].filter(
        (symbolId) => !(symbolId in assets.symbols),
      ),
    ).toEqual([]);
    for (const symbolId of ["159", "198", "338", "425"]) {
      expect(assets.symbols[symbolId]?.source).toMatch(/N\.svg$/);
    }
  });

  it("keeps the generated component usage index internally consistent", () => {
    const usage = readJson<ComponentUsageTable>(
      "public/data/component-usage.json",
    );
    const ids = usage.symbols.map((symbol) => symbol.symbolId);

    expect(usage.format).toBe("zigsaw-component-usage/1");
    expect(usage.characterCount).toBe(8105);
    expect(usage.decompositionCount).toBe(9269);
    expect(usage.componentCount).toBe(usage.symbols.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(usage.totalUsageCount).toBe(
      usage.symbols.reduce(
        (total, symbol) => total + symbol.count,
        0,
      ),
    );
    expect(
      usage.symbols.every(
        (symbol, index) =>
          index === 0 ||
          usage.symbols[index - 1].count >= symbol.count,
      ),
    ).toBe(true);
    expect(usage.symbols[0]).toMatchObject({
      symbolId: 90,
      name: "口",
      count: 1864,
    });
    expect(
      usage.symbols.find((symbol) => symbol.symbolId === 425)
        ?.asset,
    ).toBe("component_svg/425N.svg");
  });

  it("builds the playable component atlas with the requested rarity split", () => {
    const atlas = readJson<ComponentAtlasTable>(
      "public/data/component-atlas.json",
    );

    expect(atlas.format).toBe("zigsaw-component-atlas/3");
    expect(atlas.sourceHash).toHaveLength(16);
    expect(atlas.componentCount).toBe(363);
    expect(atlas.exclusiveCount).toBe(35);
    expect(atlas.xrCount).toBe(15);
    expect(atlas.characterCount).toBe(8105);
    expect(atlas.byRarity).toEqual({
      N: 75,
      R: 139,
      SR: 109,
      SSR: 35,
      UR: 40,
      XR: 15,
    });
    expect(
      atlas.components.find((component) => component.symbolId === 265),
    ).toMatchObject({
      name: "肅心",
      rarity: "SSR",
      count: 22,
      exCharCount: 22,
      isExclusive: true,
      asset: "component_svg/265.svg",
    });
    const expectedRarity = (count: number) =>
      count >= 100
        ? "N"
        : count >= 20
          ? "R"
          : count >= 5
            ? "SR"
            : count >= 2
              ? "SSR"
              : "UR";
    expect(
      atlas.components
        .filter((component) => component.rarity !== "XR")
        .every(
          (component) =>
            component.rarity ===
            expectedRarity(
              component.count /
                (component.isExclusive ? 10 : 1),
            ),
        ),
    ).toBe(true);
    const characterDetails = readdirSync(
      resolve(process.cwd(), "public/data/component-atlas"),
    )
      .filter((filename) => filename.endsWith(".json"))
      .flatMap((filename) => {
        const shard = readJson<ComponentCharacterShard>(
          `public/data/component-atlas/${filename}`,
        );
        expect(shard.format).toBe(
          "zigsaw-component-characters/1",
        );
        return shard.components;
      });
    const charactersByComponent = new Map(
      characterDetails.map((component) => [
        component.symbolId,
        component.chars,
      ]),
    );
    expect(charactersByComponent.size).toBe(413);
    expect(
      atlas.components.every((component) => {
          const chars =
            charactersByComponent.get(component.symbolId) ?? [];
          const selfCharacters = chars.filter(
            (character) => character.isSelf,
          );
          const relatedCharacters = chars.filter(
            (character) => !character.isSelf,
          );
          const regularCharacters = relatedCharacters.filter(
            (character) =>
              !character.isEx && !character.isUnreachable,
          );
          const tableCharacters = regularCharacters.filter(
            (character) => !character.isExternal,
          );
          const exCharacters = relatedCharacters.filter(
            (character) => character.isEx,
          );
          const progressionChars = component.isExclusive
            ? exCharacters.length
            : regularCharacters.length;
          const category = (
            character: (typeof chars)[number],
          ) =>
            character.isSelf
              ? 0
              : character.isUnreachable
                ? 1
                : character.isEx
                  ? 5
                  : 1 + character.level;
          const expectedMilestones =
            component.rarity === "SSR"
              ? [
                  progressionChars <= 2
                    ? 100
                    : Math.round(
                        ((progressionChars - 1) /
                          progressionChars) *
                          100,
                      ),
                ]
              : component.rarity === "SR"
                ? [30, 60]
                : component.rarity === "XR"
                  ? []
                  : component.rarity === "UR"
                    ? [100]
                    : [15, 30, 60].slice(
                        -Math.min(
                          3,
                          Math.max(1, progressionChars),
                        ),
                      );
          return (
            JSON.stringify(component.milestones) ===
              JSON.stringify(expectedMilestones) &&
            component.charCount === chars.length &&
            component.progressCharCount ===
              (component.rarity === "XR"
                ? 0
                : progressionChars) &&
            selfCharacters.length <= 1 &&
            chars.slice(0, selfCharacters.length).every(
              (character) => character.isSelf,
            ) &&
            chars.every(
              (character, index) =>
                index === 0 ||
                category(chars[index - 1]) <=
                  category(character),
            ) &&
            tableCharacters.every(
              (character, index) =>
                index === 0 ||
                tableCharacters[index - 1].rank < character.rank,
            ) &&
            exCharacters.every(
              (character, index) =>
                index === 0 ||
                (exCharacters[index - 1].char.codePointAt(0) ??
                  0) <=
                  (character.char.codePointAt(0) ?? 0),
            ) &&
            (exCharacters.length === 0 ||
              relatedCharacters
                .slice(-exCharacters.length)
                .every(
                  (character) => character.isEx === true,
                ))
          );
        }),
    ).toBe(true);
    expect(
      charactersByComponent.get(434)?.[0],
    ).toMatchObject({
      char: "内",
      isSelf: true,
    });
    expect(
      atlas.components
        .filter((component) => component.isExclusive)
        .every(
          (component) =>
            component.rarity !== "XR" &&
            component.count === component.progressCharCount &&
            component.count > 0,
        ),
    ).toBe(true);
    expect(
      atlas.components
        .filter(
          (component) =>
            !component.isExclusive &&
            component.rarity !== "XR",
        )
        .every(
          (component) =>
            component.count === component.progressCharCount,
        ),
    ).toBe(true);
    expect(
      atlas.components
        .filter((component) => component.rarity === "XR")
        .every(
          (component) =>
            [...component.name].length === 1 &&
            component.charCount > 0 &&
            component.count ===
              component.charCount -
                (charactersByComponent
                  .get(component.symbolId)
                  ?.filter((character) => character.isSelf)
                  .length ?? 0) &&
            component.milestones.length === 0,
        ),
    ).toBe(true);
    for (const rarity of ["N", "R", "SR", "SSR", "UR", "XR"]) {
      const counts = atlas.components
        .filter((component) => component.rarity === rarity)
        .map((component) => component.count);
      expect(
        counts.every(
          (count, index) =>
            index === 0 || counts[index - 1] >= count,
        ),
      ).toBe(true);
    }
    for (const rarity of ["N", "R", "SR", "SSR", "UR"]) {
      const sameRarity = atlas.components.filter(
        (component) => component.rarity === rarity,
      );
      const lastExclusive = sameRarity
        .map((component) => component.isExclusive)
        .lastIndexOf(true);
      const firstNormal = sameRarity.findIndex(
        (component) => !component.isExclusive,
      );
      expect(
        lastExclusive === -1 ||
          firstNormal === -1 ||
          lastExclusive < firstNormal,
      ).toBe(true);
    }
  });

  it("builds the EX pool and excludes unadapted component names", () => {
    const symTable = readJson<SymTable>("public/data/char_sym.json");
    const levelTable = readJson<LevelTable>("public/data/tongyong_hanzi.json");
    const assets = readJson<ComponentAssetTable>(
      "public/data/component-assets.json",
    );
    const game = new GameData(
      symTable,
      levelTable,
      assets,
      "https://example.com/zigsaw/",
    );
    for (const symbolId of [159, 198, 338, 425]) {
      expect(game.component(symbolId).assetUrl).toMatch(
        new RegExp(`${symbolId}N\\.svg$`),
      );
    }
    const unsupportedIds = new Set(
      Object.entries(symTable.symbols)
        .filter(
          ([symbolId, name]) =>
            [...name].length >= 2 && !(symbolId in assets.symbols),
        )
        .map(([symbolId]) => Number(symbolId)),
    );
    const unadaptedChar = Object.keys(symTable.chars).find((char) =>
      symTable.chars[char].some((way) =>
        way.some((symbolId) => unsupportedIds.has(symbolId)),
      ),
    );

    expect(unadaptedChar).toBeDefined();
    expect(game.isCharSelectable(unadaptedChar!)).toBe(false);
    expect(
      game.names(game.shortestDecomposition("庞") ?? []),
    ).toEqual(["广", "尢", "丿", "丶"]);
    expect(
      game.names(game.shortestDecomposition("氢") ?? []),
    ).toEqual(["气", "ス", "工"]);
    expect(game.exOrder.length).toBeGreaterThan(0);
    expect(
      game.exOrder.every((char) => {
        const codePoint = char.codePointAt(0) ?? 0;
        return (
          codePoint >= 0x4e00 &&
          codePoint <= 0x9fff &&
          !levelTable.levels.一级.includes(char) &&
          !levelTable.levels.二级.includes(char) &&
          !levelTable.levels.三级.includes(char) &&
          game.isCharSelectable(char) &&
          symTable.chars[char].some((way) => way.length >= 3)
        );
      }),
    ).toBe(true);

    const settings = {
      levels: [],
      partsLow: 2,
      partsHigh: 4,
      mode: "challenge" as const,
      count: 10,
      seconds: 20,
      stageQuestions: 5,
      stageSize: 1500,
      stageShift: 300,
      exEnabled: true,
      includeSupplementaryChars: true,
      difficulty: "standard" as const,
      trialDifficulty: 1,
    };
    const boundary = game.challengeBounds(settings, (24 - 1) * 5 + 1);
    const ex = game.challengeBounds(settings, (25 - 1) * 5 + 1);
    expect(boundary).toMatchObject({
      stage: 24,
      start: game.challengeOrder.length - 1500,
      end: game.challengeOrder.length,
      isEx: false,
      exStartStage: 25,
    });
    expect(ex).toMatchObject({
      stage: 25,
      start: 0,
      end: game.exOrder.length,
      isEx: true,
      exStartStage: 25,
    });
    const withoutEx = game.challengeBounds(
      { ...settings, exEnabled: false },
      (25 - 1) * 5 + 1,
    );
    expect(withoutEx).toMatchObject({
      stage: 25,
      start: game.challengeOrder.length - 1500,
      end: game.challengeOrder.length,
      isEx: false,
    });
    expect(externalCharacterMeta("丒")).toBe("表外 U+4E12");
  });
});

describe("directional answer compatibility", () => {
  it("accepts finer compatible answers without reversing the direction", () => {
    const symTable = readJson<SymTable>("public/data/char_sym.json");
    const levelTable = readJson<LevelTable>(
      "public/data/tongyong_hanzi.json",
    );
    const assets = readJson<ComponentAssetTable>(
      "public/data/component-assets.json",
    );
    const compatibility = readJson<AnswerCompatibilityTable>(
      "public/data/char_sym_answer_compat.json",
    );
    const game = new GameData(
      symTable,
      levelTable,
      assets,
      "https://example.com/zigsaw/",
      compatibility,
    );

    expect([...game.accepted([211, 77, 5])]).toContain("汱");
    expect([...game.accepted([211, 144])]).toContain("汱");
    expect([...game.accepted([211, 144])]).not.toContain("汰");
    expect([...game.accepted([211, 1, 34, 5])]).toContain("汱");
    expect(game.ways.get("汱")).toEqual([[211, 144]]);
    expect(game.ways.get("汰")).toEqual([[211, 77, 5]]);
  });
});

describe("supplementary-plane character filtering", () => {
  it("can exclude characters outside the basic multilingual plane", () => {
    const symTable = readJson<SymTable>("public/data/char_sym.json");
    const levelTable = readJson<LevelTable>(
      "public/data/tongyong_hanzi.json",
    );
    const game = new GameData(
      symTable,
      levelTable,
      null,
      "https://example.com/zigsaw/",
    );
    const included = game.candidates(2, 3, 5, true);
    const excluded = game.candidates(2, 3, 5, false);

    expect(
      included.some((char) => !game.isBasicPlaneCharacter(char)),
    ).toBe(true);
    expect(
      excluded.every((char) => game.isBasicPlaneCharacter(char)),
    ).toBe(true);
    expect(excluded.length).toBeLessThan(included.length);
  });
});

