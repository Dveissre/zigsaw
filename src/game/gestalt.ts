export interface GestaltAnswer {
  char: string;
  level: number;
}

export interface GestaltPair {
  components: [number, number];
  answers: GestaltAnswer[];
}

export interface GestaltData {
  format: "zigsaw-gestalt-pairs/1";
  excludedComponents: string[];
  pairs: GestaltPair[];
}

let gestaltDataPromise: Promise<GestaltData> | null =
  null;
let gestaltBaseUrl = "";

export function loadGestaltData(
  baseUrl: string,
): Promise<GestaltData> {
  if (
    gestaltDataPromise &&
    gestaltBaseUrl === baseUrl
  ) {
    return gestaltDataPromise;
  }
  gestaltBaseUrl = baseUrl;
  gestaltDataPromise = fetch(
    new URL("data/gestalt-pairs.json", baseUrl),
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `data/gestalt-pairs.json: HTTP ${response.status}`,
        );
      }
      const data = (await response.json()) as GestaltData;
      if (
        !data ||
        data.format !== "zigsaw-gestalt-pairs/1" ||
        !Array.isArray(data.pairs)
      ) {
        throw new Error(
          "data/gestalt-pairs.json: invalid document",
        );
      }
      return data;
    })
    .catch((error: unknown) => {
      gestaltDataPromise = null;
      throw error;
    });
  return gestaltDataPromise;
}
