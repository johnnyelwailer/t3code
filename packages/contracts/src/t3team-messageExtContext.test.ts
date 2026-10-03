import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { OrchestrationMessageContext } from "./composerContext.ts";
import {
  readT3TeamMessageExtContext,
  T3TEAM_MESSAGE_EXT_CONTEXT_KIND,
  withT3TeamMessageExtContext,
} from "./t3team-messageExtContext.ts";

const roundTrip = (context: OrchestrationMessageContext) =>
  Schema.decodeUnknownSync(OrchestrationMessageContext)(
    JSON.parse(JSON.stringify(Schema.encodeSync(OrchestrationMessageContext)(context))),
  );

describe("t3team message ext context record", () => {
  it("survives the message context wire schema and reads back", () => {
    const context = withT3TeamMessageExtContext({
      displayText: "approve",
      visibleToUser: false,
      widgetReply: { widgetId: "w-1", widgetTitle: "Picker" },
    });

    expect(context?.records).toHaveLength(1);
    expect(readT3TeamMessageExtContext(roundTrip(context!))).toEqual({
      displayText: "approve",
      visibleToUser: false,
      widgetReply: { widgetId: "w-1", widgetTitle: "Picker" },
    });
  });

  it("replaces an earlier ext record and keeps the other records", () => {
    const first = withT3TeamMessageExtContext({ displayText: "one" });
    const mention = Schema.decodeUnknownSync(OrchestrationMessageContext)({
      version: 1,
      records: [
        {
          version: 1,
          contextId: "mention-1",
          label: "README.md",
          kind: "mention",
          path: "README.md",
        },
      ],
    }).records[0]!;
    const withMention = { version: 1 as const, records: [...first!.records, mention] };

    const next = withT3TeamMessageExtContext({ displayText: "two" }, withMention);

    expect(next?.records.map((record) => record.kind)).toEqual([
      "mention",
      T3TEAM_MESSAGE_EXT_CONTEXT_KIND,
    ]);
    expect(readT3TeamMessageExtContext(next)).toEqual({ displayText: "two" });
  });

  it("reads nothing from a message without the record", () => {
    expect(readT3TeamMessageExtContext(undefined)).toBeUndefined();
    expect(readT3TeamMessageExtContext({ version: 1, records: [] })).toBeUndefined();
  });

  it("leaves the context unchanged when the ext is too large to ride a record", () => {
    const huge = { displayText: "x".repeat(70_000) };
    expect(withT3TeamMessageExtContext(huge)).toBeUndefined();
  });
});
