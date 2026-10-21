export function splitPartsIntoRows<T>(parts: T[]): T[][] {
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

