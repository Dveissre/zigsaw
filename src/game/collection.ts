const STORAGE_KEY = "zigsaw.collection.v1";

interface CollectionData {
  version: 1;
  chars: Record<string, number[][]>;
}

export interface CollectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function parseCollection(raw: string | null): CollectionData {
  if (!raw) {
    return { version: 1, chars: {} };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CollectionData>;
    if (
      parsed.version !== 1 ||
      typeof parsed.chars !== "object" ||
      parsed.chars === null
    ) {
      return { version: 1, chars: {} };
    }
    return {
      version: 1,
      chars: parsed.chars,
    };
  } catch {
    return { version: 1, chars: {} };
  }
}

const wayKey = (symbolIds: number[]): string =>
  [...symbolIds].sort((left, right) => left - right).join(",");

export class CollectionStore {
  private data: CollectionData;
  private componentIds = new Set<number>();

  constructor(
    private readonly storage: CollectionStorage = localStorage,
  ) {
    try {
      this.data = parseCollection(storage.getItem(STORAGE_KEY));
    } catch {
      this.data = { version: 1, chars: {} };
    }
    this.rebuildComponentIndex();
  }

  recordEncounter(char: string, symbolIds: number[]): void {
    const canonical = [...symbolIds].sort(
      (left, right) => left - right,
    );
    const ways = this.data.chars[char] ?? [];
    const key = wayKey(canonical);
    if (ways.some((way) => wayKey(way) === key)) {
      return;
    }
    this.data.chars[char] = [...ways, canonical];
    for (const symbolId of canonical) {
      this.componentIds.add(symbolId);
    }
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Collection state remains available for this page session.
    }
  }

  waysForChar(char: string): number[][] {
    return (this.data.chars[char] ?? []).map((way) => [...way]);
  }

  seenChars(): string[] {
    return Object.keys(this.data.chars);
  }

  hasComponent(symbolId: number): boolean {
    return this.componentIds.has(symbolId);
  }

  hasCharWithComponent(char: string, symbolId: number): boolean {
    return (this.data.chars[char] ?? []).some((way) =>
      way.includes(symbolId),
    );
  }

  private rebuildComponentIndex(): void {
    for (const ways of Object.values(this.data.chars)) {
      for (const way of ways) {
        for (const symbolId of way) {
          this.componentIds.add(symbolId);
        }
      }
    }
  }
}
