import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
  });

  it("keeps the complete three-level hanzi order", () => {
    const data = readJson<LevelTable>("public/data/tongyong_hanzi.json");

    expect(data.levels.一级).toHaveLength(3500);
    expect(data.levels.二级).toHaveLength(3000);
    expect(data.levels.三级).toHaveLength(1605);
  });
});

