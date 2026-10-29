/**
 * The interim updater's server side: which release to offer this machine, and the only asset
 * that may be downloaded afterwards. An asset id is served only if it came out of a release list
 * this service fetched and vetted itself, so the download route is not a proxy for anything else.
 */
import * as Effect from "effect/Effect";

import {
  isSupportedNexiRuntime,
  parseNexiUpdateManifest,
  pickNexiUpdate,
} from "@t3tools/shared/t3team-nexiUpdateSelect";
import type { NexiUpdateCheck } from "@t3tools/shared/t3team-nexiUpdateWire";

import {
  MAX_PAYLOAD_BYTES,
  unreachable,
  type NexiSource,
  type NexiSourceFailure,
} from "./t3team-nexiUpdate-source.ts";

export interface NexiUpdateQuery {
  readonly version: string;
  readonly platform: string;
  readonly arch: string;
}

type VettedAsset = { readonly name: string; readonly size: number };
/** Asset ids the last check vetted, with the size the release lists for them. */
export type NexiAssetRegistry = Map<number, VettedAsset>;
export const createNexiAssetRegistry = (): NexiAssetRegistry => new Map();

/** Which release to offer, as a wire answer; every failure is a state, never an exception. */
export const checkNexiUpdate = Effect.fn("t3team.nexiUpdate.check")(
  function* (source: NexiSource, registry: NexiAssetRegistry, query: NexiUpdateQuery) {
    if (!isSupportedNexiRuntime(query)) {
      return {
        kind: "unsupported",
        message: `There is no Nexi Work build to update to for ${query.platform} ${query.arch}.`,
      } satisfies NexiUpdateCheck;
    }
    const picked = pickNexiUpdate({
      releases: yield* source.listReleases(),
      currentVersion: query.version,
      platform: query.platform,
      arch: query.arch,
    });
    if (picked === null) return { kind: "up-to-date" } satisfies NexiUpdateCheck;
    const { payload, manifest: manifestAsset, release, version } = picked;
    const manifest = parseNexiUpdateManifest(yield* source.readManifestText(manifestAsset.id));
    // The manifest comes from the same release; it must describe exactly the file offered.
    if (
      manifest === null ||
      manifest.version !== version ||
      manifest.path !== payload.name ||
      manifest.size !== payload.size ||
      payload.size > MAX_PAYLOAD_BYTES
    ) {
      return yield* Effect.fail(
        unreachable(
          `Release ${release.tag_name} has an update manifest that does not match its files; not offering it.`,
        ),
      );
    }
    registry.set(payload.id, { name: payload.name, size: payload.size });
    return {
      kind: "available",
      version,
      tag: release.tag_name,
      notes: release.body ?? "",
      htmlUrl: release.html_url,
      publishedAt: release.published_at,
      file: {
        assetId: payload.id,
        name: payload.name,
        size: payload.size,
        sha512: manifest.sha512,
      },
    } satisfies NexiUpdateCheck;
  },
  Effect.catch((failure) => Effect.succeed(failure satisfies NexiSourceFailure)),
);

/** The asset's bytes, or null when the id is not one the last check vetted (nothing is requested then). */
export const openNexiAsset = Effect.fn("t3team.nexiUpdate.openAsset")(function* (
  source: NexiSource,
  registry: NexiAssetRegistry,
  assetId: number,
) {
  const asset = registry.get(assetId);
  if (asset === undefined) return null;
  const response = yield* source.openAsset(assetId);
  const length = response.headers["content-length"];
  if (length !== undefined && Number(length) !== asset.size) {
    return yield* Effect.fail(unreachable("The asset on GHE is not the size the release lists."));
  }
  return { response, size: asset.size };
});
