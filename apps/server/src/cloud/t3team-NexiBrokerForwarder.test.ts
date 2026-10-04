// @effect-diagnostics nodeBuiltinImport:off - a raw RFC 6455 fake broker over node:http / node:net.
import * as NodeCrypto from "node:crypto";
import * as NodeHttp from "node:http";
import * as NodeNet from "node:net";

import { afterEach, assert, describe, it } from "@effect/vitest";

import { startBrokerForwarder } from "./t3team-NexiBrokerForwarder.ts";

/**
 * A fake broker client stream: accepts the upgrade, records the request, and answers every binary
 * frame through `reply` — the minimum of RFC 6455 a server needs (unmasked frames out, masked in).
 */
function fakeBroker(reply: (data: Buffer) => Buffer) {
  const upgrades: Array<{ url: string; authorization: string | undefined }> = [];
  const server = NodeHttp.createServer();
  server.on("upgrade", (req, socket: NodeNet.Socket) => {
    upgrades.push({ url: req.url ?? "", authorization: req.headers.authorization });
    const accept = NodeCrypto.createHash("sha1")
      .update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    let pending = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      for (;;) {
        if (pending.length < 2) return;
        const opcode = pending[0]! & 0x0f;
        let length = pending[1]! & 0x7f;
        let offset = 2;
        if (length === 126) {
          length = pending.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          length = Number(pending.readBigUInt64BE(2));
          offset = 10;
        }
        if (pending.length < offset + 4 + length) return;
        const mask = pending.subarray(offset, offset + 4);
        const payload = Buffer.from(pending.subarray(offset + 4, offset + 4 + length));
        for (let i = 0; i < payload.length; i++) payload[i]! ^= mask[i % 4]!;
        pending = pending.subarray(offset + 4 + length);
        if (opcode === 0x8) return socket.end();
        if (opcode === 0x2 || opcode === 0x1) socket.write(frame(reply(payload)));
      }
    });
    socket.on("error", () => {});
  });
  const frame = (payload: Buffer) => {
    const header =
      payload.length < 126
        ? Buffer.from([0x82, payload.length])
        : payload.length < 65_536
          ? Buffer.from([0x82, 126, payload.length >> 8, payload.length & 0xff])
          : Buffer.concat([
              Buffer.from([0x82, 127]),
              (() => {
                const b = Buffer.alloc(8);
                b.writeBigUInt64BE(BigInt(payload.length));
                return b;
              })(),
            ]);
    return Buffer.concat([header, payload]);
  };
  return new Promise<{ url: string; upgrades: typeof upgrades; close: () => void }>((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as NodeNet.AddressInfo;
      resolve({
        url: `ws://127.0.0.1:${port}/v1/client/stream?session=42`,
        upgrades,
        close: () => {
          server.closeAllConnections();
          server.close();
        },
      });
    }),
  );
}

const connect = (port: number) =>
  new Promise<NodeNet.Socket>((resolve) => {
    const s = NodeNet.connect(port, "127.0.0.1", () => resolve(s));
    s.on("error", () => {}); // teardown resets sockets the test already finished with
  });
const readUntil = (socket: NodeNet.Socket, bytes: number) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size >= bytes) resolve(Buffer.concat(chunks));
    });
  });

describe("startBrokerForwarder", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.splice(0).forEach((c) => c());
  });

  it("relays a local connection through the broker stream and back, with a fresh token per connection", async () => {
    const broker = await fakeBroker((data) => Buffer.from(data.toString().toUpperCase()));
    let issued = 0;
    const forwarder = await startBrokerForwarder({
      streamUrl: broker.url,
      accessToken: async () => `token-${++issued}`,
    });
    cleanups.push(broker.close, forwarder.close);

    for (const word of ["hello", "again"]) {
      const socket = await connect(forwarder.port);
      socket.write(word);
      assert.equal((await readUntil(socket, word.length)).toString(), word.toUpperCase());
      socket.destroy();
    }
    assert.deepEqual(
      broker.upgrades.map((u) => u.authorization),
      ["Bearer token-1", "Bearer token-2"],
    );
    assert.equal(broker.upgrades[0]!.url, "/v1/client/stream?session=42");
  });

  it("carries 3 MiB of binary byte for byte, through the upload backpressure", async () => {
    const broker = await fakeBroker((data) => data);
    const forwarder = await startBrokerForwarder({
      streamUrl: broker.url,
      accessToken: async () => "t",
    });
    cleanups.push(broker.close, forwarder.close);
    const payload = NodeCrypto.randomBytes(3 * 1024 * 1024);
    const socket = await connect(forwarder.port);
    const received = readUntil(socket, payload.length);
    socket.write(payload);
    assert.ok((await received).equals(payload));
    socket.destroy();
  });
});
