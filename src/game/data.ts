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
}

export interface ChallengeBounds {
  stage: number;
  start: number;
  end: number;
}

type SymTable = {
  symbols: Record<string, string>;
  chars: Record<string, number[][]>;
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

export class GameData {
  readonly ways: Map<string, number[][]>;
  readonly levels: Map<string, Level>;
  readonly challengeOrder: string[];
  readonly challengeRank: Map<string, number>;
  private readonly symbols: Map<number, string>;
  private readonly byBag: Map<string, Set<string>>;
  private readonly candidateCache = new Map<string, string[]>();

  constructor(symData: SymTable, levelData: LevelTable) {
    this.symbols = new Map(
      Object.entries(symData.symbols).map(([id, name]) => [Number(id), name]),
    );
    this.ways = new Map(
      Object.entries(symData.chars).map(([char, ways]) => [char, ways]),
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
    const stage = Math.floor((index - 1) / settings.stageQuestions) + 1;
    const lastStart = Math.max(0, this.challengeOrder.length - settings.stageSize);
    const start = Math.min((stage - 1) * settings.stageShift, lastStart);
    const end = Math.min(start + settings.stageSize, this.challengeOrder.length);
    return { stage, start, end };
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
  const [symData, levelData] = await Promise.all([
    fetchJson<SymTable>("data/char_sym.json", baseUrl),
    fetchJson<LevelTable>("data/tongyong_hanzi.json", baseUrl),
  ]);
  return new GameData(symData, levelData);
}

