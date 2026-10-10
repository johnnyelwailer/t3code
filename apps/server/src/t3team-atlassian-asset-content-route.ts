import * as Mime from "effect/http/Mime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { HttpRouter } from "effect/http";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import { tryAtlassianPromise } from "./t3team-atlassian-http.ts";
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

    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspacePaths = yield* WorkspacePaths;

    if (input.workspaceRoot && input.relativePath) {
      const localAsset = yield* workspacePaths.normalizeWorkspaceRoot(input.workspaceRoot).pipe(
        Effect.flatMap((workspaceRoot) =>
          workspacePaths.resolveRelativePathWithinRoot({
            workspaceRoot,
            relativePath: input.relativePath!,
          }),
        ),
        Effect.flatMap((resolved) =>
          fileSystem.readFile(resolved.absolutePath).pipe(
            Effect.map((bytes) => ({
              bytes,
              contentType: mimeTypeOrOctetStream(resolved.absolutePath),
            })),
          ),
        ),
        Effect.option,
      );

      if (Option.isSome(localAsset)) {
        return HttpServerResponse.uint8Array(localAsset.value.bytes, {
          status: 200,
          contentType: localAsset.value.contentType,
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
