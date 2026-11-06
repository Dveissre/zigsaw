export interface WordAnswerData {
  format: "zigsaw-word-answers/1";
  sourceHash: string;
  symbolsHash: string;
  words: Record<"2" | "3" | "4", string[]>;
}

let wordAnswerPromise: Promise<WordAnswerData> | null = null;
let wordAnswerBaseUrl = "";

export function loadWordAnswerData(
  baseUrl: string,
): Promise<WordAnswerData> {
  if (
    wordAnswerPromise &&
    wordAnswerBaseUrl === baseUrl
  ) {
    return wordAnswerPromise;
  }
  wordAnswerBaseUrl = baseUrl;
  wordAnswerPromise = fetch(
    new URL("data/word-answers.json", baseUrl),
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `data/word-answers.json: HTTP ${response.status}`,
        );
      }
      const data = (await response.json()) as WordAnswerData;
      if (
        !data ||
        data.format !== "zigsaw-word-answers/1" ||
        !data.words
      ) {
        throw new Error(
          "data/word-answers.json: invalid document",
        );
      }
      return data;
    })
    .catch((error: unknown) => {
      wordAnswerPromise = null;
      throw error;
    });
  return wordAnswerPromise;
}
