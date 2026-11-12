/**
 * What `GET /api/t3team/nexi-update/latest` answers and the desktop's update provider reads. The
 * file is named by a release asset id the server vetted; the desktop never sees a GHE credential,
 * a GHE URL or a release list.
 */
import * as Schema from "effect/Schema";

export const NEXI_UPDATE_LATEST_PATH = "/api/t3team/nexi-update/latest";
export const NEXI_UPDATE_ASSET_PATH = "/api/t3team/nexi-update/asset";

const Message = Schema.Struct({ message: Schema.String });

export const NexiUpdateCheck = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("up-to-date") }),
  Schema.Struct({
    kind: Schema.Literal("available"),
    version: Schema.String,
    tag: Schema.String,
    notes: Schema.String,
    htmlUrl: Schema.String,
    publishedAt: Schema.NullOr(Schema.String),
    file: Schema.Struct({
      assetId: Schema.Number,
      name: Schema.String,
      size: Schema.Number,
      sha512: Schema.String,
    }),
  }),
  // No usable GHE sign-in: none saved, none in the environment, none from `gh`, or GHE refused it.
  Schema.Struct({ kind: Schema.Literal("signed-out"), ...Message.fields }),
  Schema.Struct({ kind: Schema.Literal("unreachable"), ...Message.fields }),
  Schema.Struct({ kind: Schema.Literal("unsupported"), ...Message.fields }),
]);
export type NexiUpdateCheck = typeof NexiUpdateCheck.Type;

export const decodeNexiUpdateCheck = Schema.decodeUnknownEffect(NexiUpdateCheck);
