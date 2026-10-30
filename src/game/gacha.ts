import type {
  AtlasComponentSummary,
  ComponentRarity,
} from "./atlas";
import type { GameData } from "./data";

export const GACHA_COST = 100;
export const GACHA_HAND_SIZE = 10;

export const GACHA_RARITIES: ComponentRarity[] = [
  "N",
  "R",
  "SR",
  "SSR",
  "UR",
  "XR",
];

const rarityWeights: Array<[ComponentRarity, number]> = [
  ["N", 0.33],
  ["R", 0.45],
  ["SR", 0.12],
  ["SSR", 0.06],
  ["UR", 0.03],
  ["XR", 0.01],
];

interface DrawWay {
  char: string;
  way: number[];
  maxRarity: ComponentRarity;
  weight: number;
}

export interface GachaCard {
  uid: number;
  symbolId: number;
  rarity: ComponentRarity;
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
          weight: this.characterWeight(char),
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
    const cards: GachaCard[] = [];
    const seed = this.drawDecomposition(GACHA_HAND_SIZE);
    if (!seed) {
      throw new Error("没有可抽取的汉字拆法");
    }
    cards.push(...this.cardsForWay(seed.way));

    while (GACHA_HAND_SIZE - cards.length > 3) {
      const remaining = GACHA_HAND_SIZE - cards.length;
      const next = this.drawDecomposition(remaining);
      if (!next) {
        break;
      }
      cards.push(...this.cardsForWay(next.way));
    }

    while (cards.length < GACHA_HAND_SIZE) {
      cards.push(this.randomCard());
    }

    return this.shuffle(cards);
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
      const component =
        candidates[
          Math.floor(this.random() * candidates.length)
        ];
      const matching = (
        this.waysBySymbol.get(component.symbolId) ?? []
      ).filter(
        (entry) =>
          entry.way.length <= slots &&
          entry.maxRarity === rarity,
      );
      if (matching.length > 0) {
        return this.pickWeightedWay(matching);
      }
    }
    const fallback = this.drawableWays.filter(
      (entry) => entry.way.length <= slots,
    );
    return fallback.length > 0
      ? fallback[Math.floor(this.random() * fallback.length)]
      : null;
  }

  private rollRarity(): ComponentRarity {
    let target = this.random();
    for (const [rarity, weight] of rarityWeights) {
      target -= weight;
      if (target <= 0) {
        return rarity;
      }
    }
    return "XR";
  }

  private characterWeight(char: string): number {
    const level = this.data.levels.get(char);
    if (level === 1) {
      return 20;
    }
    if (level === 2) {
      return 15;
    }
    if (level === 3) {
      return 10;
    }
    return 4;
  }

  private pickWeightedWay(ways: DrawWay[]): DrawWay {
    const total = ways.reduce(
      (sum, entry) => sum + entry.weight,
      0,
    );
    let target = this.random() * total;
    for (const entry of ways) {
      target -= entry.weight;
      if (target <= 0) {
        return entry;
      }
    }
    return ways[ways.length - 1];
  }

  private randomCard(): GachaCard {
    const rarity = this.rollRarity();
    const group =
      this.cardsByRarity.get(rarity) ??
      this.cardsByRarity.get("N") ??
      [];
    if (group.length === 0) {
      throw new Error("没有可用的部件卡");
    }
    const component =
      group[Math.floor(this.random() * group.length)];
    return {
      uid: this.cardUid++,
      symbolId: component.symbolId,
      rarity: component.rarity,
    };
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
