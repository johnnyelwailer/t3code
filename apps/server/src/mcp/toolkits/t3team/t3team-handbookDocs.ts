/** Handbook GHE loader: tree once, files lazily, BM25 rank. Token never logged. */
import { OrchestratorMcpFailure } from "@t3tools/contracts";
import { encodePathSegments } from "@t3tools/source-control-core/server/t3team-fileAtRevision";
import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { rankHandbookDocuments, type HandbookSearchDocument } from "./t3team-handbookBm25.ts";
import {
  HANDBOOK_CACHE_TTL_MS,
  HANDBOOK_DEFAULT_SEARCH_LIMIT,
  HANDBOOK_HOST,
  HANDBOOK_MAX_SEARCH_LIMIT,
  HANDBOOK_REPOSITORY,
} from "./t3team-handbookConfig.ts";
import { handbookRestFailure } from "./t3team-handbookErrors.ts";
import {
  extractHandbookHeadings,
  extractHandbookTitle,
  handbookDocsUrl,
  isHandbookMarkdownPath,
  normalizeHandbookPath,
  stripHandbookFrontmatter,
} from "./t3team-handbookParse.ts";

export type HandbookSearchResult = {
  readonly title: string;
  readonly path: string;
  readonly url: string;
  readonly score: number;
};
export type HandbookPage = {
  readonly title: string;
  readonly path: string;
  readonly url: string;
  readonly markdown: string;
};

export class HandbookDocs extends Context.Service<
  HandbookDocs,
  {
    readonly search: (
      query: string,
      limit?: number,
    ) => Effect.Effect<ReadonlyArray<HandbookSearchResult>, OrchestratorMcpFailure>;
    readonly getPage: (path: string) => Effect.Effect<HandbookPage, OrchestratorMcpFailure>;
  }
>()("t3/mcp/toolkits/t3team/t3team-handbookDocs/HandbookDocs") {}

const decodeTree = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      tree: Schema.Array(
        Schema.Struct({
          path: Schema.optional(Schema.String),
          type: Schema.optional(Schema.String),
        }),
      ),
    }),
  ),
);

type CachedPage = {
  readonly path: string;
  readonly title: string;
  readonly headings: ReadonlyArray<string>;
  readonly body: string;
  readonly markdown: string;
};
type CacheState = {
  readonly expiresAt: number;
  readonly paths: ReadonlyArray<string>;
  readonly pages: Map<string, CachedPage>;
};

const make = Effect.gen(function* () {
  const api = yield* GitHubApi.GitHubApi;
  let cache: CacheState | undefined;

  const fresh = Effect.fn("HandbookDocs.fresh")(function* () {
    if (cache === undefined) return undefined;
    if (cache.expiresAt > (yield* Clock.currentTimeMillis)) return cache;
    cache = undefined;
    return undefined;
  });

  const rest = (input: Omit<GitHubApi.GitHubRestInput, "host">) =>
    api
      .rest({ host: HANDBOOK_HOST, ...input })
      .pipe(Effect.mapError((error) => handbookRestFailure(error, input)));

  const loadTreePaths = Effect.fn("HandbookDocs.loadTreePaths")(function* () {
    const existing = yield* fresh();
    if (existing !== undefined) return existing.paths;
    const response = yield* rest({
      operation: "handbook.tree",
      path: `repos/${HANDBOOK_REPOSITORY}/git/trees/HEAD?recursive=1`,
    });
    const decoded = decodeTree(response.body);
    if (Option.isNone(decoded)) {
      return yield* new OrchestratorMcpFailure({
        code: "orchestration_error",
        message: "Handbook tree response from GitHub was not usable.",
      });
    }
    const paths = decoded.value.tree
      .flatMap((entry) => (entry.type === "blob" && entry.path ? [entry.path] : []))
      .filter(isHandbookMarkdownPath)
      .sort();
    cache = {
      expiresAt: (yield* Clock.currentTimeMillis) + HANDBOOK_CACHE_TTL_MS,
      paths,
      pages: new Map(),
    };
    return paths;
  });

  const loadPage = Effect.fn("HandbookDocs.loadPage")(function* (path: string) {
    const state = (yield* fresh()) ?? {
      expiresAt: (yield* Clock.currentTimeMillis) + HANDBOOK_CACHE_TTL_MS,
      paths: [] as string[],
      pages: new Map<string, CachedPage>(),
    };
    const hit = state.pages.get(path);
    if (hit !== undefined) {
      cache = state;
      return hit;
    }
    const response = yield* rest({
      operation: "handbook.contents",
      path: `repos/${HANDBOOK_REPOSITORY}/contents/${encodePathSegments(path)}`,
      accept: "application/vnd.github.raw",
    });
    if (response.invalidUtf8) {
      return yield* new OrchestratorMcpFailure({
        code: "invalid_request",
        message: `Handbook page ${path} is not UTF-8 markdown.`,
      });
    }
    const page = {
      path,
      title: extractHandbookTitle(path, response.body),
      headings: extractHandbookHeadings(response.body),
      body: stripHandbookFrontmatter(response.body),
      markdown: response.body,
    } satisfies CachedPage;
    state.pages.set(path, page);
    cache = state;
    return page;
  });

  return HandbookDocs.of({
    search: Effect.fn("HandbookDocs.search")(function* (query, limit) {
      const capped = Math.min(
        Math.max(1, Math.floor(limit ?? HANDBOOK_DEFAULT_SEARCH_LIMIT)),
        HANDBOOK_MAX_SEARCH_LIMIT,
      );
      const paths = yield* loadTreePaths();
      const current = yield* fresh();
      const missing = paths.filter((path) => current?.pages.get(path) === undefined);
      if (missing.length > 0) {
        yield* Effect.forEach(missing, (path) => loadPage(path), { concurrency: 8 });
      }
      const pages = (yield* fresh())?.pages;
      const documents: HandbookSearchDocument[] = paths.flatMap((path) => {
        const page = pages?.get(path);
        return page === undefined
          ? []
          : [{ path: page.path, title: page.title, headings: page.headings, body: page.body }];
      });
      return rankHandbookDocuments(query, documents, capped).map((hit) => ({
        title: hit.title,
        path: hit.path,
        url: handbookDocsUrl(hit.path),
        score: hit.score,
      }));
    }),
    getPage: Effect.fn("HandbookDocs.getPage")(function* (rawPath) {
      const path = normalizeHandbookPath(rawPath);
      if (!isHandbookMarkdownPath(path)) {
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: `Not a handbook page path: ${rawPath}`,
        });
      }
      yield* loadTreePaths().pipe(Effect.catch(() => Effect.void));
      const page = yield* loadPage(path);
      return {
        title: page.title,
        path: page.path,
        url: handbookDocsUrl(page.path),
        markdown: page.markdown,
      };
    }),
  });
});

export const layer = Layer.effect(HandbookDocs, make);
