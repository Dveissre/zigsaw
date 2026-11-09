export function splitPartsIntoRows<T>(
  parts: T[],
  twoByTwo = false,
): T[][] {
  if (twoByTwo && parts.length === 4) {
    return [parts.slice(0, 2), parts.slice(2, 4)];
  }
  if (parts.length === 6) {
    return [parts.slice(0, 3), parts.slice(3, 6)];
  }
  if (parts.length === 7) {
    return [parts.slice(0, 4), parts.slice(4, 7)];
  }
  if (parts.length === 8) {
    return [parts.slice(0, 4), parts.slice(4, 8)];
  }
  if (parts.length === 9) {
    return [parts.slice(0, 5), parts.slice(5, 9)];
  }
  if (parts.length === 10) {
    return [parts.slice(0, 5), parts.slice(5, 10)];
  }
  return [parts];
}

export function uniqueCardUses<T extends { cardUid: number }>(
  uses: readonly T[],
): T[] {
  const seen = new Set<number>();
  return uses.filter((use) => {
    if (seen.has(use.cardUid)) {
      return false;
    }
    seen.add(use.cardUid);
    return true;
  });
}

