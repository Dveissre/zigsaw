import { describe, expect, it } from "vitest";
import {
  applySaveArchive,
  createSaveArchive,
  encryptSavePayload,
  MANAGED_SAVE_KEYS,
  migrateSavePayload,
  readSaveArchive,
  type SaveStorage,
} from "../src/game/save";

class MemoryStorage implements SaveStorage {
  readonly values = new Map<string, string>();
  writesUntilFailure: number | null = null;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.writesUntilFailure !== null) {
      if (this.writesUntilFailure === 0) {
        this.writesUntilFailure = null;
        throw new Error("storage full");
      }
      this.writesUntilFailure -= 1;
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("save archive", () => {
  it("encrypts and restores managed storage values", async () => {
    const source = new MemoryStorage();
    source.setItem("zigsaw.collection.v2", '{"secret":"collection"}');
    source.setItem(
      "zigsaw.cris.v1",
      "314159265358979323846",
    );
    source.setItem(
      "zigsaw.trial.progress.v1",
      '{"version":1,"highestCleared":2,"perfectMask":1}',
    );
    source.setItem("unmanaged", "leave-me-alone");

    const serialized = await createSaveArchive(source);
    expect(serialized).not.toContain("collection");
    expect(serialized).not.toContain(
      "314159265358979323846",
    );

    const payload = await readSaveArchive(serialized);
    expect(payload.version).toBe(1);
    expect(payload.data["zigsaw.collection.v2"]).toBe(
      '{"secret":"collection"}',
    );
    expect(payload.data["zigsaw.cris.v1"]).toBe(
      "314159265358979323846",
    );
    expect(payload.data["zigsaw.trial.progress.v1"]).toBe(
      '{"version":1,"highestCleared":2,"perfectMask":1}',
    );
    expect(payload.data).not.toHaveProperty("unmanaged");
  });

  it("reads encrypted version 0 archives and migrates them", async () => {
    const serialized = await encryptSavePayload({
      version: 0,
      data: {
        "zigsaw.records.v1": '{"legacy":12}',
      },
    });

    const payload = await readSaveArchive(serialized);
    expect(payload).toMatchObject({
      version: 1,
      data: { "zigsaw.records.v1": '{"legacy":12}' },
    });
  });

  it("rejects unknown storage keys in imported archives", () => {
    expect(() =>
      migrateSavePayload({
        version: 1,
        savedAt: "2026-11-04T00:00:00.000Z",
        data: { "unmanaged.key": "value" },
      }),
    ).toThrow("无法识别的数据");
  });

  it("rejects tampered archive files", async () => {
    const serialized = await encryptSavePayload({
      version: 1,
      savedAt: "2026-11-04T00:00:00.000Z",
      data: { "zigsaw.cris.v1": "10" },
    });
    const envelope = JSON.parse(serialized) as {
      ciphertext: string;
    };
    envelope.ciphertext =
      envelope.ciphertext.slice(0, -4) +
      (envelope.ciphertext.endsWith("AAAA") ? "BBBB" : "AAAA");

    await expect(
      readSaveArchive(JSON.stringify(envelope)),
    ).rejects.toThrow("校验失败");
  });

  it("replaces all managed keys and leaves unrelated storage alone", () => {
    const storage = new MemoryStorage();
    storage.setItem("zigsaw.cris.v1", "99");
    storage.setItem("zigsaw.records.v1", "old");
    storage.setItem("unmanaged", "keep");

    applySaveArchive(
      {
        version: 1,
        savedAt: "2026-11-04T00:00:00.000Z",
        data: { "zigsaw.collection.v2": "new" },
      },
      storage,
    );

    expect(storage.getItem("zigsaw.collection.v2")).toBe("new");
    for (const key of MANAGED_SAVE_KEYS.filter(
      (candidate) => candidate !== "zigsaw.collection.v2",
    )) {
      expect(storage.getItem(key)).toBeNull();
    }
    expect(storage.getItem("unmanaged")).toBe("keep");
  });

  it("restores the previous archive when writing fails", () => {
    const storage = new MemoryStorage();
    storage.setItem("zigsaw.cris.v1", "99");
    storage.setItem("zigsaw.records.v1", "old");
    storage.writesUntilFailure = 0;

    expect(() =>
      applySaveArchive(
        {
          version: 1,
          savedAt: "2026-11-04T00:00:00.000Z",
          data: { "zigsaw.collection.v2": "new" },
        },
        storage,
      ),
    ).toThrow("storage full");
    expect(storage.getItem("zigsaw.cris.v1")).toBe("99");
    expect(storage.getItem("zigsaw.records.v1")).toBe("old");
    expect(storage.getItem("zigsaw.collection.v2")).toBeNull();
  });
});
