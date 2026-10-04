/** One-time canonical normalization of manifests written before the main-repository rename. */
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";

export function normalizeReferenceManifestJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return raw;
    if ("mainRepository" in parsed || !("metaRepository" in parsed)) return raw;
    const old = parsed.metaRepository;
    if (!old || typeof old !== "object") return raw;
    const entry = old as Record<string, unknown>;
    if (typeof entry.localPath !== "string" || !entry.localPath.trim()) return raw;
    const { metaRepository: _old, ...rest } = parsed;
    return JSON.stringify(
      {
        ...rest,
        mainRepository: {
          localPath: entry.localPath,
          ...(typeof entry.url === "string" && entry.url.trim() ? { url: entry.url.trim() } : {}),
          status: "adopted",
        },
      },
      null,
      2,
    );
  } catch {
    return raw;
  }
}

export const readNormalizedReferenceManifest = (
  fileSystem: FileSystem.FileSystem,
  manifestPath: string,
) =>
  Effect.gen(function* () {
    const raw = yield* fileSystem.readFileString(manifestPath).pipe(Effect.orElseSucceed(() => ""));
    const normalized = normalizeReferenceManifestJson(raw);
    if (normalized !== raw) {
      yield* fileSystem.writeFileString(manifestPath, normalized).pipe(
        Effect.catch((error) =>
          Effect.logWarning("reference manifest normalization was not persisted", {
            manifestPath,
            error: String(error),
          }),
        ),
      );
    }
    return normalized;
  });
