export function parseWindowsCommitMemory(output: string): {
  readonly commitHeadroomBytes: number;
  readonly commitLimitBytes: number;
} | null {
  try {
    const value: unknown = JSON.parse(output);
    if (
      typeof value !== "object" ||
      value === null ||
      !("CommittedBytes" in value) ||
      !("CommitLimit" in value)
    )
      return null;
    const used = value.CommittedBytes;
    const limit = value.CommitLimit;
    if (
      typeof used !== "number" ||
      typeof limit !== "number" ||
      !Number.isSafeInteger(used) ||
      !Number.isSafeInteger(limit) ||
      used < 0 ||
      limit <= 0 ||
      used > limit
    )
      return null;
    return { commitHeadroomBytes: limit - used, commitLimitBytes: limit };
  } catch {
    return null;
  }
}
