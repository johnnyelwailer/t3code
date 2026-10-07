import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { T3TeamMyWorkDigestPlan } from "./t3team-myworkArrangement.ts";

const decode = Schema.decodeUnknownSync(T3TeamMyWorkDigestPlan);

const plan = {
  producer: "agent",
  producedAt: "2026-10-06T08:00:00.000Z",
  sections: [
    {
      id: "now",
      kind: "items",
      widget: "my-work.tickets",
      placement: "main",
      heading: "Do now",
      items: [{ ticketId: "t-1", why: "blocks the release" }],
    },
    {
      id: "reviews",
      kind: "reviews",
      placement: "side",
      heading: "Reviews owed",
      items: [],
      reviewIds: ["pr-1"],
    },
  ],
};

describe("T3TeamMyWorkDigestPlan", () => {
  it("decodes a plan in the web DigestPlan shape", () => {
    expect(decode(plan).sections).toHaveLength(2);
  });

  it("rejects an unknown placement, kind and producer", () => {
    expect(() =>
      decode({ ...plan, sections: [{ ...plan.sections[0], placement: "top" }] }),
    ).toThrow();
    expect(() => decode({ ...plan, sections: [{ ...plan.sections[0], kind: "chart" }] })).toThrow();
    expect(() => decode({ ...plan, producer: "human" })).toThrow();
  });

  it("rejects an empty ticket id and too many sections", () => {
    expect(() =>
      decode({ ...plan, sections: [{ ...plan.sections[0], items: [{ ticketId: " " }] }] }),
    ).toThrow();
    expect(() => decode({ ...plan, sections: Array(13).fill(plan.sections[0]) })).toThrow();
  });
});
