export type ComponentRarity = "N" | "R" | "SR" | "SSR" | "UR";

export interface AtlasCharacterReference {
  char: string;
  level: 1 | 2 | 3;
  rank: number;
  isSelf?: boolean;
}

export interface AtlasComponent {
  symbolId: number;
  name: string;
  asset?: string;
  rarity: ComponentRarity;
  count: number;
  charCount: number;
  milestones: number[];
  chars: AtlasCharacterReference[];
}

export interface ComponentAtlasData {
  format: "zigsaw-component-atlas/1";
  thresholds: Record<ComponentRarity, number>;
  characterCount: number;
  componentCount: number;
  totalUsageCount: number;
  byRarity: Record<ComponentRarity, number>;
  components: AtlasComponent[];
}

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
