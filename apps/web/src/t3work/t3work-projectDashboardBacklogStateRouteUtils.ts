export function parseRouteEnum<TValue extends string>(
  value: unknown,
  allowedValues: ReadonlySet<TValue>,
): TValue | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return allowedValues.has(value as TValue) ? (value as TValue) : undefined;
}

export function parsePersistedSelection(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
