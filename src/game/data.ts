export type Level = 1 | 2 | 3;
export type Mode = "normal" | "endless" | "challenge";

export interface GameSettings {
  levels: Level[];
  partsLow: number;
  partsHigh: number;
  mode: Mode;
  count: number;
  seconds: number;
  stageQuestions: number;
  stageSize: number;
  stageShift: number;
  exEnabled: boolean;
}

export interface ChallengeBounds {
  stage: number;
  start: number;
  end: number;
  isEx: boolean;
  exStartStage: number;
}

export interface ComponentDefinition {
  symbolId: number;
  name: string;
  assetUrl?: string;
}

type SymTable = {
  symbols: Record<string, string>;
  chars: Record<string, number[][]>;
};

type ComponentAssetTable = {
  symbols: Record<
    string,
    {
      name?: string;
      source: string;
    }
  >;
};

type LevelTable = {
  levels: {
    一级: string[];
    二级: string[];
    三级: string[];
  };
};

const levelNames: Record<Level, keyof LevelTable["levels"]> = {
  1: "一级",
  2: "二级",
  3: "三级",
};

const levelKeys = ["一级", "二级", "三级"] as const;
const levelValues: Level[] = [1, 2, 3];
const bagKey = (way: number[]): string =>
  [...way].sort((a, b) => a - b).join(",");

export function externalCharacterMeta(char: string): string {
  const codePoint = char.codePointAt(0);
  return codePoint === undefined
    ? ""
    : `（表外 U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}）`;
}

export class GameData {
  readonly ways: Map<string, number[][]>;
  readonly levels: Map<string, Level>;
  readonly challengeOrder: string[];
  readonly challengeRank: Map<string, number>;
  readonly exOrder: string[];
  private readonly symbols: Map<number, string>;
  private readonly componentAssets: Map<number, string>;
  private readonly unsupportedSymbolIds: Set<number>;
  private readonly byBag: Map<string, Set<string>>;
  private readonly candidateCache = new Map<string, string[]>();

  constructor(
    symData: SymTable,
    levelData: LevelTable,
    assetData: ComponentAssetTable | null = null,
    baseUrl = "",
  ) {
    this.symbols = new Map(
      Object.entries(symData.symbols).map(([id, name]) => [Number(id), name]),
    );
    this.ways = new Map(
      Object.entries(symData.chars).map(([char, ways]) => [char, ways]),
    );
    this.componentAssets = new Map(
      Object.entries(assetData?.symbols ?? {}).map(([symbolId, asset]) => [
        Number(symbolId),
        new URL(asset.source, baseUrl).href,
      ]),
    );
    this.unsupportedSymbolIds = new Set(
      [...this.symbols.entries()]
        .filter(
          ([symbolId, name]) =>
            [...name].length >= 2 && !this.componentAssets.has(symbolId),
        )
        .map(([symbolId]) => symbolId),
    );

    const levelOf = new Map<string, Level>();
    const levelOrders = levelKeys.map((key) => levelData.levels[key] ?? []);
    levelOrders.forEach((chars, orderIndex) => {
      const level = levelValues[orderIndex];
      for (const char of chars) {
        levelOf.set(char, level);
      }
    });
    this.levels = levelOf;

    this.challengeOrder = levelOrders
      .flat()
      .filter((char) => this.ways.has(char));
    this.challengeRank = new Map(
      this.challengeOrder.map((char, rank) => [char, rank]),
    );
    this.exOrder = [...this.ways.keys()]
      .filter((char) => {
        const codePoint = char.codePointAt(0);
        return (
          [...char].length === 1 &&
          codePoint !== undefined &&
          codePoint >= 0x4e00 &&
          codePoint <= 0x9fff &&
          !this.levels.has(char) &&
          this.isCharSelectable(char) &&
          (this.ways.get(char) ?? []).some((way) => way.length >= 3)
        );
      })
      .sort((left, right) => (left.codePointAt(0) ?? 0) - (right.codePointAt(0) ?? 0));

    const byBag = new Map<string, Set<string>>();
    for (const [char, ways] of this.ways) {
      for (const way of ways) {
        const key = bagKey(way);
        const chars = byBag.get(key) ?? new Set<string>();
        chars.add(char);
        byBag.set(key, chars);
      }
    }
    this.byBag = byBag;
  }

  candidates(level: Level, low: number, high: number): string[] {
    const key = `${level}|${low}|${high}`;
    const cached = this.candidateCache.get(key);
    if (cached) {
      return cached;
    }

    const result = [...this.ways.keys()]
      .filter((char) => {
        if (this.levels.get(char) !== level) {
          return false;
        }
        if (!this.isCharSelectable(char)) {
          return false;
        }
        return (this.ways.get(char) ?? []).some(
          (way) => way.length >= low && way.length <= high,
        );
      })
      .sort();
    this.candidateCache.set(key, result);
    return result;
  }

  names(way: number[]): string[] {
    return way.map((symbolId) => this.symbols.get(symbolId) ?? "?");
  }

  shortestDecomposition(char: string): number[] | null {
    let shortest: number[] | null = null;
    for (const way of this.ways.get(char) ?? []) {
      if (way.length < 2) {
        continue;
      }
      if (!shortest || way.length < shortest.length) {
        shortest = way;
      }
    }
    return shortest ? [...shortest] : null;
  }

  component(symbolId: number): ComponentDefinition {
    return {
      symbolId,
      name: this.symbols.get(symbolId) ?? "?",
      assetUrl: this.componentAssets.get(symbolId),
    };
  }

  isCharSelectable(char: string): boolean {
    return !(this.ways.get(char) ?? []).some((way) =>
      way.some((symbolId) => this.unsupportedSymbolIds.has(symbolId)),
    );
  }

  accepted(way: number[]): Set<string> {
    return this.byBag.get(bagKey(way)) ?? new Set();
  }

  answerMeta(char: string): string {
    const level = this.levels.get(char);
    const rank = this.challengeRank.get(char);
    if (!level || rank === undefined) {
      return "";
    }
    return `${levelNames[level]} ${String(rank + 1).padStart(4, "0")}`;
  }

  challengeBounds(settings: GameSettings, index: number): ChallengeBounds {
    const requestedStage = Math.floor((index - 1) / settings.stageQuestions) + 1;
    const lastStart = Math.max(0, this.challengeOrder.length - settings.stageSize);
    const boundaryStage =
      lastStart === 0
        ? 1
        : Math.ceil(lastStart / settings.stageShift) + 1;
    const exStartStage = boundaryStage + 1;
    if (settings.exEnabled && requestedStage >= exStartStage) {
      return {
        stage: exStartStage,
        start: 0,
        end: this.exOrder.length,
        isEx: true,
        exStartStage,
      };
    }

    const start = Math.min(
      (requestedStage - 1) * settings.stageShift,
      lastStart,
    );
    const end = Math.min(start + settings.stageSize, this.challengeOrder.length);
    return {
      stage: requestedStage,
      start,
      end,
      isEx: false,
      exStartStage,
    };
  }
}

async function fetchJson<T>(relativePath: string, baseUrl: string): Promise<T> {
  const response = await fetch(new URL(relativePath, baseUrl));
  if (!response.ok) {
    throw new Error(`${relativePath}: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function loadGameData(baseUrl: string): Promise<GameData> {
  const [symData, levelData, assetData] = await Promise.all([
    fetchJson<SymTable>("data/char_sym.json", baseUrl),
    fetchJson<LevelTable>("data/tongyong_hanzi.json", baseUrl),
    fetchJson<ComponentAssetTable>(
      "data/component-assets.json",
      baseUrl,
    ).catch(() => null),
  ]);
  return new GameData(symData, levelData, assetData, baseUrl);
}

