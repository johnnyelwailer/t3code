import * as NodeChildProcess from "node:child_process";
import { describe, expect, it } from "vite-plus/test";
import type { JobEvent, JobResult } from "../src/contract.js";
import { runJob, startSandbox } from "../src/executor.js";

// `it.skipIf` evaluates its condition at suite-collection time (before any
// beforeAll runs), so the Docker-availability probe must be synchronous
// and happen at module load, not inside an async beforeAll.
let dockerAvailable = false;
try {
  NodeChildProcess.execSync("docker info", { stdio: "ignore" });
  dockerAvailable = true;
} catch {
  dockerAvailable = false;
}

function containerIsListed(containerName: string): boolean {
  const psOutput = NodeChildProcess.execSync(
    `docker ps -a --filter "name=${containerName}" --format "{{.Names}}"`,
  )
    .toString()
    .trim();
  return psOutput !== "";
}

describe("runJob (integration, requires Docker)", () => {
  it.skipIf(!dockerAvailable)(
    "runs alpine:3 with network none and reports a clean exit",
    async () => {
      const events: JobEvent[] = [];
      const result = await runJob(
        {
          jobId: `it-${Date.now()}-clean`,
          image: "alpine:3",
          cmd: ["sh", "-c", "echo hello; sleep 1"],
          env: {},
          timeoutMs: 15_000,
          network: "none",
        },
        { onEvent: (e) => events.push(e) },
      );

      expect(events.some((e) => e.type === "started")).toBe(true);
      const stdoutLines = events
        .filter((e) => e.type === "stdout")
        .map((e) => (e as { line: string }).line);
      expect(stdoutLines).toContain("hello");
      expect(events.some((e) => e.type === "exited")).toBe(true);

      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    },
    30_000,
  );

  it.skipIf(!dockerAvailable)(
    "kills the container and reports timedOut when it overruns timeoutMs",
    async () => {
      const jobId = `it-${Date.now()}-timeout`;
      const containerName = `job-${jobId}`;
      const events: JobEvent[] = [];
      const result = await runJob(
        {
          jobId,
          image: "alpine:3",
          cmd: ["sleep", "30"],
          env: {},
          timeoutMs: 2000,
          network: "none",
        },
        { onEvent: (e) => events.push(e) },
      );

      expect(result.timedOut).toBe(true);
      // R2's contract guarantee: exitCode must be null when timedOut, never
      // a code sampled from a process torn down mid-flight (the auditor's
      // reproduction got a self-contradictory {exitCode:0, timedOut:true}).
      expect(result.exitCode).toBeNull();
      const exitedEvent = events.find((e) => e.type === "exited") as
        | { timedOut: boolean }
        | undefined;
      expect(exitedEvent?.timedOut).toBe(true);
      // Should not take anywhere near the full 30s sleep.
      expect(result.durationMs).toBeLessThan(15_000);

      // R2's authoritative-kill guarantee: by the time runJob resolves, the
      // container must actually be gone — not just "we sent a kill signal
      // and hoped" (the old one-shot `.catch(() => {})` behavior).
      expect(containerIsListed(containerName)).toBe(false);
    },
    30_000,
  );
});

describe("startSandbox (integration, requires Docker)", () => {
  it.skipIf(!dockerAvailable)(
    "start -> write stdin -> read streamed stdout -> wait() result",
    async () => {
      const jobId = `it-${Date.now()}-stdin`;
      const handle = await startSandbox({
        jobId,
        image: "alpine:3",
        // `cat` echoes stdin back to stdout and exits once stdin closes —
        // the simplest real proof that `handle.stdin` reaches the
        // container, not just that a container was started.
        cmd: ["sh", "-c", "cat"],
        env: {},
        timeoutMs: 15_000,
        network: "none",
      });

      expect(handle.id).toBe(jobId);
      // Every real caller subscribes right after startSandbox resolves —
      // by then the container has already been spawned, so status is
      // "running", not the momentary "starting".
      expect(handle.status()).toBe("running");

      const stdoutLines: string[] = [];
      handle.onEvent((event) => {
        if (event.type === "stdout") stdoutLines.push(event.line);
      });

      handle.stdin.write("hello from the interactive test\n");
      handle.stdin.end();

      const result = await handle.wait();

      expect(result.jobId).toBe(jobId);
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(stdoutLines).toContain("hello from the interactive test");
      expect(handle.status()).toBe("exited");
    },
    30_000,
  );

  it.skipIf(!dockerAvailable)(
    "stop() mid-run kills authoritatively and wait() reports a torn-down result",
    async () => {
      const jobId = `it-${Date.now()}-stop`;
      const containerName = `job-${jobId}`;
      const handle = await startSandbox({
        jobId,
        image: "alpine:3",
        cmd: ["sleep", "30"],
        env: {},
        // Long enough that the timeout timer, not stop(), is never what
        // ends this run — this test is about the explicit stop() path,
        // not the timeout path (already covered by runJob's timeout test
        // above, which shares the same kill-escalation code).
        timeoutMs: 30_000,
        network: "none",
      });

      expect(handle.status()).toBe("running");

      // Give the container a moment to actually finish `docker create`
      // + `start` before tearing it down — killContainer's first
      // `docker inspect` treats "no such container" as "already gone"
      // (the normal case for a container that already exited under
      // `--rm`), so calling stop() in the same instant as start() would
      // race that check against the container still coming up.
      await new Promise((resolve) => setTimeout(resolve, 500));

      await handle.stop();

      const result = await handle.wait();

      // stop() is a deliberate teardown, not a timeout — timedOut stays
      // false — but the container was still torn down mid-flight, so the
      // same "never report a sampled exit code" guarantee as a timeout
      // applies (see contract.ts's JobResult.timedOut doc).
      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBeNull();
      expect(handle.status()).toBe("exited");
      expect(containerIsListed(containerName)).toBe(false);
    },
    30_000,
  );

  it.skipIf(!dockerAvailable)(
    "interactive: attaches to a long-running container, reads output incrementally, then stops it",
    async () => {
      // This is the scenario `runJob` cannot express: it only returns
      // after the job is already over, so there is nothing to "read
      // incrementally" from — an interactive consumer (t3code) needs to
      // observe output while the sandbox is still running, then decide on
      // its own schedule (session end) to tear it down.
      const jobId = `it-${Date.now()}-interactive`;
      const containerName = `job-${jobId}`;
      const handle = await startSandbox({
        jobId,
        image: "alpine:3",
        cmd: [
          "sh",
          "-c",
          "i=0; while [ $i -lt 100 ]; do echo tick-$i; i=$((i+1)); sleep 0.2; done",
        ],
        env: {},
        timeoutMs: 30_000,
        network: "none",
      });

      const ticks: string[] = [];
      handle.onEvent((event) => {
        if (event.type === "stdout") ticks.push(event.line);
      });

      // Give the container real wall-clock time to emit several ticks
      // before we intervene — proving output is observed incrementally,
      // not just collected after the fact once the process has exited.
      await new Promise((resolve) => setTimeout(resolve, 1200));

      expect(handle.status()).toBe("running");
      expect(ticks.length).toBeGreaterThan(0);
      expect(ticks).toContain("tick-0");
      // The container would need ~20s to finish its 100 ticks on its own —
      // it is still running at this point, which is the whole point of
      // this test (an interactive session outlives any single read).
      expect(ticks.length).toBeLessThan(50);

      await handle.stop();
      const result = await handle.wait();

      expect(result.exitCode).toBeNull();
      expect(handle.status()).toBe("exited");
      expect(containerIsListed(containerName)).toBe(false);
    },
    30_000,
  );

  it.skipIf(!dockerAvailable)(
    "runJob is a thin wrapper over startSandbox: same JobSpec shape produces an identical JobResult shape",
    async () => {
      const baseSpec = {
        image: "alpine:3",
        cmd: ["sh", "-c", "echo via-both; sleep 1"],
        env: {},
        timeoutMs: 15_000,
        network: "none" as const,
      };

      const viaRunJob: JobResult = await runJob(
        { ...baseSpec, jobId: `it-${Date.now()}-wrapper-runjob` },
        { onEvent: () => {} },
      );

      const handle = await startSandbox({
        ...baseSpec,
        jobId: `it-${Date.now()}-wrapper-sandbox`,
      });
      handle.onEvent(() => {});
      const viaStartSandbox: JobResult = await handle.wait();

      // Same shape (same keys), same outcome for an equivalent run — the
      // proof that runJob doesn't carry any behavior startSandbox lacks.
      expect(Object.keys(viaRunJob).sort()).toEqual(Object.keys(viaStartSandbox).sort());
      expect(viaRunJob.exitCode).toBe(viaStartSandbox.exitCode);
      expect(viaRunJob.timedOut).toBe(viaStartSandbox.timedOut);
      expect(typeof viaRunJob.durationMs).toBe("number");
      expect(typeof viaStartSandbox.durationMs).toBe("number");
    },
    30_000,
  );
});
