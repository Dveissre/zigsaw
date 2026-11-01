export type Level = 1 | 2 | 3;
export type Mode = "normal" | "endless" | "challenge";
export type ChallengeDifficulty =
  | "beginner"
  | "standard"
  | "expert";

export const CHALLENGE_DIFFICULTY_SECONDS: Record<
  ChallengeDifficulty,
  number
> = {
  beginner: 60,
  standard: 40,
  expert: 20,
};

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
  includeSupplementaryChars: boolean;
  difficulty: ChallengeDifficulty;
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

type AnswerCompatibilityTable = {
  format: string;
  expansions: Record<string, number[][]>;
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
  private readonly answerExpansions: Map<number, number[][]>;
  private readonly reverseAnswerExpansions: Array<{
    symbolId: number;
    parts: number[];
  }>;
  private readonly acceptedCache = new Map<string, Set<string>>();
  private readonly candidateCache = new Map<string, string[]>();

  constructor(
    symData: SymTable,
    levelData: LevelTable,
    assetData: ComponentAssetTable | null = null,
    baseUrl = "",
    answerCompatibility: AnswerCompatibilityTable | null = null,
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
    if (
      answerCompatibility &&
      answerCompatibility.format !== "zh-char-sym-answer-compat/1"
    ) {
      throw new Error(
        `不支持的答案兼容规则格式：${answerCompatibility.format}`,
      );
    }
    this.answerExpansions = new Map(
      Object.entries(answerCompatibility?.expansions ?? {}).map(
        ([symbolId, alternatives]) => [
          Number(symbolId),
          alternatives.map((alternative) => [...alternative]),
        ],
      ),
    );
    this.validateAnswerCompatibility();
    this.reverseAnswerExpansions = [];
    for (const [symbolId, alternatives] of this.answerExpansions) {
      for (const parts of alternatives) {
        this.reverseAnswerExpansions.push({ symbolId, parts });
      }
    }
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

  candidates(
    level: Level,
    low: number,
    high: number,
    includeSupplementaryChars = true,
  ): string[] {
    const key = `${level}|${low}|${high}|${includeSupplementaryChars ? 1 : 0}`;
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
        if (!includeSupplementaryChars && !this.isBasicPlaneCharacter(char)) {
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

  isBasicPlaneCharacter(char: string): boolean {
    const codePoint = char.codePointAt(0);
    return codePoint !== undefined && codePoint <= 0xffff;
  }

  accepted(way: number[]): Set<string> {
    const key = bagKey(way);
    const cached = this.acceptedCache.get(key);
    if (cached) {
      return cached;
    }

    const accepted = new Set<string>();
    const pending = [this.countParts(way)];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const target = pending.pop()!;
      const targetKey = this.countPartsKey(target);
      if (visited.has(targetKey)) {
        continue;
      }
      visited.add(targetKey);
      for (const char of this.byBag.get(this.countsBagKey(target)) ?? []) {
        accepted.add(char);
      }
      for (const expansion of this.reverseAnswerExpansions) {
        const source = this.consumeSubbag(target, expansion.parts);
        if (!source) {
          continue;
        }
        source.set(
          expansion.symbolId,
          (source.get(expansion.symbolId) ?? 0) + 1,
        );
        pending.push(source);
      }
    }
    this.acceptedCache.set(key, accepted);
    return accepted;
  }

  private validateAnswerCompatibility(): void {
    for (const [symbolId, alternatives] of this.answerExpansions) {
      if (!Number.isSafeInteger(symbolId) || !this.symbols.has(symbolId)) {
        throw new Error(`答案兼容规则引用了不存在的部件 ${symbolId}`);
      }
      if (alternatives.length === 0) {
        throw new Error(`答案兼容规则 ${symbolId} 没有展开方案`);
      }
      for (const alternative of alternatives) {
        if (alternative.length === 0) {
          throw new Error(`答案兼容规则 ${symbolId} 包含空拆法`);
        }
        for (const part of alternative) {
          if (!Number.isSafeInteger(part) || !this.symbols.has(part)) {
            throw new Error(
              `答案兼容规则 ${symbolId} 引用了不存在的部件 ${part}`,
            );
          }
        }
      }
    }

    const visiting = new Set<number>();
    const visited = new Set<number>();
    const visit = (symbolId: number): void => {
      if (visited.has(symbolId)) {
        return;
      }
      if (visiting.has(symbolId)) {
        throw new Error(`答案兼容规则存在循环：${symbolId}`);
      }
      visiting.add(symbolId);
      for (const alternative of this.answerExpansions.get(symbolId) ?? []) {
        for (const part of alternative) {
          if (this.answerExpansions.has(part)) {
            visit(part);
          }
        }
      }
      visiting.delete(symbolId);
      visited.add(symbolId);
    };
    for (const symbolId of this.answerExpansions.keys()) {
      visit(symbolId);
    }
  }

  private countParts(way: number[]): Map<number, number> {
    const counts = new Map<number, number>();
    for (const symbolId of way) {
      counts.set(symbolId, (counts.get(symbolId) ?? 0) + 1);
    }
    return counts;
  }

  private countPartsKey(counts: Map<number, number>): string {
    return [...counts.entries()]
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => left - right)
      .map(([symbolId, count]) => `${symbolId}:${count}`)
      .join(",");
  }

  private countsBagKey(counts: Map<number, number>): string {
    return [...counts.entries()]
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => left - right)
      .flatMap(([symbolId, count]) =>
        Array.from({ length: count }, () => symbolId),
      )
      .join(",");
  }

  private consumeSubbag(
    source: Map<number, number>,
    parts: number[],
  ): Map<number, number> | null {
    const remainder = new Map(source);
    for (const part of parts) {
      const count = remainder.get(part) ?? 0;
      if (count === 0) {
        return null;
      }
      if (count === 1) {
        remainder.delete(part);
      } else {
        remainder.set(part, count - 1);
      }
    }
    return remainder;
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
  const [symData, levelData, assetData, answerCompatibility] =
    await Promise.all([
      fetchJson<SymTable>("data/char_sym.json", baseUrl),
      fetchJson<LevelTable>("data/tongyong_hanzi.json", baseUrl),
      fetchJson<ComponentAssetTable>(
        "data/component-assets.json",
        baseUrl,
      ).catch(() => null),
      fetchJson<AnswerCompatibilityTable>(
        "data/char_sym_answer_compat.json",
        baseUrl,
      ),
    ]);
  return new GameData(
    symData,
    levelData,
    assetData,
    baseUrl,
    answerCompatibility,
  );
}

