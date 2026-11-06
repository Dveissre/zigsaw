export interface PinyinReading {
  marked: string;
  plain: string;
  tone: number;
  poly: boolean;
}

export interface PinyinData {
  chars: Record<string, PinyinReading[]>;
}

let pinyinDataPromise: Promise<PinyinData> | null = null;
let pinyinBaseUrl = "";

export function loadPinyinData(baseUrl: string): Promise<PinyinData> {
  if (pinyinDataPromise && pinyinBaseUrl === baseUrl) {
    return pinyinDataPromise;
  }
  pinyinBaseUrl = baseUrl;
  pinyinDataPromise = fetch(
    new URL("data/hanzi_pinyin12.json", baseUrl),
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `data/hanzi_pinyin12.json: HTTP ${response.status}`,
        );
      }
      const data = (await response.json()) as PinyinData;
      if (
        !data ||
        typeof data.chars !== "object" ||
        data.chars === null
      ) {
        throw new Error(
          "data/hanzi_pinyin12.json: invalid document",
        );
      }
      return data;
    })
    .catch((error: unknown) => {
      pinyinDataPromise = null;
      throw error;
    });
  return pinyinDataPromise;
}

export function normalizePinyinInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("ü", "v")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
}

export function acceptedPinyinFor(
  pinyin: PinyinData | null,
  char: string,
): string[] {
  const readings = pinyin?.chars[char] ?? [];
  return [
    ...new Set(
      readings.map((reading) =>
        normalizePinyinInput(reading.plain),
      ),
    ),
  ];
}

export function displayPinyinFor(
  pinyin: PinyinData | null,
  char: string,
): string {
  const readings = pinyin?.chars[char] ?? [];
  return [
    ...new Set(readings.map((reading) => reading.marked)),
  ].join(" / ");
}
