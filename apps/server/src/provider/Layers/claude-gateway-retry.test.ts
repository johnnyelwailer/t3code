import { describe, expect, it } from "vite-plus/test";

import {
  MAX_TRANSIENT_GATEWAY_RETRIES,
  gatewayRetrySteerMessage,
  isTransientGatewayErrorText,
  transientGatewayRetryDelayMs,
} from "./claude-gateway-retry.ts";

describe("claude-gateway-retry", () => {
  it("classifies gateway capacity reservations and rate limits as transient", () => {
    expect(
      isTransientGatewayErrorText(
        'Request failed with status 423: {"type":"reservation_error","code":"gpu_reserved","retry_after_seconds":5}',
      ),
    ).toBe(true);
    expect(isTransientGatewayErrorText("429 Too Many Requests (rate_limited)")).toBe(true);
    expect(isTransientGatewayErrorText("Internal Server Error: 502 Bad Gateway")).toBe(true);
    expect(isTransientGatewayErrorText("Service Unavailable; retry-after: 30")).toBe(true);
    expect(isTransientGatewayErrorText("HTTP 504: upstream request timed out")).toBe(true);
  });

  it("does not classify permanent or user-initiated failures as transient", () => {
    expect(isTransientGatewayErrorText("")).toBe(false);
    expect(isTransientGatewayErrorText("Invalid API key (401 Unauthorized)")).toBe(false);
    expect(isTransientGatewayErrorText("Malformed request body (400 Bad Request)")).toBe(false);
    // "request too large" is 413 phrasing — a permanent error, not throttling.
    expect(isTransientGatewayErrorText("413 Request Entity Too Large: request too large")).toBe(
      false,
    );
    expect(isTransientGatewayErrorText("HTTP status 413: request too large")).toBe(false);
    expect(isTransientGatewayErrorText("tool not found: preview_navigate")).toBe(false);
    expect(isTransientGatewayErrorText("max_turns reached")).toBe(false);
  });

  it("honors retry_after_seconds from the error body", () => {
    expect(
      transientGatewayRetryDelayMs(1, '{"type":"reservation_error","retry_after_seconds":30}'),
    ).toBe(30_000);
    expect(transientGatewayRetryDelayMs(2, "retry_after_seconds=5")).toBe(5_000);
    // An outrageous directive is capped, not obeyed blindly.
    expect(transientGatewayRetryDelayMs(1, "retry_after_seconds=9999")).toBe(60_000);
  });

  it("honors Retry-After header guidance", () => {
    expect(transientGatewayRetryDelayMs(1, "Retry-After: 12")).toBe(12_000);
    expect(transientGatewayRetryDelayMs(1, 'retry-after":"7')).toBe(7_000);
  });

  it("falls back to jittered exponential backoff without a directive", () => {
    // Deterministic random: always the midpoint of the 50–100% jitter band.
    const mid = () => 0.5;
    expect(transientGatewayRetryDelayMs(1, "upstream hiccup", mid)).toBe(1_500);
    expect(transientGatewayRetryDelayMs(2, "upstream hiccup", mid)).toBe(3_000);
    expect(transientGatewayRetryDelayMs(3, "upstream hiccup", mid)).toBe(6_000);
    // Jitter stays inside the 50–100% band.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      for (const seed of [0, 0.5, 0.999]) {
        const delay = transientGatewayRetryDelayMs(attempt, "upstream hiccup", () => seed);
        const base = 2_000 * 2 ** (attempt - 1);
        expect(delay).toBeGreaterThanOrEqual(base / 2);
        expect(delay).toBeLessThanOrEqual(base);
      }
    }
    // Backoff caps at 60s.
    expect(transientGatewayRetryDelayMs(10, "upstream hiccup", () => 1)).toBe(60_000);
  });

  it("bounds the retry budget and keeps the steer message transcript-safe", () => {
    expect(MAX_TRANSIENT_GATEWAY_RETRIES).toBe(5);
    const steer = gatewayRetrySteerMessage(2);
    expect(steer).toContain("Automatic retry 2 of 5");
    expect(steer).toContain("Continue exactly where you stopped");
  });
});
