import { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { BrokerConnectionTarget, PersistedConnectionTarget } from "./model.ts";
import { mergeLearnedRoutes } from "./routes.ts";

const target = new BrokerConnectionTarget({
  environmentId: EnvironmentId.make("cloud"),
  label: "Cloud",
  sessionId: "1",
  endsAt: "2026-10-24T12:00:00Z",
});

const encodeTarget = Schema.encodeSync(PersistedConnectionTarget);
const decodeTarget = Schema.decodeSync(PersistedConnectionTarget);

describe("broker hold deadline persistence", () => {
  it("retains the deadline through a persisted connection round trip", () => {
    const encoded = encodeTarget(target);
    expect(decodeTarget(encoded)).toEqual(target);
  });

  it("saves the cleared deadline after a replacement session attaches", () => {
    const replacement = new BrokerConnectionTarget({
      environmentId: target.environmentId,
      label: target.label,
      sessionId: target.sessionId,
    });
    const activeRoute = { target: replacement, profile: Option.none() };
    expect(
      mergeLearnedRoutes({
        entry: { target, profile: Option.none(), enabled: true },
        activeRoute,
        reported: [],
        allowInsecure: true,
      }),
    ).toEqual([activeRoute]);
  });
});
