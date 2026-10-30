import type { GameSettings } from "./data";

const STORAGE_KEY = "zigsaw.records.v1";
const LEGACY_STORAGE_KEY = "char-rush.records.v1";

export interface RecordStore {
  load(key: string): number;
  save(key: string, value: number): void;
}

export function recordKey(settings: GameSettings): string {
  if (settings.mode === "endless") {
    return `endless|levels=${settings.levels.join(",")}|parts=${settings.partsLow}-${settings.partsHigh}|seconds=${settings.seconds}`;
  }
  if (settings.mode === "challenge") {
    return `challenge|difficulty=${settings.difficulty}|questions=${settings.stageQuestions}|size=${settings.stageSize}|shift=${settings.stageShift}|seconds=${settings.seconds}|ex=${settings.exEnabled ? 1 : 0}`;
  }
  return "";
}

export class LocalRecordStore implements RecordStore {
  private readAll(): Record<string, number> {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
          localStorage.setItem(STORAGE_KEY, legacy);
          raw = legacy;
        }
      }
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, number>)
        : {};
    } catch {
      return {};
    }
  }

  load(key: string): number {
    const records = this.readAll();
    const legacyKey = key.startsWith(
      "challenge|difficulty=standard|",
    )
      ? key.replace(
          "challenge|difficulty=standard|",
          "challenge|",
        )
      : "";
    const stored =
      records[key] ??
      (legacyKey ? records[legacyKey] : undefined) ??
      0;
    const value = Number(stored);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  save(key: string, value: number): void {
    try {
      const records = this.readAll();
      records[key] = value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      // Storage may be unavailable in private or restricted browsing contexts.
    }
  }
}

