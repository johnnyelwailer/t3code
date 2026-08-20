/**
 * Docker executor for the sandbox runner v1 (see
 * docs/design/resident-agent.md, "Execution plane" + "Hot path" sections).
 *
 * This is the isolation seam: it turns a validated JobSpec into a `docker
 * run` invocation, streams its stdout/stderr as JobEvents, enforces the
 * timeout, and reports a JobResult. Everything here builds an argv array —
 * never a shell string — so a JobSpec (which may carry caller-controlled
 * values like image names or env values) can never be interpreted by a
 * shell.
 */
import { execa, type ResultPromise } from "execa";
import type { JobEvent, JobNetwork, JobResult, JobRuntime, JobSpec } from "./contract.js";
import { parseJobSpec } from "./contract.js";

/** Docker network created for `network: 'gateway-only'` jobs. Marked
 * `internal` (no default route out) so it is a real containment primitive
 * today, not a name that merely looks restrictive. */
export const GATEWAY_EGRESS_NETWORK = "agent-runner-egress";

/** Sane v1 defaults (see design doc's "Hot path" — this is deliberately not
 * tuned per-project yet; that is a growth-path concern). All four are
 * overridable per-job via JobSpec.limits (contract.ts). */
export const DEFAULT_MEMORY_LIMIT = "2g";
export const DEFAULT_PIDS_LIMIT = "512";
export const DEFAULT_CPUS = "2";
/** `--memory-swap` equal to `--memory` disables swap growth beyond the hard
 * memory cap (Docker's "no extra swap" convention: memory == memory-swap). */
export const DEFAULT_MEMORY_SWAP = DEFAULT_MEMORY_LIMIT;

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

export class RuntimeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeUnavailableError";
  }
}

/**
 * Pure function: JobSpec -> `docker run` argv (everything after `docker`).
 * Kept separate from the actual `execa` call so it is unit-testable without
 * a Docker daemon (see test/executor.test.ts). "Pure" here means no I/O —
 * it still re-validates its input via `parseJobSpec` (R1) before building
 * anything, so this can never be the path that turns an unvalidated spec
 * into a real `docker run` invocation.
 *
 * `gatewayNetworkReady` must be true for `network: 'gateway-only'` to be
 * accepted — callers (runJob) are responsible for creating/reusing the
 * `agent-runner-egress` network first and threading that through, so this
 * function stays synchronous and pure otherwise.
 */
export function buildDockerRunArgs(
  rawSpec: JobSpec,
  opts: { gatewayNetworkReady?: boolean } = {},
): string[] {
  // Re-validate here too (R1 defense in depth): this is the function that
  // actually turns a JobSpec into a `docker run` invocation, so it must
  // never trust an already-typed-but-unvalidated object — TypeScript's
  // `JobSpec` type says nothing at runtime about whether a caller-built
  // object literal actually went through parseJobSpec's rules (no secrets
  // in env, image-ref shape, workspace-root containment). `runJob` also
  // validates before calling this, but that must not be the only guard.
  const spec = parseJobSpec(rawSpec);

  // `--interactive` keeps the container's stdin open for the duration of
  // the run, whether or not any caller ever writes to it — unconditional
  // because `SandboxHandle.stdin` (executor.ts's `startSandbox`) must work
  // for every job, not just ones a caller happens to know in advance are
  // "interactive". A job whose image never reads stdin is unaffected: an
  // open-but-unread stdin pipe doesn't block anything on the container
  // side.
  const args = ["run", "--rm", "--interactive", "--name", `job-${spec.jobId}`];

  const memory = spec.limits?.memory ?? DEFAULT_MEMORY_LIMIT;
  // Default memory-swap to whatever memory limit is in effect (overridden
  // or not) — "no extra swap" per DEFAULT_MEMORY_SWAP's doc comment — not to
  // the global default, so overriding only `limits.memory` doesn't leave a
  // stale, smaller swap cap.
  const memorySwap = spec.limits?.memorySwap ?? memory;
  const cpus = spec.limits?.cpus ?? DEFAULT_CPUS;
  const pids = spec.limits?.pids ?? DEFAULT_PIDS_LIMIT;

  args.push("--memory", memory);
  args.push("--memory-swap", memorySwap);
  args.push("--cpus", cpus);
  args.push("--pids-limit", pids);

  // Capability/rootfs hardening (R4). Defaults for every job — v1 has no
  // per-job opt-out surface for these beyond `user` (see below), since
  // nothing in the design doc calls for a job that needs more than this.
  args.push("--cap-drop=ALL");
  args.push("--security-opt=no-new-privileges");
  // Read-only root filesystem. The workspace bind mount (below) is a
  // separate mount, not part of the container's writable layer, so its own
  // rw/ro mode (from `spec.workspace.readOnly`) still applies independently
  // — a job with a writable workspace can still write there with
  // `--read-only` in effect. `/tmp` is given a small writable tmpfs since
  // some tooling (including Node itself, in edge cases) expects a writable
  // temp dir even when it never touches the workspace.
  args.push("--read-only");
  args.push("--tmpfs", "/tmp:rw,noexec,nosuid,size=64m");

  if (spec.user) {
    args.push("--user", spec.user);
  }

  args.push(...networkArgs(spec.network, opts.gatewayNetworkReady ?? false));

  if (spec.workspace) {
    const mode = spec.workspace.readOnly === false ? "rw" : "ro";
    args.push("-v", `${spec.workspace.hostPath}:/workspace:${mode}`);
    args.push("-w", "/workspace");
  }

  // Secret mounts (contract.ts's `SecretMount`) — each is validated by
  // parseJobSpec above to resolve outside /workspace, so these never
  // collide with or get shadowed by the workspace mount.
  for (const mount of spec.secretMounts ?? []) {
    const mode = mount.readOnly === false ? "rw" : "ro";
    args.push("-v", `${mount.hostPath}:${mount.containerPath}:${mode}`);
  }

  for (const [key, value] of Object.entries(spec.env)) {
    // Passed as separate argv elements (`-e`, `KEY=value`) — never
    // interpolated into a shell string.
    args.push("-e", `${key}=${value}`);
  }

  if (spec.runtime === "runsc") {
    args.push("--runtime=runsc");
  }

  // `--` tells the docker CLI "everything after this is a positional
  // argument, not a flag" — without it, an image string beginning with `-`
  // (e.g. a caller-controlled `--network=host`) would be parsed as another
  // docker run flag instead of the image reference, defeating isolation.
  // parseJobSpec() also rejects `-`-leading/non-image-shaped strings at the
  // contract boundary (contract.ts's IMAGE_REF_PATTERN) — this is defense
  // in depth, not a substitute for that check.
  args.push("--", spec.image);

  if (spec.cmd && spec.cmd.length > 0) {
    args.push(...spec.cmd);
  }

  return args;
}

function networkArgs(network: JobNetwork, gatewayNetworkReady: boolean): string[] {
  switch (network) {
    case "none":
      return ["--network", "none"];
    case "open":
      // v1 default bridge network — full outbound egress. Fine for the
      // dev/proof stage; per-project egress policy (design doc's "Egress
      // policy = provider policy") lands later.
      return [];
    case "gateway-only":
      if (!gatewayNetworkReady) {
        throw new NotImplementedError(
          "network: 'gateway-only' requires the on-prem gateway-proxy " +
            "container that ships with the on-prem deployment (see " +
            "docs/design/resident-agent.md, 'Egress policy = provider " +
            "policy'). v1 can create the internal-only 'agent-runner-egress' " +
            "Docker network (attach reachability to the model gateway is " +
            "not implementable on a dev Mac without that proxy container) " +
            "— pass a ready gateway network or use network: 'none' | 'open'.",
        );
      }
      return ["--network", GATEWAY_EGRESS_NETWORK];
    default:
      // Exhaustiveness guard — parseJobSpec should never let this happen.
      throw new NotImplementedError(`unknown network mode: ${network as string}`);
  }
}

let runscAvailableCache: boolean | undefined;

/**
 * Probes whether the Docker daemon has the `runsc` (gVisor) runtime
 * registered, via `docker info --format {{json .Runtimes}}`. Cached after
 * the first call — the daemon's registered runtimes don't change within a
 * process lifetime, and this avoids a `docker info` round trip per job.
 * gVisor/runsc is Linux-only; on macOS (Docker Desktop's Linux VM) this is
 * still meaningful to probe but is expected to report unavailable unless
 * explicitly configured — see README's Linux/gVisor note.
 */
export async function probeRunscAvailable(force = false): Promise<boolean> {
  if (!force && runscAvailableCache !== undefined) {
    return runscAvailableCache;
  }
  try {
    const { stdout } = await execa("docker", ["info", "--format", "{{json .Runtimes}}"]);
    const runtimes = JSON.parse(stdout) as Record<string, unknown>;
    runscAvailableCache = Object.prototype.hasOwnProperty.call(runtimes, "runsc");
  } catch {
    runscAvailableCache = false;
  }
  return runscAvailableCache;
}

/** Test-only escape hatch to reset the runsc probe cache between cases. */
export function _resetRunscProbeCacheForTests(): void {
  runscAvailableCache = undefined;
}

/**
 * Ensures the `agent-runner-egress` internal Docker network exists (create-if-
 * absent, idempotent). Returns true once the network is ready to attach
 * to. This is the real (not faked) part of `gateway-only` v1: an
 * internal-only network is a genuine containment primitive, it is simply
 * not yet wired to a gateway-proxy container — see buildDockerRunArgs's
 * NotImplementedError message for what's deferred.
 */
export async function ensureGatewayNetwork(): Promise<void> {
  try {
    await execa("docker", ["network", "inspect", GATEWAY_EGRESS_NETWORK]);
    return;
  } catch {
    // fall through to create
  }
  await execa("docker", ["network", "create", "--internal", GATEWAY_EGRESS_NETWORK]);
}

/** Result shape shared by every docker-CLI call the executor makes outside
 * of the main `docker run` (kill/rm/inspect/pull). `stderr` is optional (a
 * handful of existing test stubs only ever set `stdout`) but real callers
 * always populate it (L2: distinguishing "container not found" from "daemon
 * unreachable" needs whichever stream docker actually wrote its error
 * message to — some docker CLI builds put it on stdout, most on stderr). */
export interface DockerExecResult {
  stdout: string;
  stderr?: string;
  exitCode: number | null;
}

/** Injectable seam for anything in this module that shells out to `docker`
 * for a one-shot command (not the long-running `docker run` itself). Real
 * callers use `defaultDockerExec`; tests inject a stub so `killContainer`'s
 * escalation logic (R2, R6, L2) is unit-testable without a Docker daemon. */
export type DockerExec = (args: string[]) => Promise<DockerExecResult>;

async function defaultDockerExec(args: string[]): Promise<DockerExecResult> {
  const result = await execa("docker", args, { reject: false });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.exitCode ?? null,
  };
}

/** Matches docker's own wording for "this container does not exist" —
 * `docker inspect`'s actual failure message for both a container that was
 * already removed AND one that has never been created yet (see the
 * `stillLaunching` disambiguation below; the message alone cannot tell
 * those two cases apart). */
const CONTAINER_ABSENT_RE = /no such container|no such object/i;

/** L2 fix: `docker inspect` can fail for reasons that have nothing to do
 * with the container's existence — daemon unreachable, socket permission
 * denied, daemon mid-restart. Those failures must be reported as
 * UNDETERMINED, never as "confirmed gone": a stub (or a real daemon hiccup)
 * that fails every single call must not make `killContainer` report success
 * after one failed inspect, leaking a container that is still running
 * unmonitored. Only docker's own "no such container"/"no such object"
 * wording counts as a genuine absence signal. */
function indicatesContainerAbsent(result: DockerExecResult): boolean {
  return CONTAINER_ABSENT_RE.test(result.stdout) || CONTAINER_ABSENT_RE.test(result.stderr ?? "");
}

async function containerIsGone(
  execDocker: DockerExec,
  containerName: string,
  stillLaunching?: () => boolean,
): Promise<boolean> {
  const res = await execDocker(["inspect", "--format", "{{.State.Running}}", containerName]);
  if (res.exitCode !== 0) {
    if (!indicatesContainerAbsent(res)) {
      // L2: the failure does NOT say the container is absent — daemon
      // unreachable, permission denied, or any other shape. UNDETERMINED,
      // not gone: escalation must keep trying (kill/rm) within its attempt
      // budget rather than declaring victory on a call that told us
      // nothing about whether the container is still running.
      return false;
    }
    // `docker inspect` says "no such container" — but that exact message is
    // ALSO what it prints for a container that has not been CREATED yet
    // (we are inside the `docker run` startup/image-pull window), so the
    // message text alone cannot distinguish "already removed" (gone) from
    // "not yet created" (very much not gone). Treating the latter as "gone"
    // made an immediate stop() a no-op: the kill was skipped, the container
    // then started, and nothing ever killed it — a leaked sandbox. That is
    // the common case for an interactive consumer whose user cancels a
    // session right after starting it, so the caller passes `stillLaunching`
    // to tell the two apart.
    return stillLaunching ? !stillLaunching() : true;
  }
  return res.stdout.trim() !== "true";
}

export interface KillContainerOptions {
  execDocker?: DockerExec;
  /** Bounded escalation attempts (kill, verify, rm -f, verify) — default 3.
   * Never unbounded: a container that genuinely won't die must eventually
   * be reported as a failure to the caller, not retried forever. */
  maxAttempts?: number;
  /** Called for every failed docker call and once more if every attempt is
   * exhausted without confirming the container is gone. Defaults to a
   * no-op; `runJob` passes one that logs instead of swallowing silently
   * (the old behavior this replaces — R2). */
  onFailure?: (info: {
    attempt: number;
    action: "kill" | "rm" | "exhausted";
    result?: DockerExecResult;
  }) => void;
  /** Delay between escalation rounds, ms. Tests set this to 0. */
  retryDelayMs?: number;
  /** Distinguishes "container not created yet" from "container already
   * removed" when `docker inspect` fails. Return true while the underlying
   * `docker run` is still starting up (and the container has never been
   * observed): a missing container then means "not yet", so escalation keeps
   * trying instead of declaring victory. Omit it and a missing container is
   * treated as gone, which is correct for the timeout path (by then the
   * container has certainly been created). */
  stillLaunching?: () => boolean;
}

/**
 * Authoritative container teardown (R2): `docker kill`, verify via
 * `docker inspect`, and — if the container is still running — escalate to
 * `docker rm -f` (which force-removes a running container too, so it is a
 * genuine next step, not a retry of the same signal) before verifying
 * again. Repeats up to `maxAttempts` times. Returns `true` once the
 * container is confirmed gone, `false` if every attempt was exhausted
 * without confirming that (callers should treat `false` as "still might be
 * running" and log/alert, not assume success).
 *
 * This replaces the old one-shot `docker kill(...).catch(() => {})`, which
 * left a container that survived the kill (e.g. still mid-`docker create`
 * during an image pull) running unbounded with no retry or verification.
 */
export async function killContainer(
  containerName: string,
  options: KillContainerOptions = {},
): Promise<boolean> {
  const execDocker = options.execDocker ?? defaultDockerExec;
  const maxAttempts = options.maxAttempts ?? 3;
  const onFailure = options.onFailure ?? (() => {});
  const retryDelayMs = options.retryDelayMs ?? 200;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (await containerIsGone(execDocker, containerName, options.stillLaunching)) return true;

    const killResult = await execDocker(["kill", containerName]);
    if (killResult.exitCode !== 0) {
      onFailure({ attempt, action: "kill", result: killResult });
    }
    if (await containerIsGone(execDocker, containerName, options.stillLaunching)) return true;

    const rmResult = await execDocker(["rm", "-f", containerName]);
    if (rmResult.exitCode !== 0) {
      onFailure({ attempt, action: "rm", result: rmResult });
    }
    if (await containerIsGone(execDocker, containerName, options.stillLaunching)) return true;

    if (attempt < maxAttempts && retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  onFailure({ attempt: maxAttempts, action: "exhausted" });
  return false;
}

/**
 * Ensures `image` is present locally (`docker image inspect`), pulling it
 * first if not. Called by `runJob` BEFORE the timeout timer starts (R2,
 * fix (c)): a cold image pull can take far longer than a job's
 * `timeoutMs`, and that time has nothing to do with the job's own
 * execution — counting it against the deadline is what let an auditor
 * reproduce a 300ms timeout job actually running for 28s. Failures here are
 * swallowed on purpose: `docker run` will still attempt to pull the image
 * inline as a fallback (whose duration DOES count against `timeoutMs`, the
 * documented tradeoff of this approach), so a failed pre-pull must not fail
 * the job outright — it only loses the "doesn't count against the budget"
 * benefit for that one run.
 */
export async function ensureImagePulled(
  image: string,
  execDocker: DockerExec = defaultDockerExec,
): Promise<void> {
  const inspect = await execDocker(["image", "inspect", image]);
  if (inspect.exitCode === 0) return;
  await execDocker(["pull", image]);
}

/** Shared byte-budget state for one job's stdout+stderr combined (R5). */
export interface OutputBudget {
  totalBytes: number;
  capped: boolean;
}

/** Per-line cap — a single line longer than this is truncated with
 * `truncated: true` on its JobEvent rather than buffered whole. */
export const DEFAULT_MAX_LINE_BYTES = 64 * 1024;

/** Total forwarded stdout+stderr bytes per job, combined across both
 * streams. Once hit, forwarding stops entirely and a single
 * `output_capped` event is emitted — the container keeps running, this
 * only bounds how much output the control-plane process buffers/forwards. */
export const DEFAULT_MAX_TOTAL_OUTPUT_BYTES = 10 * 1024 * 1024;

/** Lifecycle states a `SandboxHandle` moves through. `starting` is
 * observable only for the instant between `execa()` returning and the
 * `started` JobEvent being emitted (startSandbox emits synchronously right
 * after spawning, so callers should rarely see it); `stopping` covers the
 * window between a timeout/`stop()` firing and the container being
 * confirmed gone. */
export type SandboxStatus = "starting" | "running" | "stopping" | "exited";

/** The long-lived primitive underneath `runJob()`. Two shapes of consumer
 * share this: a batch collector that subscribes once via `onEvent`,
 * forwards everything into its own event stream, and awaits `wait()` (see
 * `runJob` below); and an interactive consumer that writes to `stdin` as
 * the sandbox runs, reads `onEvent`'s `stdout`/`stderr` events
 * incrementally, and calls `stop()` on session end instead of always
 * letting the process run to its own exit. Event *subscription* (rather
 * than an async-iterable stream) was picked because it is the shape both
 * sides already need: a batch collector just pushes every event into an
 * array/journal, and an interactive streamer can subscribe, print/forward
 * as events arrive, and unsubscribe on detach — a plain callback does both
 * without forcing either side to drain an iterator on a schedule it
 * doesn't control. */
export interface SandboxHandle {
  /** Echoes JobSpec.jobId. */
  readonly id: string;
  /** The `docker run --name` this sandbox was started with. */
  readonly containerName: string;
  /** Writable end of the container's stdin — present so an interactive
   * consumer can feed input into a long-lived sandbox. A batch job that
   * never writes to it is unaffected; nothing here requires stdin to be
   * used. */
  readonly stdin: NodeJS.WritableStream;
  /** Subscribes `listener` to every JobEvent from `started` onward
   * (including ones already emitted before this call — callers that need
   * exactly-once delivery should subscribe immediately after
   * `startSandbox` resolves, which every caller in this codebase does).
   * Returns an unsubscribe function. */
  onEvent(listener: (event: JobEvent) => void): () => void;
  /** Current lifecycle state — see `SandboxStatus`. */
  status(): SandboxStatus;
  /** Resolves with the JobResult once the sandbox exits, whether that is a
   * natural exit, a `timeoutMs` kill, or an explicit `stop()`. Safe to call
   * more than once (memoized) and safe to call before or after the
   * sandbox has actually finished. */
  wait(): Promise<JobResult>;
  /** Explicitly tears the sandbox down before it would otherwise exit —
   * the interactive consumer's "session end" signal. Uses the same
   * authoritative kill escalation as a `timeoutMs` timeout (R2): `docker
   * kill` -> verify -> `docker rm -f` -> verify, bounded retries. Resolves
   * once the container is confirmed gone, or once `opts.timeoutMs`
   * elapses (whichever is first) — the escalation itself is never
   * abandoned, only how long this call waits for it. */
  stop(opts?: { timeoutMs?: number }): Promise<void>;
}

export interface StartSandboxOptions {
  /** For gateway-only jobs: pre-created/reused by the caller via
   * ensureGatewayNetwork(). Defaults to false (not attempted), which makes
   * gateway-only throw NotImplementedError per buildDockerRunArgs. */
  gatewayNetworkReady?: boolean;
}

/**
 * Starts one JobSpec under Docker and returns a handle to the running
 * sandbox immediately — this is the primitive every hardening rule in this
 * module (validation, network modes, resource limits, cap-drop/
 * no-new-privileges/read-only/user, authoritative kill escalation, output
 * caps) actually lives on. `runJob()` below is a thin wrapper over this
 * function for the batch case; nothing about starting, streaming, or
 * tearing down a sandbox is duplicated between the two.
 */
export async function startSandbox(
  rawSpec: JobSpec,
  options: StartSandboxOptions = {},
): Promise<SandboxHandle> {
  // Validate at the trust boundary (R1): this is the ONE path every real
  // caller (runJob, the CLI in run-job.ts via runJob, and any interactive
  // consumer calling startSandbox directly) goes through before anything
  // reaches Docker. Re-running an already-typed JobSpec through
  // parseJobSpec is cheap and idempotent (it returns an equivalent object,
  // just with defaults applied) — the point is that this is where "no
  // secrets in env" / "image ref shape" / "workspace-root containment" go
  // from being enforced only when someone remembers to call parseJobSpec,
  // to being unbypassable on the hot path.
  const spec = parseJobSpec(rawSpec);

  if (spec.runtime === "runsc") {
    const available = await probeRunscAvailable();
    if (!available) {
      throw new RuntimeUnavailableError(
        "runtime: 'runsc' was requested but the Docker daemon does not " +
          "have gVisor registered (checked via `docker info`). gVisor/" +
          "runsc is Linux-only — see README's Linux/gVisor note. Use " +
          "runtime: 'runc' (the default) or install/enable runsc.",
      );
    }
  }

  let gatewayNetworkReady = options.gatewayNetworkReady ?? false;
  if (spec.network === "gateway-only" && !gatewayNetworkReady) {
    // Give callers a chance to opt in without pre-creating the network
    // themselves: ensure it, then proceed. buildDockerRunArgs still throws
    // NotImplementedError for anyone who didn't set this up, matching the
    // "do NOT fake it" instruction — this path only succeeds because the
    // network genuinely exists afterward.
    await ensureGatewayNetwork();
    gatewayNetworkReady = true;
  }

  // Pull BEFORE building/starting the timed run (R2 fix (c)) — see
  // ensureImagePulled's doc comment for the tradeoff this picks.
  await ensureImagePulled(spec.image);

  const args = buildDockerRunArgs(spec, { gatewayNetworkReady });
  const containerName = `job-${spec.jobId}`;
  const start = Date.now();

  // `stdin: "pipe"` (rather than execa's inherit-by-default) is what makes
  // the interactive shape possible at all — a batch caller that never
  // writes to `handle.stdin` is unaffected; an unwritten pipe just means
  // the container sees stdin close (EOF) whenever `child` itself ends.
  const child: ResultPromise = execa("docker", args, {
    reject: false,
    all: false,
    stdin: "pipe",
  });

  const listeners = new Set<(event: JobEvent) => void>();
  // Buffered so a listener that subscribes after `startSandbox` has
  // already resolved (every real caller — the `started` event below is
  // emitted before this function returns its handle) still sees every
  // event from `started` onward, matching onEvent's doc comment.
  const eventLog: JobEvent[] = [];
  const emit = (event: JobEvent) => {
    // Any output is proof the container exists and is executing — see
    // `observedRunning`'s doc comment.
    if (event.type === "stdout" || event.type === "stderr") observedRunning = true;
    eventLog.push(event);
    for (const listener of listeners) listener(event);
  };

  let status: SandboxStatus = "starting";
  /** Evidence that the container genuinely exists and is executing: the
   * first byte of output. `status` is NOT that evidence — it flips to
   * "running" optimistically as soon as `docker run` is spawned, which is
   * before the container is created (image pull, container create). Only
   * used to disambiguate a failed `docker inspect` during teardown; see the
   * `stillLaunching` predicate below. A silent container never sets this, so
   * teardown simply keeps escalating within its bounded attempts — the safe
   * direction. */
  let observedRunning = false;

  emit({
    type: "started",
    jobId: spec.jobId,
    ts: Date.now(),
    containerName,
  });
  status = "running";

  // One shared byte budget across stdout+stderr (R5) — a job that splits
  // its output across both streams doesn't get double the cap.
  const outputBudget: OutputBudget = { totalBytes: 0, capped: false };
  let cappedEventEmitted = false;
  const emitOutputCapped = () => {
    if (cappedEventEmitted) return;
    cappedEventEmitted = true;
    emit({ type: "output_capped", jobId: spec.jobId, ts: Date.now() });
  };

  attachLineStream(
    child.stdout,
    (line, truncated) =>
      emit({
        type: "stdout",
        jobId: spec.jobId,
        ts: Date.now(),
        line,
        ...(truncated ? { truncated: true } : {}),
      }),
    outputBudget,
    emitOutputCapped,
  );
  attachLineStream(
    child.stderr,
    (line, truncated) =>
      emit({
        type: "stderr",
        jobId: spec.jobId,
        ts: Date.now(),
        line,
        ...(truncated ? { truncated: true } : {}),
      }),
    outputBudget,
    emitOutputCapped,
  );

  const heartbeat = setInterval(() => {
    emit({ type: "heartbeat", jobId: spec.jobId, ts: Date.now() });
  }, 5000);

  let timedOut = false;
  let stoppedManually = false;
  // Tracks the in-flight kill escalation so both the timeout path and an
  // explicit stop() share one teardown, and `wait()` can await it — neither
  // must resolve a JobResult until the container is actually confirmed
  // gone (R2: "kill must be authoritative").
  let killPromise: Promise<boolean> | null = null;
  const beginTeardown = (reason: "timeout" | "stop"): Promise<boolean> => {
    if (killPromise) return killPromise;
    if (reason === "timeout") {
      timedOut = true;
    } else {
      stoppedManually = true;
    }
    status = "stopping";
    // `docker run --rm` needs the container killed, not just the local
    // `docker` client process, or the sandbox keeps running detached. This
    // used to be a single best-effort `docker kill(...).catch(() => {})`;
    // killContainer retries and escalates to `docker rm -f`, verifying via
    // `docker inspect` at each step instead of assuming the first signal
    // landed (a container still being created during an image pull can
    // outlive a lone `docker kill`).
    killPromise = killContainer(containerName, {
      // An immediate stop() (interactive consumer whose user cancels right
      // after starting) can race the container's creation: `docker inspect`
      // then fails because it does not exist YET, which without this
      // predicate reads as "already gone" and skips the kill entirely,
      // leaking a sandbox that starts a moment later. While the `docker run`
      // child is alive and we have never seen the container running, a
      // missing container means "not yet" — keep escalating.
      stillLaunching: () => child.exitCode === null && !observedRunning,
      onFailure: ({ attempt, action, result }) => {
        const detail =
          action === "exhausted"
            ? "exhausted all escalation attempts — container may still be running"
            : `attempt ${attempt} (${action}) failed, exitCode=${result?.exitCode ?? "n/a"}`;
        // eslint-disable-next-line no-console -- this process holds the
        // control-plane's GitHub App private key; a failed teardown is
        // exactly the kind of thing that must never be silently swallowed.
        console.error(`startSandbox(${spec.jobId}): kill escalation (${reason}) — ${detail}`);
      },
    });
    return killPromise;
  };

  const timer = setTimeout(() => {
    beginTeardown("timeout");
  }, spec.timeoutMs);

  const resultPromise: Promise<JobResult> = (async () => {
    let exitCode: number | null = null;
    try {
      const result = await child;
      exitCode = result.exitCode ?? null;
    } finally {
      clearTimeout(timer);
      clearInterval(heartbeat);
      // If teardown started (timeout or stop()), wait for the escalation
      // to finish (successfully or not) before this resolves — the whole
      // point of making the kill authoritative is that "torn down" and
      // "resolved" can't race each other.
      if (killPromise) {
        await killPromise;
      }
    }

    if (timedOut || stoppedManually) {
      // Contract guarantee (contract.ts's JobResult.timedOut doc): never
      // report a code sampled from a process we tore down mid-flight —
      // true whether the teardown was an automatic timeout or an explicit
      // stop().
      exitCode = null;
    }

    let oomKilled: boolean | undefined;
    try {
      const { stdout } = await execa("docker", [
        "inspect",
        "--format",
        "{{.State.OOMKilled}}",
        containerName,
      ]);
      oomKilled = stdout.trim() === "true";
    } catch {
      // Container already removed by --rm by the time we look (normal,
      // fast-exiting jobs) — oomKilled stays undefined, matching
      // JobResult's "undefined when not determinable" contract.
    }

    const durationMs = Date.now() - start;
    status = "exited";

    emit({
      type: "exited",
      jobId: spec.jobId,
      ts: Date.now(),
      exitCode,
      timedOut,
    });

    return { jobId: spec.jobId, exitCode, durationMs, timedOut, oomKilled };
  })();

  return {
    id: spec.jobId,
    containerName,
    stdin: child.stdin as NodeJS.WritableStream,
    onEvent(listener) {
      for (const past of eventLog) listener(past);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    status() {
      return status;
    },
    wait() {
      return resultPromise;
    },
    async stop(opts) {
      const kp = beginTeardown("stop");
      if (opts?.timeoutMs !== undefined) {
        await Promise.race([kp, new Promise((resolve) => setTimeout(resolve, opts.timeoutMs))]);
        return;
      }
      await kp;
    },
  };
}

export interface RunJobOptions {
  /** Called once per JobEvent, in order, as the job progresses. */
  onEvent: (event: JobEvent) => void;
  /** For gateway-only jobs: pre-created/reused by the caller via
   * ensureGatewayNetwork(). Defaults to false (not attempted), which makes
   * gateway-only throw NotImplementedError per buildDockerRunArgs. */
  gatewayNetworkReady?: boolean;
  /** External cancellation for the batch shape (`runJob` itself has no
   * `SandboxHandle` a caller could `stop()` directly — this is that seam).
   * When `signal` aborts, `runJob` calls the SAME authoritative
   * `handle.stop()` escalation a `timeoutMs` timeout or an interactive
   * `startSandbox()` consumer would (`docker kill` -> verify -> `docker rm
   * -f` -> verify) rather than leaving the container to run to its own
   * exit/timeout. Added for a Temporal Activity wrapper (a resident-agent
   * `deepCodeProbe` job) to wire `Context.current().cancellationSignal`
   * through to the container it started — see that caller's own doc
   * comment. Optional and unused by every pre-existing caller, so nothing
   * about a plain `runJob(spec, { onEvent })` call changes. */
  signal?: AbortSignal;
}

/**
 * Runs one JobSpec to completion under Docker and resolves its JobResult —
 * the batch shape over `startSandbox()`: start the sandbox, forward every
 * JobEvent into `onEvent` as it arrives, await `wait()`, and unsubscribe.
 * No hardening/streaming/teardown logic lives here anymore; it all lives on
 * `startSandbox` (see there for the R1/R2/R4/R5 rules this run still gets).
 */
export async function runJob(rawSpec: JobSpec, options: RunJobOptions): Promise<JobResult> {
  const handle = await startSandbox(rawSpec, { gatewayNetworkReady: options.gatewayNetworkReady });
  const unsubscribe = handle.onEvent(options.onEvent);
  const { signal } = options;
  // Already aborted before the sandbox even started (a cancellation that
  // landed during the mkdtemp/buildReviewJobSpec window above `runJob`, or
  // one that raced startSandbox itself) — stop it immediately rather than
  // waiting for the abort event, which never fires for an already-aborted
  // signal.
  if (signal?.aborted) {
    void handle.stop();
  }
  const onAbort = () => {
    void handle.stop();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await handle.wait();
  } finally {
    unsubscribe();
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Splits a byte stream into lines and forwards them one at a time via
 * `onLine`, enforcing two caps (R5):
 *   - a per-line byte cap (`limits.maxLineBytes`): a line longer than this
 *     is truncated and forwarded with `truncated: true` instead of growing
 *     `buffer` without limit — the original bug this fixes let a container
 *     emitting one huge line (no newline) grow `buffer += chunk` forever in
 *     the process holding the control plane's GitHub App private key.
 *   - a total-bytes cap shared across both streams of one job
 *     (`budget`/`limits.maxTotalOutputBytes`): once hit, `onCapped` fires
 *     once and no further lines are forwarded for either stream.
 *
 * Exported (unlike the old private version) so test/executor.test.ts can
 * drive it directly with a fake stream, no Docker required.
 */
export function attachLineStream(
  stream: NodeJS.ReadableStream | null,
  onLine: (line: string, truncated: boolean) => void,
  budget: OutputBudget,
  onCapped: () => void,
  limits: { maxLineBytes?: number; maxTotalOutputBytes?: number } = {},
): void {
  if (!stream) return;
  const maxLineBytes = limits.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES;
  const maxTotalOutputBytes = limits.maxTotalOutputBytes ?? DEFAULT_MAX_TOTAL_OUTPUT_BYTES;
  let buffer = "";

  const emit = (rawLine: string) => {
    if (budget.capped) return;
    let line = rawLine;
    let truncated = false;
    if (Buffer.byteLength(line, "utf8") > maxLineBytes) {
      line = Buffer.from(line, "utf8").subarray(0, maxLineBytes).toString("utf8");
      truncated = true;
    }
    budget.totalBytes += Buffer.byteLength(line, "utf8");
    onLine(line, truncated);
    if (budget.totalBytes >= maxTotalOutputBytes) {
      budget.capped = true;
      onCapped();
    }
  };

  stream.on("data", (chunk: Buffer) => {
    if (budget.capped) return;
    buffer += chunk.toString("utf8");
    let idx: number;
    while (!budget.capped && (idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      emit(line);
    }
  });
  stream.on("end", () => {
    if (!budget.capped && buffer.length > 0) {
      emit(buffer);
      buffer = "";
    }
  });
  // A stream-level error (e.g. EPIPE) must not crash a process holding the
  // control plane's GitHub App private key — there was no handler at all
  // before, which for Node streams means an uncaught 'error' event throws.
  stream.on("error", () => {
    /* swallow: see comment above */
  });
}

// Re-exported for run-job.ts / tests without needing to import contract.ts
// separately in every consumer.
export type { JobRuntime };
