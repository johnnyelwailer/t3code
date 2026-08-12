/**
 * The job contract — the interface between the control plane and the
 * execution plane (see the execution-plane design decisions: "Execution
 * plane" section: `job spec: { image, workspace ref, env (no secrets), timeout } →
 * journal events + artifacts back`).
 *
 * This module is deliberately dependency-free: it is imported by both the
 * control plane (a Temporal activity, stage 3) and this package's own
 * executor, and must never pull in Docker/execa/Node-specific types so it
 * can be shared or copied without dragging a runtime along. The one
 * exception is `node:path`, used only by the optional JOB_WORKSPACE_ROOT
 * guard below — it's a universal Node built-in, not a Docker/execa runtime
 * dependency, and the guard needs real path resolution to catch `..`
 * escapes.
 */
import { isAbsolute, relative, resolve } from "node:path";

/** Network egress mode for a job's sandbox. See the design doc's "Egress
 * policy = provider policy" note: a project's L1–L4 provider-policy level
 * compiles down to one of these networks. v1 only implements 'none' and
 * 'open' honestly; 'gateway-only' is the placeholder for the on-prem
 * gateway-proxy attachment described there — see executor.ts. */
export type JobNetwork = "none" | "gateway-only" | "open";

/** Container runtime to launch the job under. 'runc' is the Docker Desktop
 * default (works on macOS dev boxes). 'runsc' selects gVisor for the
 * stronger kernel-isolation boundary the design doc calls for
 * ("Sandbox-first: no unsandboxed pilot") — Linux-only, so this is a flag,
 * not a hardcoded choice, to keep macOS dev usable. */
export type JobRuntime = "runc" | "runsc";

/** Where the executor bind-mounts JobSpec.workspace (see executor.ts's `-w
 * /workspace` / `-v ...:/workspace:<mode>`). This module deliberately does
 * not import executor.ts (see the module doc comment's "dependency-free"
 * rule), so the path is duplicated here as the one literal the
 * `secretMounts` containment check below is defined against. */
const WORKSPACE_MOUNT_PATH = "/workspace";

/**
 * A single secret bind mount — the structural fix for
 * docs/design/resident-agent.md's "Invariant: agents never touch secrets.
 * Only scripts do.": a credential delivered via `JobSpec.workspace` sits
 * under `/workspace`, which the review-harness's ACP fs handlers
 * (path-guard.mjs's `resolveWorkspacePath`) can address by design — so an
 * agent (steered by attacker-influenceable prompt/PR content) could read it
 * and exfiltrate it via its own output channel (a posted comment). A
 * `secretMounts` entry is mounted at its own `containerPath`, which
 * `parseJobSpec` (below) requires to be OUTSIDE `/workspace` — a path the
 * workspace-scoped fs guard cannot address at all, not merely one it is
 * told not to serve.
 */
export interface SecretMount {
  /** Absolute path on the Docker host to the secret file to bind-mount.
   * Caller-prepared (e.g. a mode-0600 file the control plane wrote) — the
   * execution plane never creates or contains secret material itself. */
  hostPath: string;
  /** Absolute in-container path to mount the secret at. Rejected by
   * `parseJobSpec` if it resolves under `/workspace` — see this type's doc
   * comment for why that containment is the entire point. */
  containerPath: string;
  /** Defaults to `true` — a secret mount is read-only unless a caller has
   * an actual reason to write back into it (none does today). */
  readOnly?: boolean;
}

/**
 * A single execution request submitted to the execution plane.
 *
 * Design rationale baked into the shape (see docs/design/resident-agent.md):
 * - "Secrets stay in the control plane." `env` must never carry secrets —
 *   the control plane pre-materializes read-only workspaces or single-use
 *   checkout tokens and hands the worker only what it needs to run, not
 *   what it needs to authenticate as a human/service. `parseJobSpec` in
 *   this module rejects secret-shaped env keys as a real, enforced rule
 *   rather than a comment.
 * - "Pre-materialized read-only workspace" — `workspace.readOnly` defaults
 *   to `true`; a job that needs to write gets it explicitly, and even then
 *   only to its own bind mount, never the host's working tree.
 * - "Egress policy = provider policy" — `network` defaults to the most
 *   restrictive option (`'none'`) at the parse layer; callers must opt in
 *   to anything that can reach the network at all.
 */
export interface JobSpec {
  /** Caller-assigned unique id for this run. Used to name the container
   * (`job-<jobId>`) and to correlate JobEvents/JobResult back to the
   * journal entry that requested the run. */
  jobId: string;

  /** OCI image reference to run, e.g. `alpine:3`. The execution plane never
   * builds images — images are prepared/published upstream (warm pools,
   * per-project caches are growth-path concerns per the design doc's "Hot
   * path" section, not v1). */
  image: string;

  /** Optional command + args to run inside the image, overriding its
   * ENTRYPOINT/CMD. Passed as an argv array — never a shell string — so a
   * job spec can never smuggle shell metacharacters into the host shell. */
  cmd?: string[];

  /** Optional bind-mounted workspace. Absent means the job gets no
   * workspace mount at all (e.g. a pure compute job). */
  workspace?: {
    /** Absolute path on the Docker host to bind-mount into the
     * container's default working directory. */
    hostPath: string;
    /** Defaults to `true` at the parse layer (see parseJobSpec) —
     * "workspace read-only default" from the design doc. A job must
     * explicitly ask for `false` to get a writable checkout, and even
     * then it is still scoped to this one bind mount. */
    readOnly?: boolean;
  };

  /**
   * Optional additional bind mounts for secret material, each mounted
   * OUTSIDE `/workspace` (enforced by `parseJobSpec`) — see `SecretMount`'s
   * doc comment for why this exists and what it fixes. Omitted/empty means
   * no secret mounts, which is every job before this field existed.
   */
  secretMounts?: SecretMount[];

  /**
   * Environment variables passed into the container. Deliberately typed
   * as plain strings, not secrets/tokens: the control plane owns all
   * credentials (installation tokens, gateway auth) and never forwards
   * them here. `parseJobSpec` rejects keys that look like secrets
   * (`*_TOKEN`, `*_KEY`, `*_SECRET`, `PASSWORD`, etc.) so this rule is
   * enforced, not just documented.
   */
  env: Record<string, string>;

  /** Wall-clock budget for the whole run, in milliseconds. The executor
   * kills the container and reports `timedOut: true` in JobResult if the
   * process is still running past this deadline. */
  timeoutMs: number;

  /** Network egress mode. Defaults to `'none'` at the parse layer — the
   * design doc's provider-policy default for an unclassified/L1 project.
   * See JobNetwork for what each mode means and what v1 actually does. */
  network: JobNetwork;

  /** Container runtime to use. Omitted/`'runc'` is the portable default
   * (works on macOS Docker Desktop and Linux alike). `'runsc'` requests
   * gVisor and is only honored where the Docker daemon actually has the
   * runtime registered — see executor.ts's availability probe. */
  runtime?: JobRuntime;

  /** Optional per-job overrides of executor.ts's sane fixed resource-limit
   * defaults (`--memory`, `--memory-swap`, `--cpus`, `--pids-limit`). Omit
   * any field to keep its default. All values are passed straight through
   * as docker CLI flag values (e.g. `memory: "4g"`, `cpus: "1.5"`). */
  limits?: {
    /** `--memory`, default `DEFAULT_MEMORY_LIMIT` ("2g"). */
    memory?: string;
    /** `--memory-swap`, default equal to the effective `memory` value
     * (disables swap growth beyond the hard memory cap). */
    memorySwap?: string;
    /** `--cpus`, default `DEFAULT_CPUS` ("2"). */
    cpus?: string;
    /** `--pids-limit`, default `DEFAULT_PIDS_LIMIT` ("512"). */
    pids?: string;
  };

  /** Optional `--user` override (docker CLI syntax, e.g. `"10001:10001"` or
   * `"1000"`). v1 images run as a non-root user baked into the Dockerfile
   * by default (see images/harness/Dockerfile); set this when the caller
   * needs the in-container uid/gid to match the host owner of a bind-
   * mounted workspace (otherwise writes from the container's default uid
   * can fail against a host directory it doesn't own) — see README's
   * "hardening" note. */
  user?: string;
}

/** One line of the NDJSON event stream a running job emits. Every event
 * carries `jobId` and a monotonic `ts` so a control-plane consumer can
 * interleave events from multiple concurrent jobs and detect gaps. */
export type JobEvent =
  | { type: "started"; jobId: string; ts: number; containerName: string }
  | {
      type: "stdout";
      jobId: string;
      ts: number;
      line: string;
      /** `true` when `line` was cut short at the per-line byte cap (see
       * executor.ts's `DEFAULT_MAX_LINE_BYTES`). Omitted (not `false`) when
       * the line was forwarded whole. */
      truncated?: boolean;
    }
  | {
      type: "stderr";
      jobId: string;
      ts: number;
      line: string;
      /** See `stdout`'s `truncated` doc — same per-line cap applies. */
      truncated?: boolean;
    }
  | { type: "heartbeat"; jobId: string; ts: number }
  | {
      /** Emitted at most once per job, the moment the total forwarded
       * stdout+stderr byte budget (`DEFAULT_MAX_TOTAL_OUTPUT_BYTES`) is hit.
       * No further `stdout`/`stderr` events follow for this job — the
       * container keeps running (this is an output cap, not a kill), but
       * the executor stops forwarding its output. */
      type: "output_capped";
      jobId: string;
      ts: number;
    }
  | {
      type: "exited";
      jobId: string;
      ts: number;
      exitCode: number | null;
      timedOut: boolean;
    };

/**
 * The final, structured outcome of a job run — the "and structured result
 * back" half of the design doc's job contract. Always exactly one
 * JobResult per JobSpec, emitted after the last JobEvent.
 */
export interface JobResult {
  /** Echoes JobSpec.jobId so callers can match results without keeping
   * their own request/response correlation table. */
  jobId: string;

  /** Process exit code, or `null` if the process never exited cleanly
   * (e.g. killed on timeout, or the container failed to start). */
  exitCode: number | null;

  /** Wall-clock duration of the run, in milliseconds, from container start
   * to exit (or to kill, on timeout). */
  durationMs: number;

  /** `true` if the executor killed the job for exceeding `timeoutMs`. When
   * this is `true`, the executor guarantees `exitCode` is `null` — never a
   * code sampled from a process that was torn down mid-flight (see
   * executor.ts's `runJob`, R2 in the security audit that made this a
   * guarantee rather than a "typically"). */
  timedOut: boolean;

  /** `true` if the container was killed by the OOM killer (detected via
   * `docker inspect`'s `State.OOMKilled`). Undefined when not applicable
   * or not determinable. */
  oomKilled?: boolean;

  /** Reserved for growth-path artifact collection (see README — "what v1
   * defers"). v1 never populates this; it exists so JobResult's shape is
   * already what stage 3's Temporal activity will consume. */
  artifacts?: string[];
}

/** Env var key patterns that look like secrets. This is the "no secrets in
 * env" design rule made real: `parseJobSpec` rejects any JobSpec whose env
 * carries a key matching one of these, so a caller can't accidentally (or
 * accidentally-on-purpose) tunnel a credential through the one field the
 * design doc says must never carry one. */
const SECRET_KEY_PATTERN = /(^|_)(TOKEN|SECRET|KEY|PASSWORD|PASSWD|CREDENTIAL)S?($|_)/i;

/** Sane OCI image-reference charset: must not start with `-` (a docker-CLI
 * flag look-alike — see executor.ts's `buildDockerRunArgs`'s `--`
 * separator, which this check backs up in depth) and otherwise only the
 * characters real image references use (registry host, repo path
 * segments, tag, digest). Deliberately permissive beyond that — this is a
 * sanity check against argument-injection-shaped strings, not a full OCI
 * reference grammar validator. */
const IMAGE_REF_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._\-/:@]*$/;

/** docker CLI `--user` charset: `uid`, `user`, `uid:gid`, or `user:group`.
 * Must not start with `-` (same argument-injection concern as
 * IMAGE_REF_PATTERN — a leading-dash value could otherwise be read as
 * another docker flag). Deliberately permissive beyond that — no full
 * passwd-grammar validation. */
const USER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*(:[a-zA-Z0-9._-]+)?$/;

export class JobSpecValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobSpecValidationError";
  }
}

/**
 * Hand-rolled validation (no zod dependency, per the "keep it
 * dependency-free" instruction on this module) that turns an arbitrary
 * unknown value into a well-formed JobSpec, applying the contract's
 * defaults (`network: 'none'`, `workspace.readOnly: true`) and rejecting
 * secret-shaped env keys.
 *
 * `processEnv` (second parameter, defaults to `process.env`) is consulted
 * only for the optional `JOB_WORKSPACE_ROOT` allowed-root guard below —
 * everything else about validation is a pure function of `input`.
 *
 * Throws JobSpecValidationError with a message naming the offending field.
 */
export function parseJobSpec(
  input: unknown,
  processEnv: Record<string, string | undefined> = process.env,
): JobSpec {
  if (typeof input !== "object" || input === null) {
    throw new JobSpecValidationError("job spec must be an object");
  }
  const raw = input as Record<string, unknown>;

  if (typeof raw.jobId !== "string" || raw.jobId.length === 0) {
    throw new JobSpecValidationError("jobId must be a non-empty string");
  }
  if (typeof raw.image !== "string" || raw.image.length === 0) {
    throw new JobSpecValidationError("image must be a non-empty string");
  }
  if (!IMAGE_REF_PATTERN.test(raw.image)) {
    throw new JobSpecValidationError(
      `image "${raw.image}" is not a valid image reference — it must not start with "-" ` +
        `(docker-CLI-flag-shaped strings are rejected as a defense-in-depth measure against ` +
        "argument injection; see executor.ts's buildDockerRunArgs) and may only contain " +
        "[a-zA-Z0-9._-/:@]",
    );
  }

  let cmd: string[] | undefined;
  if (raw.cmd !== undefined) {
    if (!Array.isArray(raw.cmd) || !raw.cmd.every((c) => typeof c === "string")) {
      throw new JobSpecValidationError("cmd must be an array of strings");
    }
    cmd = raw.cmd as string[];
  }

  let workspace: JobSpec["workspace"];
  if (raw.workspace !== undefined) {
    if (typeof raw.workspace !== "object" || raw.workspace === null) {
      throw new JobSpecValidationError("workspace must be an object");
    }
    const ws = raw.workspace as Record<string, unknown>;
    if (typeof ws.hostPath !== "string" || ws.hostPath.length === 0) {
      throw new JobSpecValidationError("workspace.hostPath must be a non-empty string");
    }
    if (ws.readOnly !== undefined && typeof ws.readOnly !== "boolean") {
      throw new JobSpecValidationError("workspace.readOnly must be a boolean");
    }
    // "workspace read-only default" — a job must opt out explicitly.
    workspace = { hostPath: ws.hostPath, readOnly: ws.readOnly ?? true };

    // Allowed-root guard: when JOB_WORKSPACE_ROOT is set, a workspace
    // hostPath must resolve (via real path resolution, no `..` escape)
    // inside it. When unset, any hostPath is accepted — the caller (the
    // control plane's activity code, which mints these paths itself via
    // mkdtemp) is trusted today; see README's "workspace root" note for the
    // risk this leaves open until every deployment sets the var.
    const root = processEnv.JOB_WORKSPACE_ROOT;
    if (root && root.trim().length > 0) {
      const resolvedRoot = resolve(root);
      const resolvedHost = resolve(workspace.hostPath);
      const rel = relative(resolvedRoot, resolvedHost);
      const escapesRoot = rel === ".." || rel.startsWith("../") || isAbsolute(rel);
      if (escapesRoot) {
        throw new JobSpecValidationError(
          `workspace.hostPath "${workspace.hostPath}" must resolve inside JOB_WORKSPACE_ROOT ` +
            `("${root}") — resolved to "${resolvedHost}", which escapes it`,
        );
      }
    }
  }

  const env: Record<string, string> = {};
  if (raw.env !== undefined) {
    if (typeof raw.env !== "object" || raw.env === null) {
      throw new JobSpecValidationError("env must be an object");
    }
    for (const [key, value] of Object.entries(raw.env as Record<string, unknown>)) {
      if (typeof value !== "string") {
        throw new JobSpecValidationError(`env.${key} must be a string`);
      }
      if (SECRET_KEY_PATTERN.test(key)) {
        throw new JobSpecValidationError(
          `env.${key} looks like a secret (matches ${SECRET_KEY_PATTERN}) — ` +
            "the job contract forbids secrets in env; the control plane owns " +
            "all credentials and must not forward them to the execution plane",
        );
      }
      env[key] = value;
    }
  }

  if (typeof raw.timeoutMs !== "number" || !(raw.timeoutMs > 0)) {
    throw new JobSpecValidationError("timeoutMs must be a positive number");
  }

  // "network 'none' default" — the most restrictive provider-policy level.
  let network: JobNetwork = "none";
  if (raw.network !== undefined) {
    if (raw.network !== "none" && raw.network !== "gateway-only" && raw.network !== "open") {
      throw new JobSpecValidationError("network must be one of 'none' | 'gateway-only' | 'open'");
    }
    network = raw.network;
  }

  let runtime: JobRuntime | undefined;
  if (raw.runtime !== undefined) {
    if (raw.runtime !== "runc" && raw.runtime !== "runsc") {
      throw new JobSpecValidationError("runtime must be 'runc' or 'runsc'");
    }
    runtime = raw.runtime;
  }

  let limits: JobSpec["limits"];
  if (raw.limits !== undefined) {
    if (typeof raw.limits !== "object" || raw.limits === null) {
      throw new JobSpecValidationError("limits must be an object");
    }
    const rawLimits = raw.limits as Record<string, unknown>;
    limits = {};
    for (const field of ["memory", "memorySwap", "cpus", "pids"] as const) {
      if (rawLimits[field] === undefined) continue;
      if (typeof rawLimits[field] !== "string" || (rawLimits[field] as string).length === 0) {
        throw new JobSpecValidationError(`limits.${field} must be a non-empty string`);
      }
      limits[field] = rawLimits[field] as string;
    }
  }

  let secretMounts: SecretMount[] | undefined;
  if (raw.secretMounts !== undefined) {
    if (!Array.isArray(raw.secretMounts)) {
      throw new JobSpecValidationError("secretMounts must be an array");
    }
    secretMounts = raw.secretMounts.map((entry, i) => {
      if (typeof entry !== "object" || entry === null) {
        throw new JobSpecValidationError(`secretMounts[${i}] must be an object`);
      }
      const m = entry as Record<string, unknown>;
      if (typeof m.hostPath !== "string" || m.hostPath.length === 0) {
        throw new JobSpecValidationError(`secretMounts[${i}].hostPath must be a non-empty string`);
      }
      if (typeof m.containerPath !== "string" || m.containerPath.length === 0) {
        throw new JobSpecValidationError(
          `secretMounts[${i}].containerPath must be a non-empty string`,
        );
      }
      if (!isAbsolute(m.containerPath)) {
        throw new JobSpecValidationError(
          `secretMounts[${i}].containerPath "${m.containerPath}" must be an absolute path`,
        );
      }
      // The invariant this exists to enforce (docs/design/resident-agent.md,
      // "agents never touch secrets, only scripts do"): a secret mounted
      // under /workspace is reachable by the review-harness's
      // workspace-scoped ACP fs guard, which defeats the entire point of a
      // dedicated secret mount. Reject rather than silently allow.
      const relToWorkspace = relative(WORKSPACE_MOUNT_PATH, resolve(m.containerPath));
      const isUnderWorkspace =
        relToWorkspace === "" || (!relToWorkspace.startsWith("..") && !isAbsolute(relToWorkspace));
      if (isUnderWorkspace) {
        throw new JobSpecValidationError(
          `secretMounts[${i}].containerPath "${m.containerPath}" must not be under ` +
            `${WORKSPACE_MOUNT_PATH} — agents never touch secrets, only scripts do (see ` +
            "docs/design/resident-agent.md's \"Invariant: agents never touch secrets. Only " +
            'scripts do."); a path under /workspace is addressable by the workspace-scoped ' +
            "ACP fs guard, which is exactly what secretMounts exists to avoid",
        );
      }
      if (m.readOnly !== undefined && typeof m.readOnly !== "boolean") {
        throw new JobSpecValidationError(`secretMounts[${i}].readOnly must be a boolean`);
      }
      return {
        hostPath: m.hostPath,
        containerPath: m.containerPath,
        readOnly: (m.readOnly as boolean | undefined) ?? true,
      };
    });
  }

  let user: string | undefined;
  if (raw.user !== undefined) {
    if (typeof raw.user !== "string" || raw.user.length === 0) {
      throw new JobSpecValidationError("user must be a non-empty string");
    }
    if (!USER_PATTERN.test(raw.user)) {
      throw new JobSpecValidationError(
        `user "${raw.user}" is not a valid docker --user value — expected ` +
          '"uid", "user", "uid:gid", or "user:group" (charset [a-zA-Z0-9._-])',
      );
    }
    user = raw.user;
  }

  return {
    jobId: raw.jobId,
    image: raw.image,
    cmd,
    workspace,
    env,
    timeoutMs: raw.timeoutMs,
    network,
    runtime,
    limits,
    user,
    secretMounts,
  };
}
