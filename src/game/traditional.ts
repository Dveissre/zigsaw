export interface TraditionalData {
  chars: Record<string, string[]>;
}

let traditionalDataPromise: Promise<TraditionalData> | null =
  null;
let traditionalBaseUrl = "";

export function loadTraditionalData(
  baseUrl: string,
): Promise<TraditionalData> {
  if (
    traditionalDataPromise &&
    traditionalBaseUrl === baseUrl
  ) {
    return traditionalDataPromise;
  }
  traditionalBaseUrl = baseUrl;
  traditionalDataPromise = fetch(
    new URL("data/tongyong12_trad.json", baseUrl),
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `data/tongyong12_trad.json: HTTP ${response.status}`,
        );
      }
      const data = (await response.json()) as TraditionalData;
      if (
        !data ||
        typeof data.chars !== "object" ||
        data.chars === null
      ) {
        throw new Error(
          "data/tongyong12_trad.json: invalid document",
        );
      }
      return data;
    })
    .catch((error: unknown) => {
      traditionalDataPromise = null;
      throw error;
    });
  return traditionalDataPromise;
}
