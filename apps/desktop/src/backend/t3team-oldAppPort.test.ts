// @effect-diagnostics nodeBuiltinImport:off - binds a local HTTP server to exercise the 3773 environment probe.
import { assert, describe, it } from "@effect/vitest";
import * as NodeHttp from "node:http";
import * as NodeNet from "node:net";

import { ENVIRONMENT_DESCRIPTOR_PATH } from "./t3team-oldAppPaths.ts";
import { probeOldNexiPort } from "./t3team-oldAppPort.ts";

const listen = (
  handler: (request: NodeHttp.IncomingMessage, response: NodeHttp.ServerResponse) => void,
) =>
  new Promise<{ server: NodeHttp.Server; port: number }>((resolve, reject) => {
    const server = NodeHttp.createServer(handler);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as NodeNet.AddressInfo;
      resolve({ server, port: address.port });
    });
  });

const close = (server: NodeHttp.Server) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

describe("probeOldNexiPort", () => {
  it("identifies a T3 environment descriptor on a live local port", async () => {
    const { server, port } = await listen((request, response) => {
      if (request.url === ENVIRONMENT_DESCRIPTOR_PATH) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            environmentId: "env-old",
            serverVersion: "0.1.6",
            platform: "darwin",
            label: "Nexi Work",
            capabilities: {},
            orchestrationProtocolVersion: 1,
          }),
        );
        return;
      }
      response.writeHead(404);
      response.end();
    });
    try {
      const result = await probeOldNexiPort({ port, timeoutMs: 1_000 });
      assert.equal(result.kind, "identified");
      if (result.kind === "identified") assert.equal(result.serverVersion, "0.1.6");
    } finally {
      await close(server);
    }
  });

  it("does not treat an unrelated listener as the old Nexi server", async () => {
    const { server, port } = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("ok");
    });
    try {
      const result = await probeOldNexiPort({ port, timeoutMs: 1_000 });
      assert.equal(result.kind, "other");
    } finally {
      await close(server);
    }
  });

  it("reports not-listening when the port is closed", async () => {
    const { server, port } = await listen((_request, response) => {
      response.end();
    });
    await close(server);
    const result = await probeOldNexiPort({ port, timeoutMs: 400 });
    assert.equal(result.kind, "not-listening");
  });
});
