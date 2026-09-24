// Sibling test file (rather than extending
// previewAutomationRequestConsumer.test.ts, an upstream-tracked file) so the
// change stays additive.
import {
  EnvironmentId,
  type PreviewAutomationResponse,
  type PreviewAutomationStreamEvent,
  ThreadId,
} from "@t3tools/contracts";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import { createPreviewAutomationRequestConsumerAtom } from "./previewAutomationRequestConsumer";

const environmentId = EnvironmentId.make("environment-1");

describe("previewAutomationRequestConsumer connection reset", () => {
  it("forgets a connection whose stream failed and adopts the next one", async () => {
    const requestsAtom = Atom.make<AsyncResult.AsyncResult<PreviewAutomationStreamEvent, Error>>(
      AsyncResult.success<PreviewAutomationStreamEvent, Error>({
        type: "connected",
        connectionId: "connection-1",
      }),
    );
    const connectionAtom = Atom.make<string | null>(null);
    const handleRequest = vi.fn(async () => undefined);
    const responses: PreviewAutomationResponse[] = [];
    const respond = vi.fn(async (response: PreviewAutomationResponse) => {
      responses.push(response);
    });
    const consumerAtom = createPreviewAutomationRequestConsumerAtom({
      requestsAtom,
      clientId: "client-1",
      connectionAtom,
      environmentId,
      requestHandlerAtom: Atom.make({ handle: handleRequest }),
      respond,
      label: "test:preview-automation-stream-failed",
    });
    const registry = AtomRegistry.make();

    registry.mount(consumerAtom);
    await vi.waitFor(() => expect(registry.get(connectionAtom)).toBe("connection-1"));

    registry.set(requestsAtom, AsyncResult.fail(new Error("stream ended")));
    expect(registry.get(connectionAtom)).toBeNull();

    registry.set(
      requestsAtom,
      AsyncResult.success({ type: "connected", connectionId: "connection-2" }),
    );
    registry.set(
      requestsAtom,
      AsyncResult.success({
        type: "request",
        connectionId: "connection-2",
        request: {
          requestId: "request-renewed",
          threadId: ThreadId.make("thread-1"),
          operation: "status",
          input: {},
          timeoutMs: 15_000,
        },
      }),
    );

    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(1));
    expect(registry.get(connectionAtom)).toBe("connection-2");
    expect(responses[0]).toMatchObject({
      connectionId: "connection-2",
      requestId: "request-renewed",
      ok: true,
    });
    registry.dispose();
  });
});
