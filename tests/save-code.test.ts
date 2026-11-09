import { describe, expect, it } from "vitest";
import { GameData } from "../src/game/data";
import {
  applyCompactSaveState,
  decodeSaveCode,
  encodeSaveCode,
  readCompactSaveState,
} from "../src/game/save-code";
import type { SaveStorage } from "../src/game/save";

class MemoryStorage implements SaveStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function createGameData(): GameData {
  return new GameData(
    {
      symbols: {
        "1": "一",
        "2": "丨",
        "3": "人",
        "7": "犬",
        "9": "口",
      },
      chars: {
        二: [[1, 2]],
        三: [[1, 1, 2]],
        犬: [[7]],
      },
    },
    {
      levels: {
        一级: ["二", "三"],
        二级: [],
        三级: [],
      },
    },
    null,
    "https://example.com/",
  );
}

function createStorage(): MemoryStorage {
  const storage = new MemoryStorage();
  storage.setItem(
    "zigsaw.collection.v2",
    JSON.stringify({
      version: 2,
      sourceHash: "old",
      chars: {
        二: [1, 2],
        三: [1, 2],
        犬: [7],
      },
      externalChars: ["犬"],
      directComponents: [9],
    }),
  );
  storage.setItem(
    "zigsaw.records.v1",
    JSON.stringify({
      "challenge|questions=5|size=1500|shift=300|seconds=40": 12,
      "challenge|difficulty=expert|questions=3|size=900|shift=200|seconds=20|ex=1": 7,
      "endless|levels=1,2|parts=2-4|seconds=30": 41,
    }),
  );
  storage.setItem("zigsaw.cris.v1", "123");
  storage.setItem(
    "zigsaw.trial.progress.v1",
    JSON.stringify({
      version: 1,
      highestCleared: 3,
      perfectMask: 5,
    }),
  );
  storage.setItem(
    "zigsaw.trial.inspissation.recentLongChars",
    JSON.stringify(["聯", "鬱"]),
  );
  storage.setItem("zigsaw.collection.v1", '{"version":1,"chars":{}}');
  storage.setItem("unmanaged", "keep");
  return storage;
}

async function encodeRawCompactPayload(
  payload: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      "zigsaw.save.encryption.v1",
    ),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    material,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = new Uint8Array(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    payload,
  );
  const combined = new Uint8Array(
    12 + ciphertext.byteLength,
  );
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), 12);
  const encoded = btoa(
    String.fromCharCode(...combined),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
  return `ZSC1.${encoded}`;
}

describe("compact beta save code", () => {
  it("round-trips the minimal domain state and rebuilds storage", async () => {
    const source = createStorage();
    const state = readCompactSaveState(source);
    expect(state.seenChars).toEqual(["三", "二", "犬"]);
    expect(state.directComponents).toEqual([9]);
    expect(state.trialHighestCleared).toBe(3);
    expect(state.trialPerfectMask).toBe(5);
    expect(state.records.map((record) => record.mode)).toEqual([
      "challenge",
      "challenge",
      "endless",
    ]);

    const code = await encodeSaveCode(state);
    expect(code.startsWith("ZSC1.")).toBe(true);
    expect(code).not.toContain("zigsaw");
    expect(code).not.toContain("expert");

    const decoded = await decodeSaveCode(
      `${code.slice(0, 40)}\n${code.slice(40)}`,
    );
    const target = new MemoryStorage();
    target.setItem("unmanaged", "keep");
    applyCompactSaveState(decoded, createGameData(), target);

    expect(target.getItem("unmanaged")).toBe("keep");
    expect(
      target.getItem("zigsaw.collection.v1"),
    ).toBeNull();
    expect(target.getItem("zigsaw.cris.v1")).toBe("123");
    expect(
      JSON.parse(
        target.getItem(
          "zigsaw.trial.progress.v1",
        ) ?? "{}",
      ),
    ).toEqual({
      version: 1,
      highestCleared: 3,
      perfectMask: 5,
    });
    expect(
      JSON.parse(
        target.getItem(
          "zigsaw.trial.inspissation.recentLongChars",
        ) ?? "[]",
      ),
    ).toEqual(["聯", "鬱"]);
    const collection = JSON.parse(
      target.getItem("zigsaw.collection.v2") ?? "{}",
    );
    expect(collection.chars).toEqual({
      二: [1, 2],
      三: [1, 2],
      犬: [7],
    });
    expect(collection.externalChars).toEqual(["犬"]);
    expect(collection.directComponents).toEqual([9]);
    expect(JSON.parse(target.getItem("zigsaw.records.v1") ?? "{}"))
      .toEqual({
        "challenge|questions=5|size=1500|shift=300|seconds=40": 12,
        "challenge|difficulty=expert|questions=3|size=900|shift=200|seconds=20|ex=1": 7,
        "endless|levels=1,2|parts=2-4|seconds=30": 41,
      });
  });

  it("rejects corrupted and foreign save codes", async () => {
    await expect(decodeSaveCode("not-a-code")).rejects.toThrow(
      "beta 存档码",
    );
    const code = await encodeSaveCode(
      readCompactSaveState(createStorage()),
    );
    const corruptionIndex = Math.floor(code.length / 2);
    const corrupted =
      code.slice(0, corruptionIndex) +
      (code[corruptionIndex] === "A" ? "B" : "A") +
      code.slice(corruptionIndex + 1);
    await expect(decodeSaveCode(corrupted)).rejects.toThrow(
      "校验失败",
    );
  });

  it("reads version one codes with only advancement zero unlocked", async () => {
    const payload = new Uint8Array([
      1, 0, 0, 0, 0, 0, 0,
    ]);
    const decoded = await decodeSaveCode(
      await encodeRawCompactPayload(payload),
    );
    expect(decoded.trialHighestCleared).toBe(-1);
    expect(decoded.trialPerfectMask).toBe(0);
  });

  it("reads version two codes with advancement but no perfect mask", async () => {
    const payload = new Uint8Array([
      2, 0, 0, 0, 0, 0, 0, 5,
    ]);
    const decoded = await decodeSaveCode(
      await encodeRawCompactPayload(payload),
    );
    expect(decoded.trialHighestCleared).toBe(4);
    expect(decoded.trialPerfectMask).toBe(0);
  });
});
