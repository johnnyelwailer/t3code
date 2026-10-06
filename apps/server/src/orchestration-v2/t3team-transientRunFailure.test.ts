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
});
