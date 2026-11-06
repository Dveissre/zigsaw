export interface CompositionWordEntry {
  word: string;
  weight: number;
  recipes: number[][][];
}

export interface CompositionData {
  format: "zigsaw-composition-words/1";
  sourceHash: string;
  symbolHash: string;
  answerCompatibilityHash: string;
  weighting: string;
  words: Record<"2" | "3" | "4", string[]>;
  normal: CompositionWordEntry[];
  boss: CompositionWordEntry[];
}

let compositionDataPromise: Promise<CompositionData> | null =
  null;
let compositionBaseUrl = "";

export function loadCompositionData(
  baseUrl: string,
): Promise<CompositionData> {
  if (
    compositionDataPromise &&
    compositionBaseUrl === baseUrl
  ) {
    return compositionDataPromise;
  }
  compositionBaseUrl = baseUrl;
  compositionDataPromise = fetch(
    new URL("data/composition-words.json", baseUrl),
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `data/composition-words.json: HTTP ${response.status}`,
        );
      }
      const data = (await response.json()) as CompositionData;
      if (
        !data ||
        data.format !== "zigsaw-composition-words/1" ||
        !data.words ||
        !Array.isArray(data.normal) ||
        !Array.isArray(data.boss)
      ) {
        throw new Error(
          "data/composition-words.json: invalid document",
        );
      }
      return data;
    })
    .catch((error: unknown) => {
      compositionDataPromise = null;
      throw error;
    });
  return compositionDataPromise;
}
