function parseStringArray(value: unknown): ReadonlyArray<string> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function toMcpAddCommand(config: Record<string, unknown>): {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly envEntries: ReadonlyArray<string>;
} | null {
  const command = typeof config.command === "string" ? config.command.trim() : "";
  if (command.length === 0) {
    return null;
  }

  const args = parseStringArray(config.args);
  const env = config.env;
  const envEntries =
    typeof env === "object" && env !== null
      ? Object.entries(env)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string")
          .map(([key, value]) => `${key}=${value}`)
      : [];

  return {
    command,
    args,
    envEntries,
  };
}
