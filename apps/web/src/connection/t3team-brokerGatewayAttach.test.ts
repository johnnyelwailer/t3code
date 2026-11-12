import { EnvironmentId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";

import { cloudBrokerApi } from "~/cloud/t3team-cloudBrokerApi";
import * as PrimaryTarget from "~/environments/primary/target";
import { makeWebBrokerEnvironmentGateway } from "./t3team-brokerGateway";

const environmentId = EnvironmentId.make("cloud-env");
const ready: CloudSession = {
  sessionId: "200",
  providerKind: "github_actions",
  phase: "ready",
  environmentId,
  remainingSeconds: 0,
  elapsedSeconds: 24_000,
  machineLabel: "ubuntu",
  failureReason: null,
  detailsUrl: null,
};

describe("broker attach deadlines", () => {
  it.effect(
    "reads a later hold start on reconnect instead of capturing the deadline at Connect",
    () =>
      Effect.gen(function* () {
        using _origin = vi
          .spyOn(PrimaryTarget, "resolvePrimaryEnvironmentHttpUrl")
          .mockReturnValue("http://localhost");
        using attach = vi.spyOn(cloudBrokerApi, "attach").mockResolvedValue({
          sessionId: ready.sessionId,
          environmentId,
          label: "Cloud",
          httpBaseUrl: "http://127.0.0.1:4020",
          wsBaseUrl: "ws://127.0.0.1:4020",
        });
        let sessions: ReadonlyArray<CloudSession> = [ready];
        const gateway = makeWebBrokerEnvironmentGateway(async () => sessions);
        const request = { sessionId: ready.sessionId, expectedEnvironmentId: environmentId };
        yield* gateway.attach(request);
        expect(attach).toHaveBeenLastCalledWith(ready.sessionId, environmentId, undefined);

        const endsAt = "2026-10-24T17:45:00.000Z";
        sessions = [{ ...ready, endsAt }];
        yield* gateway.attach(request);
        expect(attach).toHaveBeenLastCalledWith(ready.sessionId, environmentId, endsAt);

        sessions = [{ ...ready, sessionId: "201", endsAt }];
        yield* gateway.attach(request);
        expect(attach).toHaveBeenLastCalledWith(ready.sessionId, environmentId, undefined);
      }),
  );
});
