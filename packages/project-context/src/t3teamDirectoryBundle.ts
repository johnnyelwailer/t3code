export type T3TeamDirectoryBundleFile = {
  readonly relativePath: string;
  readonly contents: string;
  readonly encoding?: "base64";
  readonly sizeBytes?: number;
};

export type T3TeamDirectoryBundleReference = {
  readonly label: string;
  readonly relativePath: string;
};

export type T3TeamDirectoryBundlePayload = {
  readonly kind: "t3team-directory-bundle";
  readonly dedupeKey: string;
  readonly bundleRootRelativePath: string;
  readonly files: ReadonlyArray<T3TeamDirectoryBundleFile>;
  readonly fileReferences: ReadonlyArray<T3TeamDirectoryBundleReference>;
  readonly lightweightItem: unknown;
};

export function compactJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function dedupeDirectoryBundleFiles(
  files: ReadonlyArray<T3TeamDirectoryBundleFile>,
): T3TeamDirectoryBundleFile[] {
  const byRelativePath = new Map<string, T3TeamDirectoryBundleFile>();
  for (const file of files) {
    byRelativePath.set(file.relativePath, file);
  }
  return [...byRelativePath.values()].toSorted((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

export function dedupeDirectoryBundleReferences(
  references: ReadonlyArray<T3TeamDirectoryBundleReference>,
): T3TeamDirectoryBundleReference[] {
  const seen = new Set<string>();
  const next: T3TeamDirectoryBundleReference[] = [];
  for (const reference of references) {
    const key = `${reference.label}:${reference.relativePath}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(reference);
  }
  return next;
}
