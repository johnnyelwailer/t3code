/**
 * Masks injected values in text before it can reach an agent: the value itself, each of its
 * lines, and the encodings a tool commonly prints it in (base64 at any byte offset, so a value
 * inside `user:value` Basic auth is caught too; base64url; URL encoding; JSON string escaping).
 */
import type { UserSecretRunResult } from "@t3tools/contracts";

import type { ProcessRunOutput } from "../processRunner.ts";

export const SECRET_MASK = "****";

const MIN_DERIVED_PATTERN_LENGTH = 4;

function base64Fragments(bytes: Buffer): ReadonlyArray<string> {
  const fragments: Array<string> = [];
  for (let offset = 0; offset < 3; offset += 1) {
    const encoded = Buffer.concat([Buffer.alloc(offset), bytes]).toString("base64");
    const start = Math.ceil((offset * 8) / 6);
    const end = Math.floor(((offset + bytes.length) * 8) / 6);
    const fragment = encoded.slice(start, end);
    fragments.push(fragment, fragment.replaceAll("+", "-").replaceAll("/", "_"));
  }
  const whole = bytes.toString("base64");
  fragments.push(whole, bytes.toString("base64url"));
  return fragments;
}

/** Every string that reveals `value`, longest first. */
export function maskPatternsFor(value: string): ReadonlyArray<string> {
  if (value.length === 0) return [];
  const derived = [
    ...value.split(/\r?\n/).map((line) => line.trim()),
    encodeURIComponent(value),
    JSON.stringify(value).slice(1, -1),
    ...base64Fragments(Buffer.from(value, "utf8")),
  ].filter((pattern) => pattern.length >= MIN_DERIVED_PATTERN_LENGTH);
  return [...new Set([value, ...derived])].toSorted((left, right) => right.length - left.length);
}

export function maskText(
  text: string,
  patterns: ReadonlyArray<string>,
): { readonly text: string; readonly count: number } {
  let masked = text;
  let count = 0;
  for (const pattern of patterns) {
    const parts = masked.split(pattern);
    count += parts.length - 1;
    masked = parts.join(SECRET_MASK);
  }
  return { text: masked, count };
}

/**
 * Output cut at a size limit can end inside a value, where no whole pattern matches. Dropping the
 * last `longest pattern` characters before masking removes any such partial occurrence.
 */
export function dropPossiblyPartialTail(text: string, patterns: ReadonlyArray<string>): string {
  const longest = patterns.reduce((max, pattern) => Math.max(max, pattern.length), 0);
  return text.slice(0, Math.max(0, text.length - longest));
}

/** A finished run as the agent may see it: every pattern masked, a cut tail dropped first. */
export function maskProcessOutput(
  output: ProcessRunOutput,
  patterns: ReadonlyArray<string>,
): UserSecretRunResult {
  const mask = (text: string, truncated: boolean) =>
    maskText(truncated ? dropPossiblyPartialTail(text, patterns) : text, patterns);
  const stdout = mask(output.stdout, output.stdoutTruncated);
  const stderr = mask(output.stderr, output.stderrTruncated);
  return {
    exitCode: output.code === null ? null : Number(output.code),
    timedOut: output.timedOut,
    stdout: stdout.text,
    stderr: stderr.text,
    truncated: output.stdoutTruncated || output.stderrTruncated,
    maskedCount: stdout.count + stderr.count,
  };
}
