// @effect-diagnostics nodeBuiltinImport:off - a raw TCP listener; the Effect socket APIs have no loopback server with per-connection backpressure.
// @effect-diagnostics globalTimers:off - WebSocket has no drain event, so upload backpressure polls bufferedAmount outside any Effect.
import * as NodeNet from "node:net";

/**
 * A loopback forwarder per attached broker session: `127.0.0.1:<port>` on this machine is the VM's
 * `t3 serve`. Every accepted TCP connection becomes one WebSocket to the broker
 * (`/v1/client/stream`), which splices it to one stream the VM's agent opens to its server — the
 * same shape as `ssh -L`, with the broker in place of sshd. Uses Node's built-in WebSocket.
 */

/** Pause the local socket while this much upload is still queued for the broker. */
const UPLOAD_HIGH_WATER_BYTES = 1024 * 1024;
/** The local leg is loopback into this machine; a reader this far behind is stuck, not slow. */
const DOWNLOAD_LIMIT_BYTES = 16 * 1024 * 1024;
const BACKPRESSURE_POLL_MS = 20;

export interface BrokerForwarder {
  readonly port: number;
  readonly close: () => void;
}

export function startBrokerForwarder(input: {
  /** wss://… of the broker's client stream for this session. */
  readonly streamUrl: string;
  /** Called per connection, so every stream carries a live access token. */
  readonly accessToken: () => Promise<string>;
  readonly onError?: (message: string) => void;
}): Promise<BrokerForwarder> {
  const sockets = new Set<NodeNet.Socket>();

  const pipe = async (tcp: NodeNet.Socket) => {
    tcp.pause(); // nothing flows until the broker stream is open
    sockets.add(tcp);
    tcp.on("close", () => sockets.delete(tcp));
    tcp.on("error", () => tcp.destroy());
    let ws: WebSocket;
    try {
      ws = new WebSocket(input.streamUrl, {
        headers: { Authorization: `Bearer ${await input.accessToken()}` },
      } as unknown as string[]);
    } catch (error) {
      input.onError?.(`Could not open a broker stream: ${String(error)}`);
      tcp.destroy();
      return;
    }
    ws.binaryType = "arraybuffer";
    let throttle: ReturnType<typeof setInterval> | undefined;
    const end = () => {
      if (throttle) clearInterval(throttle);
      tcp.destroy();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    };
    ws.addEventListener("open", () => tcp.resume());
    ws.addEventListener("message", (event) => {
      tcp.write(Buffer.from(event.data as ArrayBuffer));
      if (tcp.writableLength > DOWNLOAD_LIMIT_BYTES) end();
    });
    ws.addEventListener("close", end);
    ws.addEventListener("error", end);
    tcp.on("data", (chunk) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(chunk);
      if (ws.bufferedAmount >= UPLOAD_HIGH_WATER_BYTES && !throttle) {
        tcp.pause();
        throttle = setInterval(() => {
          if (ws.bufferedAmount < UPLOAD_HIGH_WATER_BYTES) {
            clearInterval(throttle);
            throttle = undefined;
            tcp.resume();
          }
        }, BACKPRESSURE_POLL_MS);
      }
    });
    tcp.on("close", end);
  };

  return new Promise((resolve, reject) => {
    const server = NodeNet.createServer((tcp) => void pipe(tcp));
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string")
        return reject(new Error("no loopback port"));
      resolve({
        port: address.port,
        close: () => {
          server.close();
          for (const socket of sockets) socket.destroy();
        },
      });
    });
  });
}
