import { describe, expect, it } from "vite-plus/test";
import { parseWindowsCommitMemory } from "./t3team-windowsCommitMemory.ts";

describe("Windows commit memory", () => {
  it("uses commit limit minus committed bytes rather than pagefile usage", () => {
    expect(
      parseWindowsCommitMemory('{"CommittedBytes":136172285952,"CommitLimit":155629076480}'),
    ).toEqual({ commitHeadroomBytes: 19456790528, commitLimitBytes: 155629076480 });
  });
  it.each([
    "",
    "oops",
    "null",
    "{}",
    "[]",
    '{"CommittedBytes":-1,"CommitLimit":100}',
    '{"CommittedBytes":101,"CommitLimit":100}',
    '{"CommittedBytes":1,"CommitLimit":0}',
    '{"CommittedBytes":"1","CommitLimit":100}',
  ])("rejects unavailable or invalid readings: %s", (text) => {
    expect(parseWindowsCommitMemory(text)).toBeNull();
  });
});
