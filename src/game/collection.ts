const STORAGE_KEY = "zigsaw.collection.v2";
const LEGACY_STORAGE_KEY = "zigsaw.collection.v1";

interface CollectionData {
  version: 2;
  sourceHash: string;
  chars: Record<string, number[]>;
  externalChars: string[];
  directComponents: number[];
}

interface LegacyCollectionData {
  version: 1;
  chars: Record<string, number[][]>;
}

export interface CollectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function componentCompletionPercentage({
  rarity,
  isExclusive,
  progressCharCount,
  collectedNormal,
  collectedExternal,
}: {
  rarity: string;
  isExclusive: boolean;
  progressCharCount: number;
  collectedNormal: number;
  collectedExternal: number;
}): number {
  if (rarity === "XR" || progressCharCount <= 0) {
    return 0;
  }
  const weightedCollected = isExclusive
    ? collectedExternal
    : collectedNormal + collectedExternal * 0.1;
  return Math.min(
    100,
    (weightedCollected / progressCharCount) * 100,
  );
}

function parseCollection(raw: string | null): CollectionData | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CollectionData>;
    if (
      parsed.version !== 2 ||
      typeof parsed.chars !== "object" ||
      parsed.chars === null
    ) {
      return null;
    }
    const chars = Object.fromEntries(
      Object.entries(parsed.chars).map(([char, componentIds]) => [
        char,
        [
          ...new Set(
            Array.isArray(componentIds)
              ? componentIds.filter(
                  (symbolId): symbolId is number =>
                    typeof symbolId === "number",
                )
              : [],
          ),
        ].sort((left, right) => left - right),
      ]),
    );
    return {
      version: 2,
      sourceHash:
        typeof parsed.sourceHash === "string"
          ? parsed.sourceHash
          : "",
      chars,
      externalChars: Array.isArray(parsed.externalChars)
        ? [
            ...new Set(
              parsed.externalChars.filter(
                (char): char is string =>
                  typeof char === "string" && char in chars,
              ),
            ),
          ]
        : [],
      directComponents: Array.isArray(parsed.directComponents)
        ? [
            ...new Set(
              parsed.directComponents.filter(
                (symbolId): symbolId is number =>
                  typeof symbolId === "number",
              ),
            ),
          ].sort((left, right) => left - right)
        : [],
    };
  } catch {
    return null;
  }
}

function migrateLegacyCollection(
  raw: string | null,
): CollectionData | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LegacyCollectionData>;
    if (
      parsed.version !== 1 ||
      typeof parsed.chars !== "object" ||
      parsed.chars === null
    ) {
      return null;
    }
    const chars: Record<string, number[]> = {};
    for (const [char, ways] of Object.entries(parsed.chars)) {
      chars[char] = [
        ...new Set(
          ways.flatMap((way) =>
            way.filter(
              (symbolId): symbolId is number =>
                typeof symbolId === "number",
            ),
          ),
        ),
      ].sort((left, right) => left - right);
    }
    return {
      version: 2,
      sourceHash: "",
      chars,
      externalChars: [],
      directComponents: [],
    };
  } catch {
    return null;
  }
}

export class CollectionStore {
  private data: CollectionData;
  private componentIds = new Set<number>();
  private componentCounts = new Map<number, number>();
  private externalComponentCounts = new Map<number, number>();
  private currentWays: ReadonlyMap<string, number[][]> | null = null;

  constructor(
    private readonly storage: CollectionStorage = localStorage,
  ) {
    try {
      const stored = storage.getItem(STORAGE_KEY);
      this.data =
        parseCollection(stored) ??
        migrateLegacyCollection(
          storage.getItem(LEGACY_STORAGE_KEY),
        ) ??
        {
          version: 2,
          sourceHash: "",
          chars: {},
          externalChars: [],
          directComponents: [],
        };
    } catch {
      this.data = {
        version: 2,
        sourceHash: "",
        chars: {},
        externalChars: [],
        directComponents: [],
      };
    }
    this.rebuildComponentIndex();
    this.persist();
  }

  recordEncounter(
    char: string,
    symbolIds: number[],
    isExternal = false,
    expandToAllWays = true,
  ): void {
    if (char in this.data.chars) {
      return;
    }
    const current = expandToAllWays
      ? this.currentWays?.get(char) ?? []
      : [];
    const componentIds = new Set(
      (current.length ? current : [symbolIds]).flatMap((way) =>
        way.map((symbolId) => Number(symbolId)),
      ),
    );
    this.data.chars[char] = [...componentIds].sort(
      (left, right) => left - right,
    );
    if (isExternal) {
      this.data.externalChars = [
        ...new Set([...this.data.externalChars, char]),
      ];
    }
    this.rebuildComponentIndex();
    this.persist();
  }

  recordComponent(symbolId: number): void {
    if (this.data.directComponents.includes(symbolId)) {
      return;
    }
    this.data.directComponents = [
      ...this.data.directComponents,
      symbolId,
    ].sort((left, right) => left - right);
    this.componentIds.add(symbolId);
    this.persist();
  }

  componentsForChar(char: string): number[] {
    return [...(this.data.chars[char] ?? [])];
  }

  seenChars(): string[] {
    return Object.keys(this.data.chars);
  }

  hasSeenChar(char: string): boolean {
    return char in this.data.chars;
  }

  hasComponent(symbolId: number): boolean {
    return this.componentIds.has(symbolId);
  }

  hasCharWithComponent(char: string, symbolId: number): boolean {
    return (this.data.chars[char] ?? []).includes(symbolId);
  }

  isExternalChar(char: string): boolean {
    return this.data.externalChars.includes(char);
  }

  collectedNormalCountForComponent(
    symbolId: number,
    selfChar?: string,
  ): number {
    const selfCounts =
      selfChar &&
      !this.isExternalChar(selfChar) &&
      this.hasCharWithComponent(selfChar, symbolId)
        ? 1
        : 0;
    return Math.max(
      0,
      (this.componentCounts.get(symbolId) ?? 0) -
        (this.externalComponentCounts.get(symbolId) ?? 0) -
        selfCounts,
    );
  }

  collectedExternalCountForComponent(symbolId: number): number {
    return this.data.externalChars.filter((char) =>
      this.hasCharWithComponent(char, symbolId),
    ).length;
  }

  needsReconcile(sourceHash: string): boolean {
    return (
      this.data.sourceHash !== sourceHash &&
      this.seenChars().length > 0
    );
  }

  setSourceHash(sourceHash: string): void {
    if (this.data.sourceHash === sourceHash) {
      return;
    }
    this.data.sourceHash = sourceHash;
    this.persist();
  }

  reconcile(
    ways: ReadonlyMap<string, number[][]>,
    componentName: (symbolId: number) => string,
    sourceHash?: string,
    isExternalChar: (char: string) => boolean = () => false,
  ): boolean {
    this.currentWays = ways;
    const nextChars: Record<string, number[]> = {};
    for (const char of this.seenChars()) {
      const componentIds = new Set<number>();
      for (const way of ways.get(char) ?? []) {
        for (const symbolId of way) {
          if (componentName(symbolId) !== "?") {
            componentIds.add(symbolId);
          }
        }
      }
      nextChars[char] = [...componentIds].sort(
        (left, right) => left - right,
      );
    }
    this.data.chars = nextChars;
    this.data.externalChars = this.seenChars().filter(
      (char) => isExternalChar(char),
    );
    this.data.sourceHash =
      sourceHash ?? this.data.sourceHash;
    this.rebuildComponentIndex();
    this.persist();
    return true;
  }

  private rebuildComponentIndex(): void {
    this.componentIds.clear();
    this.componentCounts.clear();
    this.externalComponentCounts.clear();
    for (const symbolId of this.data.directComponents) {
      this.componentIds.add(symbolId);
    }
    for (const [char, componentIds] of Object.entries(this.data.chars)) {
      for (const symbolId of componentIds) {
        this.componentIds.add(symbolId);
        this.componentCounts.set(
          symbolId,
          (this.componentCounts.get(symbolId) ?? 0) + 1,
        );
        if (this.isExternalChar(char)) {
          this.externalComponentCounts.set(
            symbolId,
            (this.externalComponentCounts.get(symbolId) ?? 0) +
              1,
          );
        }
      }
    }
  }

  private persist(): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Collection state remains available for this page session.
    }
  }
}
