import * as Mime from "effect/http/Mime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { HttpRouter } from "effect/http";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import { tryAtlassianPromise } from "./t3team-atlassian-http.ts";
import { isWithinRoot, KnownWorkspaces } from "./workspace/KnownWorkspaces.ts";
import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";

type AssetContentInput = {
  readonly accountId: string;
  readonly url: string;
  readonly workspaceRoot?: string;
  readonly relativePath?: string;
};

function readAssetContentInput(
  request: HttpServerRequest.HttpServerRequest,
): AssetContentInput | null {
  const requestUrl = HttpServerRequest.toURL(request);
  if (Option.isNone(requestUrl)) {
    return null;
  }

  return {
    accountId: requestUrl.value.searchParams.get("accountId")?.trim() ?? "",
    url: requestUrl.value.searchParams.get("url")?.trim() ?? "",
    ...(requestUrl.value.searchParams.get("workspaceRoot")?.trim()
      ? { workspaceRoot: requestUrl.value.searchParams.get("workspaceRoot")!.trim() }
      : {}),
    ...(requestUrl.value.searchParams.get("relativePath")?.trim()
      ? { relativePath: requestUrl.value.searchParams.get("relativePath")!.trim() }
      : {}),
  };
}

const mimeTypeOrOctetStream = (filePath: string): string =>
  Option.getOrElse(Mime.getType(filePath), () => "application/octet-stream");

function resolveFallbackContentType(path: Path.Path, sourceUrl: string, mimeType?: string): string {
  if (mimeType) {
    return mimeType;
  }

  try {
    return mimeTypeOrOctetStream(new URL(sourceUrl).pathname);
  } catch {
    return path.extname(sourceUrl) ? mimeTypeOrOctetStream(sourceUrl) : "application/octet-stream";
  }
}

/**
 * The ticket attachment cache that `buildJiraTicketAttachmentAssetPath` writes, under whichever
 * hidden project state dir this host uses. Nothing else in a workspace is served here.
 */
const ATTACHMENT_CACHE_PATH =
  /^\.[^/]+\/context\/jira\/[^/]+\/items\/[^/]+\/attachments\/files\/[^/]+$/;

type CachedAttachment =
  | { readonly _tag: "Refused" }
  | { readonly _tag: "Miss" }
  | { readonly _tag: "Hit"; readonly bytes: Uint8Array; readonly contentType: string };

const readCachedAttachment = Effect.fn("t3team.atlassianAssetContent.readCachedAttachment")(
  function* (workspaceRoot: string, relativePath: string) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspacePaths = yield* WorkspacePaths;
    const knownWorkspaces = yield* KnownWorkspaces;
    const refused: CachedAttachment = { _tag: "Refused" };
    const miss: CachedAttachment = { _tag: "Miss" };

    const known = yield* knownWorkspaces.assertContains(workspaceRoot).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    );
    if (!known) return refused;
    const resolved = yield* workspacePaths.normalizeWorkspaceRoot(workspaceRoot).pipe(
      Effect.flatMap((root) =>
        workspacePaths
          .resolveRelativePathWithinRoot({ workspaceRoot: root, relativePath })
          .pipe(Effect.map((within) => ({ root, ...within }))),
      ),
      Effect.option,
    );
    if (Option.isNone(resolved) || !ATTACHMENT_CACHE_PATH.test(resolved.value.relativePath)) {
      return refused;
    }
    const real = yield* Effect.all([
      fileSystem.realPath(resolved.value.root),
      fileSystem.realPath(resolved.value.absolutePath),
    ]).pipe(Effect.option);
    // Not cached yet: the caller fetches it from Atlassian instead.
    if (Option.isNone(real)) return miss;
    const [realRoot, realFile] = real.value;
    // The checks above are lexical; a symlink must not lead out of the named workspace, nor out of
    // its attachment cache to another file in it.
    const realRelative = path.relative(realRoot, realFile).replaceAll("\\", "/");
    if (!isWithinRoot(path, realFile, realRoot) || !ATTACHMENT_CACHE_PATH.test(realRelative)) {
      return refused;
    }
    const bytes = yield* fileSystem.readFile(realFile).pipe(Effect.option);
    return Option.isSome(bytes)
      ? ({
          _tag: "Hit",
          bytes: bytes.value,
          contentType: mimeTypeOrOctetStream(realFile),
        } satisfies CachedAttachment)
      : miss;
  },
);

export const t3teamAtlassianAssetContentRouteLayer = HttpRouter.add(
  "GET",
  "/api/t3team/atlassian/asset/content",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const input = readAssetContentInput(request);
    if (!input) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    if (!input.accountId || !input.url) {
      return HttpServerResponse.text("Missing accountId or url parameter", { status: 400 });
    }

    const path = yield* Path.Path;

    if (input.workspaceRoot && input.relativePath) {
      const cached = yield* readCachedAttachment(input.workspaceRoot, input.relativePath);
      if (cached._tag === "Refused") {
        return HttpServerResponse.text("Not a cached attachment", { status: 403 });
      }
      if (cached._tag === "Hit") {
        return HttpServerResponse.uint8Array(cached.bytes, {
          status: 200,
          contentType: cached.contentType,
        });
      }
    }

    const provider = yield* providerForAccount(input.accountId);
    const asset = yield* tryAtlassianPromise(
      () => provider.downloadAsset(input.url),
      "Failed to download Atlassian asset.",
    );

    return HttpServerResponse.uint8Array(asset.bytes, {
      status: 200,
      contentType: resolveFallbackContentType(path, input.url, asset.mimeType),
    });
  }).pipe(
    Effect.catch(() =>
      Effect.succeed(HttpServerResponse.text("Failed to load Atlassian asset.", { status: 502 })),
    ),
  ),
);
