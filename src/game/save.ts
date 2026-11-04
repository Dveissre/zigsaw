const SAVE_FORMAT = "zigsaw-save";
const SAVE_FORMAT_VERSION = 1;
const CURRENT_PAYLOAD_VERSION = 1;
const MAX_ARCHIVE_LENGTH = 5_000_000;
const MAX_STORAGE_VALUE_LENGTH = 2_000_000;
const MAX_STORAGE_TOTAL_LENGTH = 4_000_000;
const ENCRYPTION_SALT = "zigsaw.save.encryption.v1";

export const MANAGED_SAVE_KEYS = [
  "zigsaw.collection.v2",
  "zigsaw.collection.v1",
  "zigsaw.records.v1",
  "char-rush.records.v1",
  "zigsaw.cris.v1",
  "zigsaw.trial.inspissation.recentLongChars",
] as const;

type ManagedSaveKey = (typeof MANAGED_SAVE_KEYS)[number];

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface SavePayloadV0 {
  version: 0;
  data: Record<string, string>;
}

export interface SavePayloadV1 {
  version: 1;
  savedAt: string;
  data: Partial<Record<ManagedSaveKey, string>>;
}

interface EncryptedSaveEnvelope {
  format: typeof SAVE_FORMAT;
  formatVersion: number;
  payloadVersion: number;
  iv: string;
  ciphertext: string;
}

type SupportedSavePayload = SavePayloadV0 | SavePayloadV1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isManagedSaveKey(key: string): key is ManagedSaveKey {
  return (MANAGED_SAVE_KEYS as readonly string[]).includes(key);
}

function normalizePayloadData(value: unknown): SavePayloadV1["data"] {
  if (!isRecord(value)) {
    throw new Error("存档内容格式无效");
  }

  const data: SavePayloadV1["data"] = {};
  let totalLength = 0;
  for (const [key, storedValue] of Object.entries(value)) {
    if (!isManagedSaveKey(key)) {
      throw new Error(`存档包含无法识别的数据：${key}`);
    }
    if (typeof storedValue !== "string") {
      throw new Error("存档数据项格式无效");
    }
    if (storedValue.length > MAX_STORAGE_VALUE_LENGTH) {
      throw new Error("存档数据项过大");
    }
    totalLength += storedValue.length;
    if (totalLength > MAX_STORAGE_TOTAL_LENGTH) {
      throw new Error("存档内容过大");
    }
    data[key] = storedValue;
  }
  return data;
}

export function migrateSavePayload(value: unknown): SavePayloadV1 {
  if (!isRecord(value) || typeof value.version !== "number") {
    throw new Error("存档缺少版本信息");
  }

  if (value.version === 0) {
    return {
      version: CURRENT_PAYLOAD_VERSION,
      savedAt: "1970-01-01T00:00:00.000Z",
      data: normalizePayloadData(value.data),
    };
  }

  if (value.version === CURRENT_PAYLOAD_VERSION) {
    return {
      version: CURRENT_PAYLOAD_VERSION,
      savedAt:
        typeof value.savedAt === "string"
          ? value.savedAt
          : new Date(0).toISOString(),
      data: normalizePayloadData(value.data),
    };
  }

  throw new Error("存档版本高于当前页面支持的版本");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, index + chunkSize),
    );
  }
  return btoa(binary);
}

function base64ToBytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    throw new Error("存档加密数据损坏");
  }

  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("存档加密数据损坏");
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

export async function encryptSavePayload(
  payload: SupportedSavePayload,
  crypto: Crypto = globalThis.crypto,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(crypto);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );
  const envelope: EncryptedSaveEnvelope = {
    format: SAVE_FORMAT,
    formatVersion: SAVE_FORMAT_VERSION,
    payloadVersion: payload.version,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope);
}

export async function readSaveArchive(
  serialized: string,
  crypto: Crypto = globalThis.crypto,
): Promise<SavePayloadV1> {
  if (!serialized || serialized.length > MAX_ARCHIVE_LENGTH) {
    throw new Error("存档文件为空或过大");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("无法读取存档文件");
  }
  if (!isRecord(parsed) || parsed.format !== SAVE_FORMAT) {
    throw new Error("这不是 ZIGSAW 存档文件");
  }
  if (
    parsed.formatVersion !== SAVE_FORMAT_VERSION ||
    typeof parsed.payloadVersion !== "number"
  ) {
    throw new Error("存档文件格式版本不受支持");
  }
  if (parsed.payloadVersion > CURRENT_PAYLOAD_VERSION) {
    throw new Error("存档版本高于当前页面支持的版本");
  }

  const iv = base64ToBytes(parsed.iv);
  if (iv.length !== 12) {
    throw new Error("存档加密数据损坏");
  }
  const ciphertext = base64ToBytes(parsed.ciphertext);
  if (ciphertext.length < 17) {
    throw new Error("存档加密数据损坏");
  }

  let plaintext: ArrayBuffer;
  try {
    const key = await encryptionKey(crypto);
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
  } catch {
    throw new Error("存档校验失败，文件可能已损坏");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error("存档正文损坏");
  }
  return migrateSavePayload(payload);
}

export async function createSaveArchive(
  storage: SaveStorage,
  crypto: Crypto = globalThis.crypto,
): Promise<string> {
  const data: SavePayloadV1["data"] = {};
  for (const key of MANAGED_SAVE_KEYS) {
    const value = storage.getItem(key);
    if (value !== null) {
      data[key] = value;
    }
  }
  return encryptSavePayload(
    {
      version: CURRENT_PAYLOAD_VERSION,
      savedAt: new Date().toISOString(),
      data,
    },
    crypto,
  );
}

export function applySaveArchive(
  payload: SavePayloadV1,
  storage: SaveStorage,
): void {
  const previous = new Map<ManagedSaveKey, string | null>();
  for (const key of MANAGED_SAVE_KEYS) {
    previous.set(key, storage.getItem(key));
  }

  try {
    for (const key of MANAGED_SAVE_KEYS) {
      storage.removeItem(key);
    }
    for (const key of MANAGED_SAVE_KEYS) {
      const value = payload.data[key];
      if (value !== undefined) {
        storage.setItem(key, value);
      }
    }
  } catch (error) {
    try {
      for (const key of MANAGED_SAVE_KEYS) {
        storage.removeItem(key);
      }
      for (const [key, value] of previous) {
        if (value !== null) {
          storage.setItem(key, value);
        }
      }
    } catch {
      // The original storage error is more useful than a rollback failure.
    }
    throw error;
  }
}
