export interface CharDetailQuote {
  text: string;
  book?: string;
}

export interface CharDetailWord {
  word: string;
  text?: string;
  example?: string;
  refer?: string;
  pinyin?: string;
}

export interface CharDetailExplanation {
  content?: string;
  same?: string;
  example?: string;
  refer?: string;
  modern?: string;
  speech?: string;
  pinyin?: string;
  simplified?: string;
  variant?: string;
  typo?: string;
  unknown?: boolean;
  detail?: CharDetailQuote[];
  words?: CharDetailWord[];
}

export interface CharDetailPronunciation {
  pinyin: string;
  explanations: CharDetailExplanation[];
}

export interface CharDetail {
  char: string;
  index?: number;
  pronunciations: CharDetailPronunciation[];
}

export interface SchoolMetadata {
  read?: string[];
  write?: string[];
}

function buildDetailIndex(raw: unknown): Map<string, CharDetail> {
  if (!Array.isArray(raw)) {
    throw new Error("char_detail.json: expected an array");
  }

  const index = new Map<string, CharDetail>();
  for (const entry of raw) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("char" in entry) ||
      typeof entry.char !== "string" ||
      !("pronunciations" in entry) ||
      !Array.isArray(entry.pronunciations)
    ) {
      continue;
    }
    index.set(entry.char, entry as CharDetail);
  }
  return index;
}

export class CharDetailStore {
  private readonly baseUrl: string;
  private readonly shardLoads = new Map<
    number,
    Promise<Map<string, CharDetail>>
  >();
  private schoolLoad: Promise<Map<string, SchoolMetadata>> | null = null;
  private readonly cacheName = "zigsaw-char-detail-shards-v1";

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async get(char: string): Promise<CharDetail | null> {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) {
      return null;
    }
    const shard = codePoint & 0xff;
    let load = this.shardLoads.get(shard);
    if (!load) {
      load = this.loadShard(shard).catch((error: unknown) => {
        this.shardLoads.delete(shard);
        throw error;
      });
      this.shardLoads.set(shard, load);
    }
    return (await load).get(char) ?? null;
  }

  async school(char: string): Promise<SchoolMetadata | null> {
    this.schoolLoad ??= this.loadSchoolIndex().catch((error: unknown) => {
      this.schoolLoad = null;
      throw error;
    });
    return (await this.schoolLoad).get(char) ?? null;
  }

  private async loadShard(shard: number): Promise<Map<string, CharDetail>> {
    const filename = `${shard.toString(16).padStart(2, "0")}.json`;
    const url = new URL(
      `data/char-detail/${filename}`,
      this.baseUrl,
    );
    const response = await this.fetchCached(url);
    if (!response.ok) {
      throw new Error(`char-detail/${filename}: HTTP ${response.status}`);
    }
    return buildDetailIndex((await response.json()) as unknown);
  }

  private async loadSchoolIndex(): Promise<Map<string, SchoolMetadata>> {
    const response = await this.fetchCached(
      new URL("data/char-school.json", this.baseUrl),
    );
    if (!response.ok) {
      throw new Error(`char-school.json: HTTP ${response.status}`);
    }
    const raw = (await response.json()) as unknown;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error("char-school.json: expected an object");
    }
    return new Map(Object.entries(raw as Record<string, SchoolMetadata>));
  }

  private async fetchCached(url: URL): Promise<Response> {
    if (import.meta.env.DEV || !("caches" in globalThis)) {
      return fetch(url, { cache: "no-cache" });
    }

    try {
      const cache = await caches.open(this.cacheName);
      const cached = await cache.match(url);
      if (cached) {
        return cached;
      }
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response.clone());
      }
      return response;
    } catch {
      return fetch(url);
    }
  }
}
