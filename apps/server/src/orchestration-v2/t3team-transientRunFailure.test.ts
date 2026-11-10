import type { OrchestrationV2ProviderFailure } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { classifyTransientRunFailure } from "./t3team-transientRunFailure.ts";

const failure = (
  over: Partial<OrchestrationV2ProviderFailure>,
): OrchestrationV2ProviderFailure => ({
  class: "provider_error",
  message: "Something went wrong",
  code: null,
  retryable: null,
  ...over,
});

describe("classifyTransientRunFailure", () => {
  it("accepts gateway capacity / rate / 5xx text and keeps the retry directive", () => {
    expect(
      classifyTransientRunFailure(
        failure({ message: '423: Reservation owner is busy {"retry_after_seconds": 20}' }),
      ),
    ).toEqual({
      message: '423: Reservation owner is busy {"retry_after_seconds": 20}',
      directiveSeconds: 20,
      outage: false,
    });
    expect(
      classifyTransientRunFailure(failure({ message: "HTTP 503 service unavailable" })),
    ).not.toBeNull();
  });

  it("accepts provider-marked retryable failures and transport errors (watchdog stalls)", () => {
    expect(classifyTransientRunFailure(failure({ retryable: true }))).not.toBeNull();
    expect(
      classifyTransientRunFailure(
        failure({ class: "transport_error", code: "turn_inactivity", retryable: true }),
      ),
    ).not.toBeNull();
  });

  it("treats Cursor network failures as transient outages", () => {
    for (const over of [
      { message: "[unknown] Failed to connect to API key exchange endpoint: fetch failed" },
      { message: "Provider turn failed.", code: "connection_stalled" },
      { message: "read ECONNRESET" },
      { message: "ConnectError: [unavailable] upstream connect error" },
    ]) {
      expect(classifyTransientRunFailure(failure(over))).toMatchObject({ outage: true });
    }
    // a plain provider stall is transient but not an outage: it keeps the short ladder
    expect(
      classifyTransientRunFailure(
        failure({ class: "transport_error", code: "turn_inactivity", retryable: true }),
      ),
    ).toMatchObject({ outage: false });
  });

  it("treats a refused connection as an unreachable-provider outage, but not a hung-up MCP server", () => {
    expect(
      classifyTransientRunFailure(failure({ message: "connect ECONNREFUSED 127.0.0.1:8080" })),
    ).toMatchObject({ outage: true, unreachable: true });
    expect(
      classifyTransientRunFailure(failure({ message: "MCP server connection closed" })),
    ).toBeNull();
  });

  it("does not retry a Cursor usage limit even when the text mentions the network", () => {
    expect(
      classifyTransientRunFailure(
        failure({
          class: "usage_limit",
          message: "fetch failed: out of usage",
          resetAt: "2026-10-10T00:00:00.000Z",
        }),
      ),
    ).toBeNull();
  });

  it("rejects usage limits, permission/validation errors, unanswered stops and plain errors", () => {
    expect(classifyTransientRunFailure(null)).toBeNull();
    expect(
      classifyTransientRunFailure(failure({ class: "usage_limit", retryable: true })),
    ).toBeNull();
    expect(
      classifyTransientRunFailure(failure({ class: "permission_error", message: "429" })),
    ).toBeNull();
    expect(classifyTransientRunFailure(failure({ class: "validation_error" }))).toBeNull();
    expect(
      classifyTransientRunFailure(
        failure({ class: "transport_error", code: "interrupt_no_terminal", retryable: true }),
      ),
    ).toBeNull();
    expect(classifyTransientRunFailure(failure({ message: "400 invalid request" }))).toBeNull();
  });

  // nx-nexi#1216: a configuration error answers the same on every try, so no retry ladder and no
  // "Gateway keeps failing" auto-resume, even when the failure arrived marked retryable.
  it("never retries a deterministic model/provider configuration error", () => {
    for (const message of [
      "Provider instance 'nexplore' has no declared default model. Valid models: 'no-thinking', 'low', 'medium'. Use model: \"nexplore/<slug>\" with one of these exact slugs.",
      "Model 'gpt-9' is not available on provider instance 'codex'. Valid models: 'gpt-5'.",
      "Unknown provider instance 'nexplroe'. Available provider instances: 'nexplore'.",
      "Provider instance 'claudeAgent' cannot run a child: the provider is not installed.",
      "Provider instance 'nexplore' has no models configured to run a child on.",
      "Cannot choose the latest model for provider instance 'nexplore' because no provider registry is wired.",
    ]) {
      expect(
        classifyTransientRunFailure(failure({ message, retryable: true })),
        message,
      ).toBeNull();
      expect(
        classifyTransientRunFailure(failure({ class: "transport_error", message })),
        message,
      ).toBeNull();
    }
  });

  it("keeps retrying a gateway error that merely mentions a model", () => {
    expect(
      classifyTransientRunFailure(failure({ message: "HTTP 503: model medium is overloaded" })),
    ).not.toBeNull();
  });
});
