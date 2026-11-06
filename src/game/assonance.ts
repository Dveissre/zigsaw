import type { CompositionWordEntry } from "./composition";

export interface AssonanceData {
  format: "zigsaw-assonance-words/1";
  sourceHash: string;
  symbolHash: string;
  answerCompatibilityHash: string;
  weighting: string;
  words: Record<"2" | "3" | "4", string[]>;
  normal: CompositionWordEntry[];
  boss: CompositionWordEntry[];
}

let assonanceDataPromise: Promise<AssonanceData> | null =
  null;
let assonanceBaseUrl = "";

export function loadAssonanceData(
  baseUrl: string,
): Promise<AssonanceData> {
  if (
    assonanceDataPromise &&
    assonanceBaseUrl === baseUrl
  ) {
    return assonanceDataPromise;
  }
  assonanceBaseUrl = baseUrl;
  assonanceDataPromise = fetch(
    new URL("data/assonance-words.json", baseUrl),
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `data/assonance-words.json: HTTP ${response.status}`,
        );
      }
      const data = (await response.json()) as AssonanceData;
      if (
        !data ||
        data.format !== "zigsaw-assonance-words/1" ||
        !data.words ||
        !Array.isArray(data.normal) ||
        !Array.isArray(data.boss)
      ) {
        throw new Error(
          "data/assonance-words.json: invalid document",
        );
      }
      return data;
    })
    .catch((error: unknown) => {
      assonanceDataPromise = null;
      throw error;
    });
  return assonanceDataPromise;
}
