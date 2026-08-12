import { describe, expect, it, vi } from "vite-plus/test";
import type { DockerExecResult } from "../src/executor.js";
import { killContainer } from "../src/executor.js";

/**
 * Unit coverage of the executor's real kill-escalation path (R2/R6). The
 * previous version of this file imported nothing from `src/` — all three
 * cases exercised Node's own `setTimeout`, not anything this package ships,
 * which is exactly why R2 (a container surviving its one best-effort
 * `docker kill` unbounded, and a self-contradictory `{exitCode:0,
 * timedOut:true}` result) went unnoticed. `killContainer` is the real
 * mechanism `runJob` now calls when a job overruns `timeoutMs` — see
 * executor.ts. It's exercised here via an injected `execDocker` stub, no
 * Docker daemon required; the live end-to-end case (`docker kill` for
 * real, `docker ps -a` showing no surviving container, `timedOut` ⇒
 * `exitCode: null`) is covered by test/integration.test.ts's
 * skipIf(no docker) timeout case.
 */
describe("killContainer", () => {
  function ok(stdout = ""): DockerExecResult {
    return { stdout, exitCode: 0 };
  }
  // L2: a failed `docker inspect`/`kill`/`rm` must say WHY it failed for
  // `containerIsGone` to treat it as a genuine absence signal — default to
  // docker's own real wording so every pre-existing call site here keeps
  // meaning "the container is actually gone", not "some unspecified error".
  function fail(stdout = "Error: No such container: job-abc"): DockerExecResult {
    return { stdout, exitCode: 1 };
  }

  it("returns true after a single successful kill (inspect confirms gone)", async () => {
    const calls: string[][] = [];
    let inspectCount = 0;
    const execDocker = vi.fn(async (args: string[]) => {
      calls.push(args);
      if (args[0] === "inspect") {
        inspectCount += 1;
        // Running when checked before the kill, gone by the time it's
        // checked again right after — the ordinary, no-escalation case.
        return inspectCount === 1 ? ok("true") : fail();
      }
      return ok();
    });

    const result = await killContainer("job-abc", { execDocker, retryDelayMs: 0 });

    expect(result).toBe(true);
    // First call must be the "is it already gone" check, before any kill.
    expect(calls[0][0]).toBe("inspect");
    expect(calls.some((c) => c[0] === "kill")).toBe(true);
    // Confirmed gone right after the kill -> never had to escalate to rm.
    expect(calls.some((c) => c[0] === "rm")).toBe(false);
  });

  it("escalates to `docker rm -f` when `docker kill` doesn't make the container exit", async () => {
    let stillRunning = true;
    const calls: string[][] = [];
    const execDocker = vi.fn(async (args: string[]) => {
      calls.push(args);
      if (args[0] === "inspect") {
        return stillRunning ? ok("true") : fail();
      }
      if (args[0] === "kill") {
        // `docker kill` "succeeds" (exitCode 0) but the container is still
        // being created (image pull) and doesn't actually stop — the
        // scenario the security review reproduced.
        return ok();
      }
      if (args[0] === "rm") {
        stillRunning = false;
        return ok();
      }
      throw new Error(`unexpected docker call: ${args.join(" ")}`);
    });

    const result = await killContainer("job-abc", { execDocker, retryDelayMs: 0 });

    expect(result).toBe(true);
    expect(calls.some((c) => c[0] === "rm" && c[1] === "-f")).toBe(true);
  });

  it("gives up after maxAttempts and reports 'exhausted', returning false", async () => {
    const execDocker = vi.fn(async (args: string[]) => {
      if (args[0] === "inspect") return ok("true"); // never confirms gone
      return ok();
    });
    const onFailure = vi.fn();

    const result = await killContainer("job-stuck", {
      execDocker,
      maxAttempts: 2,
      retryDelayMs: 0,
      onFailure,
    });

    expect(result).toBe(false);
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ action: "exhausted", attempt: 2 }),
    );
  });

  it("reports a failed `docker kill` call via onFailure instead of swallowing it", async () => {
    // First inspect (before any kill) says "still running" so a kill is
    // attempted at all; that kill call itself reports a nonzero exit code,
    // which must reach onFailure — the old code's `.catch(() => {})`
    // dropped exactly this signal on the floor.
    let inspectCount = 0;
    const execDocker = vi.fn(async (args: string[]) => {
      if (args[0] === "inspect") {
        inspectCount += 1;
        return inspectCount === 1 ? ok("true") : fail();
      }
      if (args[0] === "kill") return fail();
      return ok();
    });
    const onFailure = vi.fn();

    const result = await killContainer("job-abc", { execDocker, retryDelayMs: 0, onFailure });

    expect(result).toBe(true); // still confirmed gone afterward, via rm
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ action: "kill", attempt: 1 }));
  });
});

describe("stillLaunching: immediate-stop race (t3code session-cancel case)", () => {
  it("does NOT treat a not-yet-created container as gone while launching", async () => {
    const calls: string[][] = [];
    // inspect always fails — as it does during the create/image-pull window.
    const execDocker = async (args: string[]) => {
      calls.push(args);
      return args[0] === "inspect"
        ? { stdout: "Error: No such container: job-race", exitCode: 1 }
        : { stdout: "", exitCode: 0 };
    };
    let launching = true;
    const gone = await killContainer("job-race", {
      execDocker,
      retryDelayMs: 0,
      maxAttempts: 2,
      // Still launching for the whole attempt budget: a missing container
      // must NOT be read as success, or the kill is skipped and the
      // container starts a moment later unkilled.
      stillLaunching: () => launching,
    });
    expect(gone).toBe(false);
    expect(calls.some((c) => c[0] === "kill")).toBe(true);
    expect(calls.some((c) => c[0] === "rm")).toBe(true);

    // Once it is no longer launching, a failed inspect legitimately means gone.
    launching = false;
    calls.length = 0;
    const goneNow = await killContainer("job-race", {
      execDocker,
      retryDelayMs: 0,
      stillLaunching: () => launching,
    });
    expect(goneNow).toBe(true);
  });

  it("keeps the old semantics when no predicate is given (timeout path)", async () => {
    const execDocker = async (args: string[]) =>
      args[0] === "inspect"
        ? { stdout: "Error: No such container: job-timeout", exitCode: 1 }
        : { stdout: "", exitCode: 0 };
    await expect(killContainer("job-timeout", { execDocker, retryDelayMs: 0 })).resolves.toBe(true);
  });
});

/**
 * L2 regression: `containerIsGone` previously treated ANY nonzero
 * `docker inspect` exit code (once `stillLaunching()` was false/absent) as
 * "confirmed gone" — conflating "No such container" (genuinely gone) with
 * "daemon unreachable" or any other failure shape that says nothing about
 * the container's actual state. Proven with a stub that fails every single
 * call with a daemon-unreachable message: before the fix, `killContainer`
 * reported success (`true`) after just ONE failed inspect, even though the
 * container might still be running — a leaked, unmonitored sandbox. After
 * the fix, that same failure shape is UNDETERMINED, escalation keeps trying
 * within the attempt budget, and — since it never actually confirms
 * absence — the honest result is `false` ("still might be running"),
 * reported via `onFailure`.
 */
describe("containerIsGone: undetermined docker failures are never treated as confirmation (L2)", () => {
  const DAEMON_UNREACHABLE =
    "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?";

  it('does not report success after a single inspect failure that is not "no such container"', async () => {
    const execDocker = async (_args: string[]) => ({
      stdout: "",
      stderr: DAEMON_UNREACHABLE,
      exitCode: 1,
    });
    const onFailure = vi.fn();

    const result = await killContainer("job-daemon-down", {
      execDocker,
      maxAttempts: 2,
      retryDelayMs: 0,
      onFailure,
    });

    expect(result).toBe(false);
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ action: "exhausted", attempt: 2 }),
    );
  });

  it('distinguishes the two failure shapes: "no such container" confirms gone, a daemon error does not', async () => {
    const genuinelyGone = async (_args: string[]) => ({
      stdout: "Error: No such container: job-x",
      exitCode: 1,
    });
    const daemonDown = async (_args: string[]) => ({
      stdout: "",
      stderr: DAEMON_UNREACHABLE,
      exitCode: 1,
    });

    await expect(
      killContainer("job-x", { execDocker: genuinelyGone, retryDelayMs: 0 }),
    ).resolves.toBe(true);
    await expect(
      killContainer("job-x", { execDocker: daemonDown, retryDelayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe(false);
  });
});
