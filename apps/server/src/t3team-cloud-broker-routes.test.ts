import {
  AuthRelayWriteScope,
  AuthSessionId,
  type CloudSessionAttachInput,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/http";
import { EnvironmentAuth } from "./auth/EnvironmentAuth.ts";
import { NexiBrokerService } from "./cloud/t3team-NexiBrokerService.ts";
import { ServerConfig } from "./config.ts";
import { t3teamCloudBrokerRouteLayer } from "./t3team-cloud-broker-routes.ts";

const auth = Layer.mock(EnvironmentAuth, {
  authenticateHttpRequest: () =>
    Effect.succeed({
      sessionId: AuthSessionId.make("test"),
      subject: "test",
      method: "bearer-access-token",
      scopes: [AuthRelayWriteScope],
    }),
});

describe("cloud broker attach route", () => {
  it("passes the known hold deadline through the HTTP adapter", async () => {
    const attached: CloudSessionAttachInput[] = [];
    const broker = Layer.mock(NexiBrokerService, {
      enabled: true,
      status: { enabled: true, accountId: "test" },
      attach: (input) =>
        Effect.sync(() => {
          attached.push(input);
          return {
            sessionId: input.sessionId,
            environmentId: "cloud",
            label: "Cloud",
            httpBaseUrl: "http://127.0.0.1:4000",
            wsBaseUrl: "ws://127.0.0.1:4000",
          };
        }),
    });
    const { handler, dispose } = HttpRouter.toWebHandler(
      t3teamCloudBrokerRouteLayer.pipe(
        Layer.provideMerge(broker),
        Layer.provideMerge(auth),
        Layer.provideMerge(
          ServerConfig.layerTest(".", { prefix: "cloud-broker-http-" }).pipe(
            Layer.provide(NodeServices.layer),
          ),
        ),
      ),
      { disableLogger: true },
    );
    const input = { sessionId: "200", environmentId: "cloud", endsAt: "2026-10-24T12:00:00Z" };
    try {
      const response = await handler(
        new Request("http://localhost/api/t3team/cloud-broker/attach", {
          method: "POST",
          headers: { authorization: "Bearer test", "content-type": "application/json" },
          body: JSON.stringify(input),
        }),
      );
      expect(response.status).toBe(200);
      expect(attached).toEqual([input]);
    } finally {
      await dispose();
    }
  });
});
