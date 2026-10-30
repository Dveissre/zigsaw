import type {
  AtlasComponentSummary,
  ComponentRarity,
} from "./atlas";
import type { GameData } from "./data";

export const GACHA_COST = 20;
export const GACHA_HAND_SIZE = 10;

export const GACHA_RARITIES: ComponentRarity[] = [
  "N",
  "R",
  "SR",
  "SSR",
  "UR",
  "XR",
];

export const GACHA_RARITY_WEIGHTS: Record<
  ComponentRarity,
  number
> = {
  N: 0.32,
  R: 0.45,
  SR: 0.17,
  SSR: 0.04,
  UR: 0.015,
  XR: 0.005,
};

export const GACHA_CHARACTER_CLASS_WEIGHTS = {
  level1: 40,
  level2: 30,
  level3: 20,
  external: 4,
} as const;

type CharacterClass =
  keyof typeof GACHA_CHARACTER_CLASS_WEIGHTS;

interface DrawWay {
  char: string;
  way: number[];
  maxRarity: ComponentRarity;
  characterClass: CharacterClass;
}

export interface GachaCard {
  uid: number;
  symbolId: number;
  rarity: ComponentRarity;
}

export interface GachaDrawTrace {
  decompositions: Array<{
    char: string;
    way: number[];
    rarity: ComponentRarity;
  }>;
  fillerCards: Array<{
    symbolId: number;
    rarity: ComponentRarity;
  }>;
}

export interface GachaSubmission {
  char: string;
  way: number[];
  remainingCards: GachaCard[];
  usedUids: number[];
}

const bagKey = (symbolIds: number[]): string =>
  [...symbolIds].sort((left, right) => left - right).join(",");

const rarityRank = (rarity: ComponentRarity): number =>
  GACHA_RARITIES.indexOf(rarity);

function pickUniform<T>(
  items: T[],
  random: () => number,
): T {
  return items[Math.floor(random() * items.length)];
}

export function componentDrawWeights(
  components: AtlasComponentSummary[],
  rarity: ComponentRarity,
): number[] {
  if (rarity === "XR" || components.length === 0) {
    return components.map(() => 1);
  }
  const nonExclusive = components.filter(
    (component) => !component.isExclusive,
  );
  const exclusive = components.filter(
    (component) => component.isExclusive,
  );
  if (
    nonExclusive.length === 0 ||
    exclusive.length === 0
  ) {
    return components.map(() => 1);
  }

  const nonExclusiveWeight = nonExclusive.length * 4;
  const nativeExclusiveWeight = exclusive.length;
  const cappedExclusiveWeight = Math.min(
    nativeExclusiveWeight,
    nonExclusiveWeight / 4,
  );
  const exclusiveWeight =
    cappedExclusiveWeight / exclusive.length;
  return components.map((component) =>
    component.isExclusive ? exclusiveWeight : 4,
  );
}

export class GachaDrawer {
  private readonly cardBySymbol = new Map<
    number,
    AtlasComponentSummary
  >();
  private readonly cardsByRarity = new Map<
    ComponentRarity,
    AtlasComponentSummary[]
  >();
  private readonly waysBySymbol = new Map<number, DrawWay[]>();
  private readonly drawableWays: DrawWay[] = [];
  private readonly bagIndex = new Set<string>();
  private drawTrace: GachaDrawTrace | null = null;
  private cardUid = 0;

  constructor(
    private readonly data: GameData,
    components: AtlasComponentSummary[],
    private readonly random: () => number = Math.random,
  ) {
    for (const component of components) {
      if (!this.renderable(component)) {
        continue;
      }
      this.cardBySymbol.set(component.symbolId, component);
      const group =
        this.cardsByRarity.get(component.rarity) ?? [];
      group.push(component);
      this.cardsByRarity.set(component.rarity, group);
    }

    for (const [char, ways] of data.ways) {
      for (const way of ways) {
        if (
          way.length < 1 ||
          way.length > GACHA_HAND_SIZE ||
          !way.every((symbolId) =>
            this.cardBySymbol.has(symbolId),
          )
        ) {
          continue;
        }
        const highest = way.reduce(
          (current, symbolId) => {
            const rarity =
              this.cardBySymbol.get(symbolId)?.rarity ?? "N";
            return rarityRank(rarity) > rarityRank(current)
              ? rarity
              : current;
          },
          "N" as ComponentRarity,
        );
        this.bagIndex.add(bagKey(way));
        if (way.length < 2) {
          continue;
        }
        const entry = {
          char,
          way: [...way],
          maxRarity: highest,
          characterClass: this.characterClass(char),
        };
        this.drawableWays.push(entry);
        for (const symbolId of new Set(way)) {
          const group =
            this.waysBySymbol.get(symbolId) ?? [];
          group.push(entry);
          this.waysBySymbol.set(symbolId, group);
        }
      }
    }
  }

  draw(): GachaCard[] {
    this.drawTrace = {
      decompositions: [],
      fillerCards: [],
    };
    const cards: GachaCard[] = [];
    const seed = this.drawDecomposition(GACHA_HAND_SIZE);
    if (!seed) {
      throw new Error("没有可抽取的汉字拆法");
    }
    this.recordDecomposition(seed);
    cards.push(...this.cardsForWay(seed.way));

    while (
      cards.length < GACHA_HAND_SIZE - 1 &&
      GACHA_HAND_SIZE - cards.length > 3
    ) {
      const remaining = GACHA_HAND_SIZE - cards.length;
      const next = this.drawDecomposition(remaining);
      if (!next) {
        break;
      }
      this.recordDecomposition(next);
      cards.push(...this.cardsForWay(next.way));
    }

    while (cards.length < GACHA_HAND_SIZE) {
      const forceRarity =
        !cards.some((card) => card.rarity === "R") &&
        GACHA_HAND_SIZE - cards.length === 1
          ? "R"
          : undefined;
      const filler = this.randomFillerCard(forceRarity);
      cards.push(filler);
      this.drawTrace.fillerCards.push({
        symbolId: filler.symbolId,
        rarity: filler.rarity,
      });
    }

    if (!cards.some((card) => card.rarity === "R")) {
      const replacement = this.randomFillerCard("R");
      cards[Math.floor(this.random() * cards.length)] =
        replacement;
      this.drawTrace.fillerCards.push({
        symbolId: replacement.symbolId,
        rarity: replacement.rarity,
      });
    }

    return this.shuffle(cards);
  }

  get lastTrace(): GachaDrawTrace | null {
    return this.drawTrace;
  }

  findSubmission(
    char: string,
    cards: GachaCard[],
  ): GachaSubmission | null {
    const ways = [...(this.data.ways.get(char) ?? [])]
      .filter(
        (way) =>
          way.length >= 1 && way.length <= cards.length,
      )
      .sort((left, right) => left.length - right.length);
    for (const way of ways) {
      const selected = this.selectCards(way, cards);
      if (!selected) {
        continue;
      }
      const selectedSet = new Set(selected.map((card) => card.uid));
      return {
        char,
        way,
        remainingCards: cards.filter(
          (card) => !selectedSet.has(card.uid),
        ),
        usedUids: [...selectedSet],
      };
    }
    return null;
  }

  hasPossibleWord(cards: GachaCard[]): boolean {
    if (cards.length < 1) {
      return false;
    }
    const limit = 1 << cards.length;
    for (let mask = 1; mask < limit; mask += 1) {
      let bitCount = 0;
      const symbolIds: number[] = [];
      for (let index = 0; index < cards.length; index += 1) {
        if (mask & (1 << index)) {
          bitCount += 1;
          symbolIds.push(cards[index].symbolId);
        }
      }
      if (bitCount >= 1 && this.bagIndex.has(bagKey(symbolIds))) {
        return true;
      }
    }
    return false;
  }

  private renderable(component: AtlasComponentSummary): boolean {
    return Boolean(
      component.asset ||
        ([...component.name].length === 1 &&
          component.name !== "?" &&
          component.name !== "？"),
    );
  }

  private drawDecomposition(
    slots: number,
  ): DrawWay | null {
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const rarity = this.rollRarity();
      const candidates =
        this.cardsByRarity.get(rarity) ?? [];
      if (candidates.length === 0) {
        continue;
      }
      const component = this.pickComponent(candidates, rarity);
      const matching = (
        this.waysBySymbol.get(component.symbolId) ?? []
      ).filter(
        (entry) =>
          entry.way.length <= slots &&
          entry.maxRarity === rarity,
      );
      if (matching.length > 0) {
        return this.pickDecomposition(matching);
      }
    }
    const fallback = this.drawableWays.filter(
      (entry) => entry.way.length <= slots,
    );
    return fallback.length > 0
      ? this.pickDecomposition(fallback)
      : null;
  }

  private rollRarity(): ComponentRarity {
    let target = this.random();
    for (const rarity of GACHA_RARITIES) {
      target -= GACHA_RARITY_WEIGHTS[rarity];
      if (target <= 0) {
        return rarity;
      }
    }
    return "XR";
  }

  private characterClass(char: string): CharacterClass {
    const level = this.data.levels.get(char);
    if (level === 1) {
      return "level1";
    }
    if (level === 2) {
      return "level2";
    }
    if (level === 3) {
      return "level3";
    }
    return "external";
  }

  private pickComponent(
    components: AtlasComponentSummary[],
    rarity: ComponentRarity,
  ): AtlasComponentSummary {
    const weights = componentDrawWeights(components, rarity);
    const total = weights.reduce(
      (sum, weight) => sum + weight,
      0,
    );
    let target = this.random() * total;
    for (let index = 0; index < components.length; index += 1) {
      target -= weights[index];
      if (target <= 0) {
        return components[index];
      }
    }
    return components[components.length - 1];
  }

  private pickDecomposition(ways: DrawWay[]): DrawWay {
    const waysByClass = new Map<CharacterClass, DrawWay[]>();
    for (const way of ways) {
      const group = waysByClass.get(way.characterClass) ?? [];
      group.push(way);
      waysByClass.set(way.characterClass, group);
    }
    const availableClasses = [
      ...waysByClass.keys(),
    ] as CharacterClass[];
    const total = availableClasses.reduce(
      (sum, characterClass) =>
        sum + GACHA_CHARACTER_CLASS_WEIGHTS[characterClass],
      0,
    );
    let target = this.random() * total;
    let selectedClass =
      availableClasses[availableClasses.length - 1];
    for (const characterClass of availableClasses) {
      target -= GACHA_CHARACTER_CLASS_WEIGHTS[characterClass];
      if (target <= 0) {
        selectedClass = characterClass;
        break;
      }
    }
    return pickUniform(waysByClass.get(selectedClass)!, this.random);
  }

  private randomFillerCard(
    forcedRarity?: "R",
  ): GachaCard {
    const rarity = forcedRarity ?? this.rollFillerRarity();
    const group =
      this.cardsByRarity.get(rarity) ??
      [];
    if (group.length === 0) {
      throw new Error("没有可用的部件卡");
    }
    const component = this.pickComponent(group, rarity);
    return {
      uid: this.cardUid++,
      symbolId: component.symbolId,
      rarity: component.rarity,
    };
  }

  private rollFillerRarity(): "N" | "R" {
    const total =
      GACHA_RARITY_WEIGHTS.N + GACHA_RARITY_WEIGHTS.R;
    return this.random() * total <= GACHA_RARITY_WEIGHTS.N
      ? "N"
      : "R";
  }

  private recordDecomposition(way: DrawWay): void {
    if (!this.drawTrace) {
      return;
    }
    this.drawTrace.decompositions.push({
      char: way.char,
      way: [...way.way],
      rarity: way.maxRarity,
    });
  }

  private cardsForWay(way: number[]): GachaCard[] {
    return way.map((symbolId) => {
      const component = this.cardBySymbol.get(symbolId);
      if (!component) {
        throw new Error("拆法包含无法展示的部件");
      }
      return {
        uid: this.cardUid++,
        symbolId,
        rarity: component.rarity,
      };
    });
  }

  private selectCards(
    way: number[],
    cards: GachaCard[],
  ): GachaCard[] | null {
    const selected: GachaCard[] = [];
    const used = new Set<number>();
    for (const symbolId of way) {
      const card = cards.find(
        (candidate) =>
          candidate.symbolId === symbolId &&
          !used.has(candidate.uid),
      );
      if (!card) {
        return null;
      }
      used.add(card.uid);
      selected.push(card);
    }
    return selected;
  }

  private shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(
        this.random() * (index + 1),
      );
      [result[index], result[swapIndex]] = [
        result[swapIndex],
        result[index],
      ];
    }
    return result;
  }
}
