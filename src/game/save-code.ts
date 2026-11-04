import type {
  ChallengeDifficulty,
  GameData,
  Level,
} from "./data";
import {
  applySaveArchive,
  type SaveStorage,
} from "./save";

const CODE_PREFIX = "ZSC1.";
const PAYLOAD_VERSION = 1;
const MAX_CODE_LENGTH = 1_000_000;
const MAX_CHARACTERS = 20_000;
const MAX_COMPONENTS = 20_000;
const MAX_RECORDS = 5_000;
const MAX_TRIAL_CHARS = 100;
const ENCRYPTION_SALT = "zigsaw.save.encryption.v1";

type ChallengeRecord = {
  mode: "challenge";
  hasDifficulty: boolean;
  difficulty: ChallengeDifficulty;
  questions: number;
  size: number;
  shift: number;
  seconds: number;
  ex: boolean;
  hasEx: boolean;
  value: number;
};

type EndlessRecord = {
  mode: "endless";
  levels: Level[];
  partsLow: number;
  partsHigh: number;
  seconds: number;
  value: number;
};

type RawRecord = {
  mode: "raw";
  key: string;
  value: number;
};

export type CompactSaveRecord =
  | ChallengeRecord
  | EndlessRecord
  | RawRecord;

export interface CompactSaveState {
  seenChars: string[];
  directComponents: number[];
  records: CompactSaveRecord[];
  cris: number;
  trialRecentLongChars: string[];
}

class ByteWriter {
  readonly bytes: number[] = [];

  u8(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
      throw new Error("存档码整数超出范围");
    }
    this.bytes.push(value);
  }

  uvarint(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("存档码整数超出范围");
    }
    do {
      let byte = value & 0x7f;
      value = Math.floor(value / 128);
      if (value > 0) {
        byte |= 0x80;
      }
      this.bytes.push(byte);
    } while (value > 0);
  }

  text(value: string): void {
    const bytes = new TextEncoder().encode(value);
    this.uvarint(bytes.length);
    this.bytes.push(...bytes);
  }
}

class ByteReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  u8(): number {
    if (this.offset >= this.bytes.length) {
      throw new Error("存档码正文不完整");
    }
    return this.bytes[this.offset++];
  }

  uvarint(): number {
    let result = 0;
    let multiplier = 1;
    for (let index = 0; index < 8; index += 1) {
      const byte = this.u8();
      result += (byte & 0x7f) * multiplier;
      if ((byte & 0x80) === 0) {
        if (!Number.isSafeInteger(result)) {
          throw new Error("存档码整数超出范围");
        }
        return result;
      }
      multiplier *= 128;
    }
    throw new Error("存档码整数编码无效");
  }

  text(): string {
    const length = this.uvarint();
    if (length > this.remaining) {
      throw new Error("存档码文本不完整");
    }
    const start = this.offset;
    this.offset += length;
    return new TextDecoder().decode(
      this.bytes.subarray(start, this.offset),
    );
  }
}

function integer(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : 0;
}

function parseJsonRecord(
  raw: string | null,
): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function codePointOf(char: string): number {
  const points = [...char];
  if (points.length !== 1) {
    throw new Error("存档码包含无效字符");
  }
  return points[0].codePointAt(0) ?? 0;
}

function charFromCodePoint(codePoint: number): string {
  if (
    !Number.isSafeInteger(codePoint) ||
    codePoint < 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    throw new Error("存档码字符编码无效");
  }
  return String.fromCodePoint(codePoint);
}

function difficultyFromName(
  value: string,
): ChallengeDifficulty | null {
  return value === "beginner" ||
    value === "standard" ||
    value === "expert"
    ? value
    : null;
}

function parseRecord(
  key: string,
  value: number,
): CompactSaveRecord {
  const [mode, ...segments] = key.split("|");
  const params = new Map<string, string>();
  for (const segment of segments) {
    const separator = segment.indexOf("=");
    if (separator < 1) {
      return { mode: "raw", key, value };
    }
    params.set(
      segment.slice(0, separator),
      segment.slice(separator + 1),
    );
  }

  if (mode === "challenge") {
    const allowed = new Set([
      "difficulty",
      "questions",
      "size",
      "shift",
      "seconds",
      "ex",
    ]);
    if ([...params.keys()].some((name) => !allowed.has(name))) {
      return { mode: "raw", key, value };
    }
    const questions = Number(params.get("questions"));
    const size = Number(params.get("size"));
    const shift = Number(params.get("shift"));
    const seconds = Number(params.get("seconds"));
    if (
      ![questions, size, shift, seconds].every(
        (item) => Number.isSafeInteger(item) && item >= 0,
      )
    ) {
      return { mode: "raw", key, value };
    }
    const difficultyName = params.get("difficulty");
    const difficulty =
      difficultyName === undefined
        ? "standard"
        : difficultyFromName(difficultyName);
    if (!difficulty) {
      return { mode: "raw", key, value };
    }
    return {
      mode: "challenge",
      hasDifficulty: difficultyName !== undefined,
      difficulty,
      questions,
      size,
      shift,
      seconds,
      ex: params.get("ex") === "1",
      hasEx: params.has("ex"),
      value,
    };
  }

  if (mode === "endless") {
    const allowed = new Set(["levels", "parts", "seconds"]);
    if ([...params.keys()].some((name) => !allowed.has(name))) {
      return { mode: "raw", key, value };
    }
    const partMatch = /^(\d+)-(\d+)$/.exec(params.get("parts") ?? "");
    const levels = (params.get("levels") ?? "")
      .split(",")
      .map(Number)
      .filter(
        (level): level is Level =>
          level === 1 || level === 2 || level === 3,
      );
    const seconds = Number(params.get("seconds"));
    if (
      !partMatch ||
      levels.length === 0 ||
      !Number.isSafeInteger(seconds) ||
      seconds < 0
    ) {
      return { mode: "raw", key, value };
    }
    return {
      mode: "endless",
      levels,
      partsLow: Number(partMatch[1]),
      partsHigh: Number(partMatch[2]),
      seconds,
      value,
    };
  }

  return { mode: "raw", key, value };
}

function recordKey(record: CompactSaveRecord): string {
  if (record.mode === "raw") {
    return record.key;
  }
  if (record.mode === "endless") {
    return `endless|levels=${record.levels.join(",")}|parts=${record.partsLow}-${record.partsHigh}|seconds=${record.seconds}`;
  }
  const difficulty = record.hasDifficulty
    ? `difficulty=${record.difficulty}|`
    : "";
  return `challenge|${difficulty}questions=${record.questions}|size=${record.size}|shift=${record.shift}|seconds=${record.seconds}${record.hasEx ? `|ex=${record.ex ? 1 : 0}` : ""}`;
}

function readSeenCharacters(storage: SaveStorage): {
  seenChars: string[];
  directComponents: number[];
} {
  const current = parseJsonRecord(
    storage.getItem("zigsaw.collection.v2"),
  );
  if (current) {
    const chars =
      current.chars &&
      typeof current.chars === "object" &&
      !Array.isArray(current.chars)
        ? Object.keys(current.chars)
        : [];
    const directComponents = Array.isArray(current.directComponents)
      ? current.directComponents
          .map(integer)
          .filter((value) => value > 0)
      : [];
    return {
      seenChars: chars.sort(
        (left, right) =>
          codePointOf(left) - codePointOf(right),
      ),
      directComponents: [...new Set(directComponents)].sort(
        (left, right) => left - right,
      ),
    };
  }

  const legacy = parseJsonRecord(
    storage.getItem("zigsaw.collection.v1"),
  );
  const chars =
    legacy?.chars &&
    typeof legacy.chars === "object" &&
    !Array.isArray(legacy.chars)
      ? Object.keys(legacy.chars)
      : [];
  return {
    seenChars: chars.sort(
      (left, right) =>
        codePointOf(left) - codePointOf(right),
    ),
    directComponents: [],
  };
}

function readRecords(storage: SaveStorage): CompactSaveRecord[] {
  const records =
    parseJsonRecord(storage.getItem("zigsaw.records.v1")) ??
    parseJsonRecord(storage.getItem("char-rush.records.v1")) ??
    {};
  return Object.entries(records)
    .map(([key, value]) => parseRecord(key, integer(value)))
    .sort((left, right) =>
      recordKey(left).localeCompare(recordKey(right)),
    );
}

function readTrialRecentChars(storage: SaveStorage): string[] {
  const raw = storage.getItem(
    "zigsaw.trial.inspissation.recentLongChars",
  );
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (char): char is string =>
          typeof char === "string" &&
          [...char].length === 1,
      )
      .slice(-MAX_TRIAL_CHARS);
  } catch {
    return [];
  }
}

export function readCompactSaveState(
  storage: SaveStorage,
): CompactSaveState {
  const collection = readSeenCharacters(storage);
  return {
    ...collection,
    records: readRecords(storage),
    cris: integer(storage.getItem("zigsaw.cris.v1")),
    trialRecentLongChars: readTrialRecentChars(storage),
  };
}

function writeRecord(writer: ByteWriter, record: CompactSaveRecord): void {
  if (record.mode === "challenge") {
    writer.u8(0);
    const difficulty =
      record.difficulty === "beginner"
        ? 0
        : record.difficulty === "expert"
          ? 2
          : 1;
    writer.u8(
      difficulty |
        (record.hasDifficulty ? 0 : 4) |
        (record.ex ? 8 : 0) |
        (record.hasEx ? 16 : 0),
    );
    writer.uvarint(record.questions);
    writer.uvarint(record.size);
    writer.uvarint(record.shift);
    writer.uvarint(record.seconds);
    writer.uvarint(record.value);
    return;
  }
  if (record.mode === "endless") {
    writer.u8(1);
    writer.u8(
      record.levels.reduce(
        (mask, level) => mask | (1 << (level - 1)),
        0,
      ),
    );
    writer.uvarint(record.partsLow);
    writer.uvarint(record.partsHigh);
    writer.uvarint(record.seconds);
    writer.uvarint(record.value);
    return;
  }
  writer.u8(2);
  writer.text(record.key);
  writer.uvarint(record.value);
}

function readRecord(reader: ByteReader): CompactSaveRecord {
  const mode = reader.u8();
  if (mode === 0) {
    const flags = reader.u8();
    const difficulty = ["beginner", "standard", "expert"][
      flags & 3
    ] as ChallengeDifficulty;
    return {
      mode: "challenge",
      difficulty,
      hasDifficulty: (flags & 4) === 0,
      ex: (flags & 8) !== 0,
      hasEx: (flags & 16) !== 0,
      questions: reader.uvarint(),
      size: reader.uvarint(),
      shift: reader.uvarint(),
      seconds: reader.uvarint(),
      value: reader.uvarint(),
    };
  }
  if (mode === 1) {
    const mask = reader.u8();
    const levels = [1, 2, 3].filter(
      (level) => (mask & (1 << (Number(level) - 1))) !== 0,
    ) as Level[];
    return {
      mode: "endless",
      levels,
      partsLow: reader.uvarint(),
      partsHigh: reader.uvarint(),
      seconds: reader.uvarint(),
      value: reader.uvarint(),
    };
  }
  if (mode === 2) {
    return {
      mode: "raw",
      key: reader.text(),
      value: reader.uvarint(),
    };
  }
  throw new Error("存档码包含未知纪录类型");
}

function encodePayload(
  state: CompactSaveState,
): Uint8Array<ArrayBuffer> {
  const writer = new ByteWriter();
  writer.uvarint(PAYLOAD_VERSION);
  writer.uvarint(Math.floor(Date.now() / 1000));

  const seenChars = [...new Set(state.seenChars)].sort(
    (left, right) => codePointOf(left) - codePointOf(right),
  );
  writer.uvarint(seenChars.length);
  let previousCodePoint = 0;
  for (const char of seenChars) {
    const codePoint = codePointOf(char);
    writer.uvarint(codePoint - previousCodePoint);
    previousCodePoint = codePoint;
  }

  const components = [...new Set(state.directComponents)]
    .filter((symbolId) => Number.isSafeInteger(symbolId) && symbolId > 0)
    .sort((left, right) => left - right);
  writer.uvarint(components.length);
  let previousComponent = 0;
  for (const symbolId of components) {
    writer.uvarint(symbolId - previousComponent);
    previousComponent = symbolId;
  }

  writer.uvarint(integer(state.cris));
  writer.uvarint(state.records.length);
  for (const record of state.records) {
    writeRecord(writer, record);
  }

  const trialChars = state.trialRecentLongChars
    .filter((char) => [...char].length === 1)
    .slice(-MAX_TRIAL_CHARS);
  writer.uvarint(trialChars.length);
  for (const char of trialChars) {
    writer.uvarint(codePointOf(char));
  }
  const result = new Uint8Array(
    new ArrayBuffer(writer.bytes.length),
  );
  result.set(writer.bytes);
  return result;
}

function decodePayload(bytes: Uint8Array): CompactSaveState {
  const reader = new ByteReader(bytes);
  const version = reader.uvarint();
  if (version !== PAYLOAD_VERSION) {
    throw new Error("存档码正文版本不受支持");
  }
  reader.uvarint();

  const seenCount = reader.uvarint();
  if (seenCount > MAX_CHARACTERS) {
    throw new Error("存档码包含过多汉字");
  }
  const seenChars: string[] = [];
  let codePoint = 0;
  for (let index = 0; index < seenCount; index += 1) {
    codePoint += reader.uvarint();
    seenChars.push(charFromCodePoint(codePoint));
  }

  const componentCount = reader.uvarint();
  if (componentCount > MAX_COMPONENTS) {
    throw new Error("存档码包含过多部件");
  }
  const directComponents: number[] = [];
  let symbolId = 0;
  for (let index = 0; index < componentCount; index += 1) {
    symbolId += reader.uvarint();
    directComponents.push(symbolId);
  }

  const cris = reader.uvarint();
  const recordCount = reader.uvarint();
  if (recordCount > MAX_RECORDS) {
    throw new Error("存档码包含过多纪录");
  }
  const records = Array.from(
    { length: recordCount },
    () => readRecord(reader),
  );

  const trialCount = reader.uvarint();
  if (trialCount > MAX_TRIAL_CHARS) {
    throw new Error("存档码包含过多试炼记录");
  }
  const trialRecentLongChars = Array.from(
    { length: trialCount },
    () => charFromCodePoint(reader.uvarint()),
  );
  if (reader.remaining !== 0) {
    throw new Error("存档码包含无法识别的尾部数据");
  }

  return {
    seenChars,
    directComponents,
    records,
    cris,
    trialRecentLongChars,
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, index + 0x8000),
    );
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("存档码编码无效");
  }
  const padded =
    value.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("存档码编码无效");
  }
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function encryptionKey(crypto: Crypto): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ENCRYPTION_SALT),
  );
  return crypto.subtle.importKey(
    "raw",
    material,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encodeSaveCode(
  state: CompactSaveState,
  crypto: Crypto = globalThis.crypto,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(crypto);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodePayload(state),
  );
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return `${CODE_PREFIX}${bytesToBase64Url(combined)}`;
}

export async function decodeSaveCode(
  code: string,
  crypto: Crypto = globalThis.crypto,
): Promise<CompactSaveState> {
  const normalized = code.replace(/\s+/gu, "");
  if (
    normalized.length > MAX_CODE_LENGTH ||
    !normalized.startsWith(CODE_PREFIX)
  ) {
    throw new Error("这不是有效的 beta 存档码");
  }
  const bytes = base64UrlToBytes(
    normalized.slice(CODE_PREFIX.length),
  );
  if (bytes.length < 29) {
    throw new Error("存档码正文不完整");
  }
  try {
    const key = await encryptionKey(crypto);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes.subarray(0, 12),
      },
      key,
      bytes.subarray(12),
    );
    return decodePayload(new Uint8Array(plaintext));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("存档码")) {
      throw error;
    }
    throw new Error("存档码校验失败，内容可能已损坏");
  }
}

export function applyCompactSaveState(
  state: CompactSaveState,
  data: GameData,
  storage: SaveStorage,
): void {
  const chars: Record<string, number[]> = {};
  const seenChars = [...new Set(state.seenChars)].sort(
    (left, right) => codePointOf(left) - codePointOf(right),
  );
  for (const char of seenChars) {
    const componentIds = new Set<number>();
    for (const way of data.ways.get(char) ?? []) {
      for (const symbolId of way) {
        if (data.component(symbolId).name !== "?") {
          componentIds.add(symbolId);
        }
      }
    }
    chars[char] = [...componentIds].sort((left, right) => left - right);
  }
  const collection = {
    version: 2,
    sourceHash: "",
    chars,
    externalChars: seenChars.filter(
      (char) => !data.levels.has(char),
    ),
    directComponents: [...new Set(state.directComponents)].sort(
      (left, right) => left - right,
    ),
  };
  const records = Object.fromEntries(
    state.records.map((record) => [
      recordKey(record),
      integer(record.value),
    ]),
  );
  const archiveData: Record<string, string> = {
    "zigsaw.collection.v2": JSON.stringify(collection),
    "zigsaw.records.v1": JSON.stringify(records),
    "zigsaw.cris.v1": String(integer(state.cris)),
  };
  if (state.trialRecentLongChars.length > 0) {
    archiveData["zigsaw.trial.inspissation.recentLongChars"] =
      JSON.stringify(state.trialRecentLongChars);
  }
  applySaveArchive(
    {
      version: 1,
      savedAt: new Date().toISOString(),
      data: archiveData,
    },
    storage,
  );
}
