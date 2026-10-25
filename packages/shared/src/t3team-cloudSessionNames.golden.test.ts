import { describe, expect, it } from "vite-plus/test";

import { cloudSessionAuthor } from "./t3team-cloudSessionAuthor.fixtures.ts";
import { cloudSessionPoolKey } from "./t3team-cloudSessionPoolKey.fixtures.ts";
import { cloudSessionRunName } from "./t3team-cloudSessionRunName.fixtures.ts";
import { cloudSessionTag } from "./t3team-cloudSessionTag.fixtures.ts";
import { cloudSessionWorkspace } from "./t3team-cloudSessionWorkspace.fixtures.ts";
import {
  makeSessionTagFrom,
  sessionNameFromRunName,
  sessionTagFromInt,
} from "./t3team-cloudSessionName.ts";
import {
  machineGitAuthor,
  sessionWorkspaceName,
  standbyPoolKey,
} from "./t3team-cloudSessionWorkspace.ts";

/**
 * Golden vectors: each row was produced by the OLD implementation in apps/server/src/cloud before
 * the move to @t3tools/shared (see the header of each fixtures file), so a pass here means the
 * moved code is byte-identical on every row, not merely plausible.
 */
const rows = <T>(source: ReadonlyArray<string>): ReadonlyArray<T> =>
  source.map((row) => JSON.parse(row) as T);

const RANGE = Number.MAX_SAFE_INTEGER + 1;

describe("session tag (golden)", () => {
  const cases = rows<{ name: string | null; double: number; tag: string }>(cloudSessionTag);

  it("covers the table it claims to", () => {
    expect(cases.length).toBeGreaterThanOrEqual(150);
    expect(new Set(cases.map((row) => row.name)).size).toBeGreaterThanOrEqual(25);
  });

  it("matches the old Effect-based makeSessionTag for every name and random draw", () => {
    for (const row of cases) {
      expect(
        makeSessionTagFrom(row.name, () => row.double),
        JSON.stringify(row),
      ).toBe(row.tag);
      expect(sessionTagFromInt(row.name, Math.floor(row.double * RANGE)), row.tag).toBe(row.tag);
    }
  });

  it("encodes the draw in base 36 after a name-less `s`, at both ends of the range", () => {
    expect(sessionTagFromInt(null, 0)).toBe("s0");
    expect(sessionTagFromInt(null, 35)).toBe("sz");
    expect(sessionTagFromInt(null, 36)).toBe("s10");
    expect(sessionTagFromInt(null, Number.MAX_SAFE_INTEGER)).toBe(
      `s${Number.MAX_SAFE_INTEGER.toString(36)}`,
    );
    expect(makeSessionTagFrom(null, () => 1 - 2 ** -53)).toBe(sessionTagFromInt(null, 2 ** 53 - 1));
  });

  it("keeps a sanitised name as a prefix and never emits an empty or unsafe segment", () => {
    for (const row of cases) {
      expect(row.tag, row.tag).toMatch(/^(?:[A-Za-z0-9_-]+\.)?s[0-9a-z]+$/);
      expect(row.tag.length).toBeLessThanOrEqual(40 + 1 + 1 + 11);
    }
  });

  it("gives names that collide after sanitising the same segment but a different tag per draw", () => {
    const [space, dash] = ["a b", "a-b"].map((name) => sessionTagFromInt(name, 7));
    expect(space).toBe(dash);
    expect(sessionTagFromInt("a b", 7)).not.toBe(sessionTagFromInt("a b", 8));
    // All-symbol and all-unicode names sanitise to nothing and fall back to a plain tag.
    expect(sessionTagFromInt("プロジェクト", 7)).toBe("s7");
    expect(sessionTagFromInt("---", 7)).toBe("s7");
    expect(sessionTagFromInt("", 7)).toBe("s7");
    expect(sessionTagFromInt("   ", 7)).toBe("s7");
  });

  it("truncates a long name at 40 characters, then trims the dash the cut may leave", () => {
    expect(sessionTagFromInt("x".repeat(200), 1)).toBe(`${"x".repeat(40)}.s1`);
    expect(sessionTagFromInt(`${"x".repeat(39)}-y`, 1)).toBe(`${"x".repeat(39)}.s1`);
  });

  it("round-trips through the run name for every tag the old code produced", () => {
    for (const row of cases) {
      const named = /^(.+)\.s[0-9a-z]+$/.exec(row.tag)?.[1];
      expect(sessionNameFromRunName(`nexi-session [${row.tag}] · broker`), row.tag).toBe(named);
    }
  });
});

describe("run name parsing (golden)", () => {
  it("returns exactly what the old parser returned, including for malformed names", () => {
    for (const row of rows<{ runName: string; name: string | null }>(cloudSessionRunName)) {
      expect(sessionNameFromRunName(row.runName) ?? null, JSON.stringify(row.runName)).toBe(
        row.name,
      );
    }
  });

  it("takes the first tag-shaped bracket when a run name carries several", () => {
    expect(sessionNameFromRunName("[a.s1] [b.s2]")).toBe("a");
    expect(sessionNameFromRunName("hive/nx-nexi [main] [api.s1x2] · broker")).toBe("api");
    expect(sessionNameFromRunName("[a.s1")).toBeUndefined();
    expect(sessionNameFromRunName("")).toBeUndefined();
  });
});

describe("session workspace name (golden)", () => {
  const cases = rows<{
    login: string;
    repository: { owner: string; name: string } | null;
    workspace: string;
  }>(cloudSessionWorkspace);

  it("matches the old implementation for every login and repository", () => {
    for (const row of cases) {
      expect(sessionWorkspaceName(row.login, row.repository), JSON.stringify(row)).toBe(
        row.workspace,
      );
    }
  });

  it("always ends in the `_` terminator, which appears nowhere else, within 64 safe characters", () => {
    for (const row of cases) {
      expect(row.workspace, JSON.stringify(row)).toMatch(/^[A-Za-z0-9.-]+_$/);
      expect(row.workspace.length).toBeLessThanOrEqual(64);
      expect(row.workspace.indexOf("_")).toBe(row.workspace.length - 1);
    }
  });

  it("is injective over the table: no two identities share a workspace", () => {
    const seen = new Map<string, string>();
    for (const row of cases) {
      const identity = JSON.stringify([row.login, row.repository]);
      const other = seen.get(row.workspace);
      expect(
        other === undefined || other === identity,
        `${row.workspace}: ${other} vs ${identity}`,
      ).toBe(true);
      seen.set(row.workspace, identity);
    }
  });

  it("switches from readable to hashed exactly at the 64-character boundary", () => {
    // `u-<login>_` is readable while `u-<login>` is at most 63 characters, i.e. a 61-character login.
    expect(sessionWorkspaceName("a".repeat(61), null)).toBe(`u-${"a".repeat(61)}_`);
    expect(sessionWorkspaceName("a".repeat(62), null)).toMatch(/^u-a{52}-[0-9a-f]{8}_$/);
    expect(sessionWorkspaceName("a".repeat(62), null)).toHaveLength(64);
  });

  it("rewrites an unsafe character and hashes the raw identity, so `_` and `-` stay apart", () => {
    const underscore = sessionWorkspaceName("pj_x", null);
    const dash = sessionWorkspaceName("pj-x", null);
    expect(dash).toBe("u-pj-x_");
    expect(underscore).toMatch(/^u-pj-x-[0-9a-f]{8}_$/);
  });
});

describe("standby pool key (golden)", () => {
  it("matches the old implementation", () => {
    for (const row of rows<{ owner: string; name: string; key: string }>(cloudSessionPoolKey)) {
      expect(standbyPoolKey(row), JSON.stringify(row)).toBe(row.key);
      expect(row.key.length).toBeLessThanOrEqual(100);
    }
  });
});

describe("machine git author (golden)", () => {
  it("matches the old implementation, falling back to the noreply address", () => {
    for (const row of rows<{
      profile: Parameters<typeof machineGitAuthor>[0];
      host: string;
      author: { name: string; email: string };
    }>(cloudSessionAuthor)) {
      expect(machineGitAuthor(row.profile, row.host), JSON.stringify(row)).toEqual(row.author);
    }
  });
});
