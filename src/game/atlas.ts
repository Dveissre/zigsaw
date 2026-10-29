export type ComponentRarity =
  | "N"
  | "R"
  | "SR"
  | "SSR"
  | "UR"
  | "XR";

export interface AtlasCharacterReference {
  char: string;
  level: 1 | 2 | 3;
  rank: number;
  isSelf?: boolean;
  isExternal?: boolean;
  isEx?: boolean;
  isUnreachable?: boolean;
}

export interface AtlasComponentSummary {
  symbolId: number;
  name: string;
  asset?: string;
  rarity: ComponentRarity;
  count: number;
  charCount: number;
  progressCharCount: number;
  exCharCount: number;
  selfChar?: string;
  isExclusive?: boolean;
  milestones: number[];
}

export interface ComponentAtlasData {
  format: "zigsaw-component-atlas/3";
  sourceHash: string;
  thresholds: Record<ComponentRarity, number>;
  characterCount: number;
  componentCount: number;
  exclusiveCount: number;
  xrCount: number;
  totalRelatedCharacterCount: number;
  byRarity: Record<ComponentRarity, number>;
  components: AtlasComponentSummary[];
}

interface ComponentCharacterShard {
  format: "zigsaw-component-characters/1";
  shard: number;
  components: Array<{
    symbolId: number;
    chars: AtlasCharacterReference[];
  }>;
}

const characterShardLoads = new Map<
  string,
  Promise<ComponentCharacterShard>
>();

export async function loadComponentAtlas(
  baseUrl: string,
): Promise<ComponentAtlasData> {
  const response = await fetch(
    new URL("../data/component-atlas.json", baseUrl),
  );
  if (!response.ok) {
    throw new Error(
      `component-atlas.json: HTTP ${response.status}`,
    );
  }
  return (await response.json()) as ComponentAtlasData;
}

export async function loadComponentCharacters(
  baseUrl: string,
  symbolId: number,
): Promise<AtlasCharacterReference[]> {
  const shard = symbolId % 16;
  const url = new URL(
    `../data/component-atlas/${shard}.json`,
    baseUrl,
  ).href;
  let load = characterShardLoads.get(url);
  if (!load) {
    load = fetch(url).then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `component-atlas/${shard}.json: HTTP ${response.status}`,
        );
      }
      return (await response.json()) as ComponentCharacterShard;
    });
    characterShardLoads.set(url, load);
  }
  let data: ComponentCharacterShard;
  try {
    data = await load;
  } catch (error) {
    characterShardLoads.delete(url);
    throw error;
  }
  return (
    data.components.find(
      (component) => component.symbolId === symbolId,
    )?.chars ?? []
  );
}
