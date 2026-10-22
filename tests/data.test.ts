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

    expect(mappedFiles).toEqual(svgFiles);
    for (const [symbolId, asset] of Object.entries(assets.symbols)) {
      expect(symTable.symbols[symbolId]).toBe(asset.name);
      const path = resolve(process.cwd(), "public", asset.source);
      expect(existsSync(path)).toBe(true);
      const svg = readFileSync(path, "utf8");
      expect(svg).toContain('viewBox="0 0 1024 1024"');
      expect(svg).toContain("<path");
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

