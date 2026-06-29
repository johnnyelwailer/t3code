export function parseT3workContextJsonObject(
  contents: string,
): Record<string, unknown> | undefined {
  if (contents.trim().length === 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(contents) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
