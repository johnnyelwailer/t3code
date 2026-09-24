import { describe, expect, it } from "vite-plus/test";

import {
  formatInstantLocal,
  isIsoInstant,
  isStructuredOutput,
  parseStructuredOutput,
} from "./t3team-structuredOutput.ts";
import { renderScalar, renderStructuredOutputText } from "./t3team-structuredOutputText.ts";

const ZURICH = "Europe/Zurich";
// A real gateway reservation payload (the #240 423 shape).
const RESERVED_JSON =
  '{"message":"GPU is reserved for about 8 minutes by jb (reason: GSI AssistMe AI – lokale Entwicklung).","type":"reservation_error","code":"gpu_reserved","author":"jb","purpose":"GSI AssistMe AI – lokale Entwicklung","retry_after_seconds":5,"starts_at":"2026-09-16T07:09:00Z","ends_at":"2026-09-16T07:21:42Z","status":"reserved","model":"qwen3.8","reserved_at":"2026-09-16T07:09:00Z"}';
// Same calendar day as the payload's instants, so they render without a day suffix.
const NOW = Date.parse("2026-09-16T07:05:00Z");

describe("parseStructuredOutput", () => {
  it("splits a status-prefixed JSON object", () => {
    const output = parseStructuredOutput(`423: ${RESERVED_JSON}`);
    expect(output.status).toBe(423);
    expect(isStructuredOutput(output)).toBe(true);
    expect((output.value as Record<string, unknown>).code).toBe("gpu_reserved");
  });

  it("parses a bare JSON object with no status", () => {
    const output = parseStructuredOutput('{"a":1}');
    expect(output.status).toBeNull();
    expect((output.value as Record<string, unknown>).a).toBe(1);
  });

  it("parses a JSON array with no status", () => {
    const output = parseStructuredOutput("[1,2,3]");
    expect(output.status).toBeNull();
    expect(Array.isArray(output.value)).toBe(true);
  });

  it("keeps the raw string when it is not structured JSON", () => {
    const output = parseStructuredOutput("Claude gave up after repeated API errors.");
    expect(output.value).toBeNull();
    expect(isStructuredOutput(output)).toBe(false);
    expect(output.raw).toBe("Claude gave up after repeated API errors.");
  });

  it("does not treat a status prefix with a non-JSON body as structured", () => {
    expect(parseStructuredOutput("413: payload too large").value).toBeNull();
  });

  it("does not treat malformed JSON as structured", () => {
    expect(parseStructuredOutput("423: {not json").value).toBeNull();
  });
});

describe("renderStructuredOutputText", () => {
  it("renders a reservation payload as complete, local-time, key/value text", () => {
    const text = renderStructuredOutputText(parseStructuredOutput(`423: ${RESERVED_JSON}`), {
      now: NOW,
      timeZone: ZURICH,
    });
    expect(text).not.toBeNull();
    const lines = text!.split("\n");
    expect(lines[0]).toBe("HTTP 423");
    expect(lines).toContain("  author: jb");
    expect(lines).toContain("  purpose: GSI AssistMe AI – lokale Entwicklung");
    expect(lines).toContain("  retry_after_seconds: 5");
    // ISO instants render in local (Zurich) time, not UTC.
    expect(lines).toContain("  ends_at: 09:21");
    expect(text).toContain("09:21");
    expect(text).not.toContain("07:21");
    // The raw JSON blob is gone.
    expect(text).not.toContain("{");
    expect(text).not.toContain('"message"');
  });

  it("indents nested objects", () => {
    const text = renderStructuredOutputText(parseStructuredOutput('{"outer":{"inner":42}}'));
    expect(text).toBe("outer:\n  inner: 42");
  });

  it("returns null for non-structured input", () => {
    expect(renderStructuredOutputText(parseStructuredOutput("plain error"))).toBeNull();
  });
});

describe("isIsoInstant / formatInstantLocal", () => {
  it("recognizes ISO-8601 instants and rejects other values", () => {
    expect(isIsoInstant("2026-09-16T07:21:42Z")).toBe(true);
    expect(isIsoInstant("2026-09-16T07:21:42+02:00")).toBe(true);
    expect(isIsoInstant("2026-09-16T07:21:42")).toBe(true);
    expect(isIsoInstant("not a date")).toBe(false);
    expect(isIsoInstant(12345)).toBe(false);
    expect(isIsoInstant(null)).toBe(false);
  });

  it("renders an instant in the target local time zone", () => {
    expect(formatInstantLocal("2026-09-16T07:21:42Z", { now: NOW, timeZone: ZURICH })).toBe("09:21");
  });

  it("does not hard-code UTC", () => {
    expect(formatInstantLocal("2026-09-16T07:21:42Z", { now: NOW, timeZone: "UTC" })).toBe("07:21");
  });

  it("adds a day suffix when the instant is not today", () => {
    const result = formatInstantLocal("2026-09-15T07:21:42Z", { now: NOW, timeZone: ZURICH });
    expect(result).toMatch(/^09:21 \(/);
  });

  it("returns null for non-instants", () => {
    expect(formatInstantLocal("nope", { now: NOW })).toBeNull();
    expect(formatInstantLocal(42, { now: NOW })).toBeNull();
  });
});

describe("renderScalar", () => {
  it("converts ISO instants to local time and passes other scalars through", () => {
    const options = { now: NOW, timeZone: ZURICH };
    expect(renderScalar("2026-09-16T07:21:42Z", options)).toBe("09:21");
    expect(renderScalar("hello", options)).toBe("hello");
    expect(renderScalar(42, options)).toBe("42");
    expect(renderScalar(true, options)).toBe("true");
    expect(renderScalar(null, options)).toBe("null");
  });
});

describe("safety across varied inputs", () => {
  // No external property library is available; a broad fixed corpus stands in
  // for the same guarantee: the parser never throws and always preserves `raw`.
  const inputs = [
    "",
    "   ",
    "{",
    "}",
    "[",
    "]",
    "{}",
    "[]",
    '{"a":}',
    "423: ",
    "423: {\"a\":1",
    `423: ${RESERVED_JSON}`,
    "1000: {\"x\":1}",
    "not-json",
    "413: payload too large",
    "429: {\"message\":\"slow down\"}",
    "{\"nested\":{\"deep\":[1,{\"k\":\"v\"}]}}",
    "null",
    "true",
    "123",
  ];
  it("never throws and preserves the raw string", () => {
    for (const input of inputs) {
      const output = parseStructuredOutput(input);
      expect(output.raw).toBe(input);
      const text = renderStructuredOutputText(output, { now: NOW, timeZone: ZURICH });
      // text is either null (unstructured) or a string; never a throw.
      if (text !== null) expect(typeof text).toBe("string");
    }
  });
});
