import { describe, expect, it } from "@effect/vitest";

import {
  SECRET_MASK,
  dropPossiblyPartialTail,
  maskPatternsFor,
  maskProcessOutput,
  maskText,
} from "./t3team-secretMasking.ts";

const VALUE = "dummy-Token/with+chars=?&";

const mask = (text: string, value = VALUE) => maskText(text, maskPatternsFor(value));

describe("masking", () => {
  it("masks the raw value", () => {
    expect(mask(`token is ${VALUE}.`)).toEqual({ text: `token is ${SECRET_MASK}.`, count: 1 });
  });

  it("masks base64 and base64url forms", () => {
    const standard = Buffer.from(VALUE).toString("base64");
    const url = Buffer.from(VALUE).toString("base64url");
    expect(mask(`a ${standard} b ${url}`).text).not.toContain(standard);
    expect(mask(`a ${standard} b ${url}`).text).not.toContain(url);
  });

  it("masks the value inside Basic auth, whatever its byte offset", () => {
    for (const user of ["u", "us", "use", "user"]) {
      const basic = Buffer.from(`${user}:${VALUE}`).toString("base64");
      const masked = mask(`Authorization: Basic ${basic}`).text;
      expect(masked).toContain(SECRET_MASK);
      expect(
        Buffer.from(masked.replace("Authorization: Basic ", ""), "base64").toString(),
      ).not.toContain(VALUE.slice(3, -3));
    }
  });

  it("masks URL-encoded and JSON-escaped forms", () => {
    const json = 'dummy "quoted" \\ value';
    expect(mask(`?t=${encodeURIComponent(VALUE)}`).text).toBe(`?t=${SECRET_MASK}`);
    expect(mask(JSON.stringify({ t: json }), json).text).toBe(`{"t":"${SECRET_MASK}"}`);
  });

  it("masks each line of a multi-line value printed partially", () => {
    const pem =
      "-----BEGIN DUMMY KEY-----\nMIIBdummyline1\nMIIBdummyline2\n-----END DUMMY KEY-----";
    expect(mask("leak: MIIBdummyline2", pem).text).toBe(`leak: ${SECRET_MASK}`);
  });

  it("drops a value cut off at the end of truncated output", () => {
    const patterns = maskPatternsFor(VALUE);
    const cut = `ok ${VALUE.slice(0, 9)}`;
    expect(maskText(dropPossiblyPartialTail(cut, patterns), patterns).text).not.toContain(
      VALUE.slice(0, 9),
    );
  });

  it("masks both streams of a run and counts what it masked", () => {
    const result = maskProcessOutput(
      {
        stdout: `got ${VALUE}`,
        stderr: `warn ${encodeURIComponent(VALUE)}`,
        code: null,
        timedOut: false,
        stdoutTruncated: false,
        stderrTruncated: false,
        stdoutInvalidUtf8: false,
        stderrInvalidUtf8: false,
      },
      maskPatternsFor(VALUE),
    );
    expect(result).toMatchObject({
      stdout: `got ${SECRET_MASK}`,
      stderr: `warn ${SECRET_MASK}`,
      maskedCount: 2,
    });
  });
});
