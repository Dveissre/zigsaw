import { existsSync, readFileSync, readdirSync } from "node:fs";
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

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;

describe("static game data", () => {
  it("keeps the expected sym table shape", () => {
    const data = readJson<SymTable>("public/data/char_sym.json");

    expect(data.counts.chars).toBe(27692);
    expect(data.counts.symbols).toBe(427);
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
      "159.svg",
      "198.svg",
      "338.svg",
      "425.svg",
    ]);
    for (const [symbolId, asset] of Object.entries(assets.symbols)) {
      expect(symTable.symbols[symbolId]).toBe(asset.name);
      const path = resolve(process.cwd(), "public", asset.source);
      expect(existsSync(path)).toBe(true);
      const svg = readFileSync(path, "utf8");
      expect(svg).toContain('viewBox="0 0 1024 1024"');
      expect(svg).toContain("<path");
    }
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
    expect(usage.decompositionCount).toBe(8791);
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
      count: 1735,
    });
    expect(
      usage.symbols.find((symbol) => symbol.symbolId === 425)
        ?.asset,
    ).toBe("component_svg/425N.svg");
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
    expect(externalCharacterMeta("丒")).toBe("（表外 U+4E12）");
  });
});

