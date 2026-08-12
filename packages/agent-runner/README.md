# @t3tools/agent-runner — sandbox runner v1

Shared execution-plane infrastructure: the sandboxed execution plane for
running agent jobs and sessions in isolated containers. This proves the
isolation seam: a job spec goes in, an isolated container run happens,
NDJSON events + a structured result come back out. **Nothing in this
package knows what a job runs, or why** — no `review`, `finding`, or
`prompt` vocabulary anywhere in `src/`. Those are payload concerns of
whatever consumer builds the `JobSpec`; this package only knows how to
start, stream, and tear down one sandboxed container.

This package is a first-class pnpm workspace package. Two kinds of
consumer depend on it today (see "Two consumers" below): a batch-job
control plane (via `runJob`) and an interactive session host, such as the
t3code server (interactive sessions, via `startSandbox`).

## The contract

`src/contract.ts` is the interface between the control plane and the
execution plane, and is deliberately dependency-free so it can be imported
(or copied) by a Temporal activity without dragging Docker/execa along.

```ts
JobSpec  { jobId, image, cmd?, workspace?: { hostPath, readOnly },
           secretMounts?: { hostPath, containerPath, readOnly }[],
           limits?: { memory, memorySwap, cpus, pids }, user?, env,
           timeoutMs, network: 'none' | 'gateway-only' | 'open',
           runtime?: 'runc' | 'runsc' }
  -> JobEvent (NDJSON: started | stdout | stderr | heartbeat | output_capped | exited)
  -> JobResult { jobId, exitCode, durationMs, timedOut, oomKilled?, artifacts? }
```

`src/executor.ts` exposes two functions over this contract — `startSandbox`
is the primitive, `runJob` is a thin wrapper over it (see "Two consumers"
below for why both exist):

```ts
startSandbox(spec, opts?) -> Promise<SandboxHandle>
  // SandboxHandle: { id, containerName, stdin,
  //                  onEvent(listener): unsubscribe,
  //                  status(): 'starting'|'running'|'stopping'|'exited',
  //                  wait(): Promise<JobResult>,
  //                  stop(opts?: { timeoutMs? }): Promise<void> }

runJob(spec, { onEvent }) -> Promise<JobResult>
  // = start via startSandbox -> forward every JobEvent into onEvent
  //   -> await wait() -> return the JobResult
```

Design rules from the doc are enforced in code, not just comments:

- **No secrets in env.** `parseJobSpec` rejects any `env` key matching
  `*_TOKEN`, `*_KEY`, `*_SECRET`, `PASSWORD`, `*_CREDENTIAL(S)`, etc. The
  control plane owns all credentials; the execution plane never sees them.
- **Workspace read-only by default.** `workspace.readOnly` defaults to
  `true` at parse time; a job must explicitly opt into a writable mount.
- **Network `'none'` by default.** The most restrictive provider-policy
  level; a job must explicitly ask for `'open'` or `'gateway-only'`.
- **Image reference validated, not just typed.** `parseJobSpec` rejects any
  `image` starting with `-` or containing characters outside
  `[a-zA-Z0-9._-/:@]` — a `-`-leading string (e.g. `--network=host`) would
  otherwise be parsed by the docker CLI as another flag instead of the image
  reference. `buildDockerRunArgs` also inserts a `--` separator immediately
  before the image argument, as defense in depth against the same class of
  argument-injection.
- **Workspace hostPath is root-scoped when `JOB_WORKSPACE_ROOT` is set.**
  See "Workspace root" below.
- **Secret mounts must resolve outside `/workspace`.** `JobSpec.secretMounts`
  (each `{ hostPath, containerPath, readOnly? }`) is the structural fix for
  docs/design/resident-agent.md's "Invariant: agents never touch secrets.
  Only scripts do.": a credential delivered under the ordinary `workspace`
  bind mount sits at a path a workspace-scoped fs guard (e.g. the
  resident-agent review-harness's ACP `fs.readTextFile`/`writeTextFile`
  handlers) can address by design, so a prompt-injected agent instruction
  could read and exfiltrate it. `parseJobSpec` rejects any
  `secretMounts[].containerPath` that resolves under `/workspace` (naming
  the invariant in the error), so a secret can only ever be mounted
  somewhere the workspace-scoped guard structurally cannot reach — not
  merely somewhere it's told not to serve. `readOnly` defaults to `true`.
  `buildDockerRunArgs` mounts each entry as its own `-v hostPath:
containerPath:<ro|rw>`, independent of and never colliding with the
  workspace mount.
- **Validation happens at the trust boundary, not just at the CLI.**
  `startSandbox()` — the one function every real caller (the CLI via
  `runJob`, `services/resident-agent`'s Activity via `runJob`, and any
  interactive consumer calling `startSandbox` directly) goes through before
  anything touches Docker — runs its input through `parseJobSpec` itself,
  and `buildDockerRunArgs` re-validates too (defense in depth). A caller
  that builds a `JobSpec` object literal directly, without ever calling
  `parseJobSpec`, still gets every rule above enforced — TypeScript's
  `JobSpec` type says nothing at runtime about whether an object actually
  satisfies these rules, so validation lives on the code path itself, not
  only on a function callers have to remember to invoke.

## What v1 implements vs. defers

| capability                                     | v1                                                                                                                                                                                                                                                                                                                                       | growth path (see design doc)                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `network: 'none'`                              | real (`--network none`)                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                                                                                            |
| `network: 'open'`                              | real (default bridge)                                                                                                                                                                                                                                                                                                                    | replaced by per-project egress policy                                                                                                                                                                                                                                                                                                                        |
| `network: 'gateway-only'`                      | **partial, honestly**: creates/reuses an `--internal` Docker network (`agent-runner-egress`) — genuine containment (no default route out), but not yet attached to a gateway-proxy container. Calling it without opting into network creation throws `NotImplementedError` with the reason, rather than silently behaving like `'open'`. | full gateway-proxy attachment ships with the on-prem deployment; L1–L4 provider policy compiles to this                                                                                                                                                                                                                                                      |
| `runtime: 'runc'`                              | real, default                                                                                                                                                                                                                                                                                                                            | unchanged                                                                                                                                                                                                                                                                                                                                                    |
| `runtime: 'runsc'` (gVisor)                    | probed via `docker info`; used when available and requested, clear error when not                                                                                                                                                                                                                                                        | gVisor/runsc is Linux-only — v1 is tested for _arg-building_ only on macOS (Docker Desktop's daemon doesn't register `runsc` by default); real gVisor isolation happens on Linux hosts. See "Sandbox / growth" row in the design doc's buy-not-build survey (`kubernetes-sigs/agent-sandbox` + Kata Containers is the longer-term target, not this package). |
| Memory/CPU/pids limits                         | sane fixed defaults (`--memory 2g`, `--memory-swap 2g`, `--cpus 2`, `--pids-limit 512`), overridable per job via `JobSpec.limits`                                                                                                                                                                                                        | per-project tuning                                                                                                                                                                                                                                                                                                                                           |
| Timeout enforcement                            | authoritative: `docker kill` → verify via `docker inspect` → escalate to `docker rm -f` → verify again, bounded retries; `timedOut: true` and `exitCode: null` guaranteed in the result                                                                                                                                                  | unchanged shape, maybe grace-period SIGTERM-then-SIGKILL as an earlier step                                                                                                                                                                                                                                                                                  |
| Capability/rootfs hardening                    | `--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--read-only` root filesystem + writable `/tmp` tmpfs, non-root default user (image-baked uid 10001), `JobSpec.user` override                                                                                                                                                      | per-project capability grants, if ever needed                                                                                                                                                                                                                                                                                                                |
| Output volume                                  | per-line and total-bytes forwarding caps (`output_capped` event once the total is hit); stream `'error'` handled                                                                                                                                                                                                                         | configurable per project                                                                                                                                                                                                                                                                                                                                     |
| Warm pools, sticky routing, per-project caches | **not implemented** — this package runs exactly one job per invocation, cold every time                                                                                                                                                                                                                                                  | design doc's "Hot path" section: keep-N-warm loop, bare git mirrors + `--reference` clones, sccache/Turborepo remote caches, cache scope = project scope                                                                                                                                                                                                     |
| Artifacts                                      | `JobResult.artifacts` exists in the type, always empty in v1                                                                                                                                                                                                                                                                             | artifact collection from the workspace mount                                                                                                                                                                                                                                                                                                                 |
| Image builds/publishing                        | out of scope — `image` must already be pullable                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                                                                                                            |

## Files

- `src/contract.ts` — job contract types + `parseJobSpec` (validation with
  the no-secrets/read-only/network defaults baked in).
- `src/executor.ts` — Docker executor: pure `buildDockerRunArgs(spec)` for
  testable arg-building, `startSandbox(spec, opts?)` for the real,
  long-lived run (streaming, timeout, OOM detection, stdin/stop/status),
  `runJob(spec, { onEvent })` as the thin batch wrapper over it,
  `probeRunscAvailable()`, `ensureGatewayNetwork()`.
- `src/run-job.ts` — CLI: `tsx src/run-job.ts <jobspec.json>`, streams NDJSON
  events to stdout and writes the final `JobResult` as the last line.
- `test/` — vitest: contract validation, pure arg-building, timeout
  decision logic (fake timers), and a Docker integration test
  (`test/integration.test.ts`, `skipIf` no Docker) that actually runs
  `alpine:3`, a real timeout case, `startSandbox`'s interactive shape
  (stdin write -> incremental stdout -> `stop()`), and a same-shape
  comparison proving `runJob` is a wrapper over `startSandbox`.

No container image lives in this package. A consumer's job image (e.g.
resident-agent's review-harness, `services/resident-agent/images/review-harness/`)
is that consumer's payload, not shared infrastructure — see "Two consumers"
below.

## Running a job

```bash
cd services/agent-runner
npm install

cat > /tmp/jobspec.json <<'EOF'
{
  "jobId": "demo-1",
  "image": "alpine:3",
  "cmd": ["sh", "-c", "echo hello; sleep 1"],
  "env": {},
  "timeoutMs": 15000,
  "network": "none"
}
EOF

npx tsx src/run-job.ts /tmp/jobspec.json
```

Output (NDJSON, one JSON object per line — events first, `JobResult` last):

```json
{"type":"started","jobId":"demo-1","ts":1785761211082,"containerName":"job-demo-1"}
{"type":"stdout","jobId":"demo-1","ts":1785761211306,"line":"hello"}
{"type":"exited","jobId":"demo-1","ts":1785761212502,"exitCode":0,"timedOut":false}
{"jobId":"demo-1","exitCode":0,"durationMs":1425,"timedOut":false}
```

## Workspace root (`JOB_WORKSPACE_ROOT`)

`parseJobSpec` accepts any `workspace.hostPath` by default — the caller
(today, the resident-agent's control-plane activity code, which mints these
paths itself via `mkdtemp`) is trusted. Set `JOB_WORKSPACE_ROOT` to an
absolute path to add a real guard: any `workspace.hostPath` must resolve
(via `path.resolve`, rejecting `..` escapes) inside that root, or
`parseJobSpec` throws `JobSpecValidationError` before any `docker run` is
attempted.

```bash
JOB_WORKSPACE_ROOT=/srv/agent-runner/workspaces npx tsx src/run-job.ts /tmp/jobspec.json
```

**Risk while unset:** without `JOB_WORKSPACE_ROOT`, a `JobSpec` whose
`workspace.hostPath` a caller doesn't fully control (e.g. anything derived
from untrusted input, rather than a freshly `mkdtemp`'d path) could bind-mount
an arbitrary host directory into the container. Every deployment that
accepts job specs from anything less trusted than its own control-plane
process should set this.

## Hardening (`buildDockerRunArgs` defaults)

Every job gets these flags, unconditionally, on top of the resource limits
above:

- `--cap-drop=ALL` and `--security-opt=no-new-privileges` — the container
  gets no Linux capabilities beyond the bare minimum and can never gain
  more via setuid binaries.
- `--read-only` — the container's root filesystem is immutable. A job's
  writable `workspace` bind mount (`readOnly: false`) is unaffected — it's
  a separate mount, not part of the container's writable layer — so a job
  that needs to write still can, but only into its own workspace.
- `--tmpfs /tmp:rw,noexec,nosuid,size=64m` — a small writable scratch space,
  since `--read-only` otherwise breaks anything (including some Node
  internals) that assumes `/tmp` is writable.
- A non-root default user, when the consumer's image bakes one in (e.g.
  resident-agent's review-harness sets `USER 10001:10001`); `JobSpec.user`
  (docker `--user` syntax, e.g. `"10001:10001"` or a bare uid) overrides it
  per job — set this when the in-container uid needs to match the host uid
  that owns a bind-mounted workspace (otherwise a write into a host-owned
  directory can fail with the container's default uid).

## Output volume caps

`runJob`'s stdout/stderr forwarding is capped two ways (see `attachLineStream`
in executor.ts), so a chatty or misbehaving container can't grow unbounded
memory in the process that also holds the control plane's GitHub App
private key:

- **Per line** (`DEFAULT_MAX_LINE_BYTES`, 64 KiB): a line longer than this
  is truncated and its `stdout`/`stderr` JobEvent carries `truncated: true`.
- **Per job, both streams combined** (`DEFAULT_MAX_TOTAL_OUTPUT_BYTES`,
  10 MiB): once hit, a single `output_capped` JobEvent fires and no further
  output is forwarded for that job — the container itself keeps running;
  only forwarding stops.

## Two consumers

Per the design doc's decision, this package is shared foundation for two
kinds of consumer — nothing here is specific to either:

| consumer       | shape of work                                       | uses                                                |
| -------------- | --------------------------------------------------- | --------------------------------------------------- |
| resident agent | batch runbook jobs, minutes, unattended             | `runJob(spec, { onEvent })`                         |
| t3code server  | interactive user sessions, streaming, attach/detach | `startSandbox(spec)` + the returned `SandboxHandle` |

**Batch (resident agent).** `services/resident-agent`'s `agentReview`
activity imports `runJob()` / `parseJobSpec()` from `src/executor.ts` /
`src/contract.ts` directly and calls them in-process (both are plain async
functions with no CLI-only state):

```ts
import { runJob } from "@t3tools/agent-runner/executor.js";

const result = await runJob(jobSpec, {
  onEvent: (event) => activityContext.heartbeat(event), // every event, not just heartbeats
});
// result: JobResult — return it as the Activity's result
```

See `services/resident-agent/src/harness/` for the job-spec builder it
feeds `runJob` (writes its own payload files into the workspace mount, sets
`network: 'none'`, a writable workspace mount, non-secret `env`) and
`services/resident-agent/README.md`'s "Stage 3" section for the full chain.

**Interactive (t3code server).** A session host starts one long-lived
sandbox per user session, writes to its stdin as the user interacts, reads
`stdout`/`stderr` events incrementally, and calls `stop()` when the session
ends — `runJob` cannot express this (it only returns after the job is
already over), which is exactly why `startSandbox` exists as its own
primitive:

```ts
import { startSandbox } from "@t3tools/agent-runner/executor.js";

const handle = await startSandbox(jobSpec);
const unsubscribe = handle.onEvent((event) => {
  if (event.type === "stdout") session.forward(event.line);
});

handle.stdin.write(userInputLine + "\n"); // as the user types

// ... later, when the user disconnects:
await handle.stop({ timeoutMs: 5000 });
unsubscribe();
```

`handle.wait()` resolves the same `JobResult` shape `runJob` returns,
whether the sandbox ran to its own exit, hit `spec.timeoutMs`, or was
`stop()`'d explicitly.

**Cross-package import, not a copy**: this package's `package.json` has a
minimal `exports` map (`./contract.js`, `./executor.js`) so a consumer can
depend on it as `"@t3tools/agent-runner": "file:../agent-runner"` (a real npm
dependency — `npm install` creates a `node_modules/@t3tools/agent-runner`
symlink). Both `tsx` at runtime and `tsc --noEmit` resolve straight through
the symlink to this package's TypeScript sources; there is no build step
and no duplicated code between packages.

**Growth path / future work.** What may eventually be shared beyond the
job/sandbox primitives is a _generic_ base container image that speaks a
payload-neutral protocol (the design doc's ACP framing: an ACP-speaking
sandbox serves a batch turn and an interactive session equally). No such
image exists in this package today — every consumer's container image
(e.g. resident-agent's review-harness) is that consumer's own payload,
built and owned outside this package.

## Testing

```bash
npm run typecheck
npm test
```

The integration tests in `test/integration.test.ts` check Docker
availability with a synchronous `docker info` at module load (needed
because `it.skipIf` evaluates its condition at collection time, before any
`beforeAll` runs) and skip themselves cleanly when Docker isn't available.
When Docker is available they really run `alpine:3` — no mocking:

- a clean `runJob` exit and a `runJob` timeout case (both pre-existing);
- `startSandbox`'s interactive shape: start a long-running container, write
  to `handle.stdin`, read `stdout` events as they arrive (before the
  process exits), then `stop()` it and confirm `wait()` reports a torn-down
  result with no surviving container — the scenario `runJob` cannot
  express, since it only returns after the job is already over;
- `startSandbox`'s `status()` transitions (`starting` -> `running` ->
  `stopping` -> `exited`);
- a same-JobSpec comparison proving `runJob`'s returned `JobResult` has the
  identical shape `startSandbox(...).wait()` produces directly — the proof
  that `runJob` really is a thin wrapper, not a second implementation.

`killContainer`'s escalation logic (kill → verify → `rm -f` → verify,
bounded retries) is unit-tested in `test/timeout.test.ts` via an injected
`execDocker` stub, no Docker daemon required. The live end-to-end case —
`timedOut: true` ⇒ `exitCode: null`, and no surviving container per
`docker ps -a` — is covered by `test/integration.test.ts`'s timeout case.

This package's own tests never build or run a consumer's job image (e.g.
resident-agent's review-harness) — see that consumer's own tests/README for
proof its image builds and runs from its new location.
