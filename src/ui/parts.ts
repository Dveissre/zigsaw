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
  return [parts];
}

