/**
 * Row typing for the provider-usage hold SQLite repository (split out of
 * `t3team-ProviderUsageHolds.ts`): the `SqlSchema` result schema, the
 * row-to-value mapping, and the request schemas shared by the queries.
 *
 * @module t3team.persistence.Layers.ProviderUsageHoldsRow
 */
import { MessageId, ProviderDriverKind, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";

import { ProviderUsageHold } from "../Services/t3team-ProviderUsageHolds.ts";

/** SQLite row shape (camelCase aliases; `auto_resume` is a 0/1 integer). */
export const ProviderUsageHoldDbRow = Schema.Struct({
  threadId: Schema.String,
  provider: Schema.String,
  providerInstanceId: Schema.NullOr(Schema.String),
  since: Schema.String,
  resetsAt: Schema.NullOr(Schema.String),
  autoResume: Schema.Number,
  pendingTurnMessageId: Schema.NullOr(Schema.String),
  releasedAt: Schema.NullOr(Schema.String),
  releaseReason: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
});
export type ProviderUsageHoldDbRowValue = typeof ProviderUsageHoldDbRow.Type;

export const rowToHold = (row: ProviderUsageHoldDbRowValue): ProviderUsageHold => ({
  threadId: ThreadId.make(row.threadId),
  provider: ProviderDriverKind.make(row.provider),
  providerInstanceId:
    row.providerInstanceId === null ? null : ProviderInstanceId.make(row.providerInstanceId),
  since: row.since,
  resetsAt: row.resetsAt,
  autoResume: row.autoResume === 1,
  pendingTurnMessageId:
    row.pendingTurnMessageId === null ? null : MessageId.make(row.pendingTurnMessageId),
  releasedAt: row.releasedAt,
  releaseReason: row.releaseReason,
  updatedAt: row.updatedAt,
});

export const toHoldOption = (option: Option.Option<ProviderUsageHoldDbRowValue>) =>
  Option.map(rowToHold)(option);

export const ByThreadIdRequest = Schema.Struct({ threadId: Schema.String });

export const EmptyRequest = Schema.Struct({});
