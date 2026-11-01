import type {
  EnvironmentId,
  OrchestrationV2ThreadProjection,
  RuntimeRequestId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  makeThreadAnswersAnnouncer,
  onThreadAnswersResolved,
  type ThreadAnswersResolved,
} from "./t3team-threadAnswers.ts";

const request = (id: string, status: "pending" | "resolved", answers?: Record<string, unknown>) =>
  ({
    id: id as RuntimeRequestId,
    kind: "user_input",
    status,
    createdAt: DateTime.makeUnsafe(0),
    resolvedAt: status === "resolved" ? DateTime.makeUnsafe(5_000) : null,
    ...(answers === undefined ? {} : { answers }),
  }) as unknown as OrchestrationV2ThreadProjection["runtimeRequests"][number];

const item = (id: string) =>
  ({
    type: "user_input_request",
    requestId: id as RuntimeRequestId,
    questions: [{ id: "q", header: "h", question: "?", options: [] }],
  }) as unknown as OrchestrationV2ThreadProjection["turnItems"][number];

const projection = (...requests: ReturnType<typeof request>[]) => ({
  runtimeRequests: requests,
  turnItems: requests.map((r) => item(r.id)),
});

describe("makeThreadAnswersAnnouncer", () => {
  const events: ThreadAnswersResolved[] = [];
  const stop = onThreadAnswersResolved((event) => events.push(event));
  afterEach(() => (events.length = 0));
  const announcer = () => makeThreadAnswersAnnouncer("e" as EnvironmentId, "t" as ThreadId);

  it("reports a request answered after this stream saw it pending as live, once", () => {
    const announce = announcer();
    announce(projection(request("r1", "pending")));
    expect(events).toEqual([]);
    announce(projection(request("r1", "resolved", { q: "Once" })));
    announce(projection(request("r1", "resolved", { q: "Once" })));
    expect(events).toHaveLength(1);
    expect(events[0]?.live.map((a) => [a.requestId, a.resolvedAtMs])).toEqual([["r1", 5_000]]);
    expect(events[0]?.missed).toEqual([]);
  });

  it("reports an already-resolved request on the first projection as missed, never live", () => {
    announcer()(projection(request("r1", "resolved", { q: "Once" })));
    expect(events[0]?.live).toEqual([]);
    expect(events[0]?.missed.map((a) => a.requestId)).toEqual(["r1"]);
  });

  it("reports a request that appeared and resolved between projections as missed", () => {
    const announce = announcer();
    announce(projection());
    announce(projection(request("r2", "resolved", { q: "Once" })));
    expect(events[0]?.missed.map((a) => a.requestId)).toEqual(["r2"]);
  });

  it("ignores a resolution without answers", () => {
    const announce = announcer();
    announce(projection(request("r1", "pending")));
    announce(projection(request("r1", "resolved")));
    expect(events).toEqual([]);
    stop();
  });
});
