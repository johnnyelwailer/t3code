// @effect-diagnostics nodeBuiltinImport:off - vitest reporter; it runs in the vitest main process, outside any Effect runtime.
import * as NodeChildProcess from "node:child_process";

const IDLE_DUMP_AFTER_MS = 180_000;
const EXIT_DUMP_AFTER_MS = 30_000;
const DUMP_EVERY_MS = 60_000;
const PROCESS_LINES = 40;
const PROCESS_PATTERN = /chrome|playwright|vitest|vite-plus|node/i;

const stamp = () => new Date().toISOString();
const log = (line: string) => process.stderr.write(`[teardown-diag ${stamp()}] ${line}\n`);

function activeHandles(): unknown[] {
  const read = Reflect.get(process, "_getActiveHandles");
  const handles: unknown = typeof read === "function" ? Reflect.apply(read, process, []) : [];
  return Array.isArray(handles) ? handles : [];
}

function describeHandle(handle: unknown): string {
  if (typeof handle !== "object" || handle === null) return typeof handle;
  const name = handle.constructor?.name ?? "Object";
  const details = ["pid", "spawnfile", "remoteAddress", "remotePort", "localPort"]
    .map((key) => [key, Reflect.get(handle, key)] as const)
    .filter(([, value]) => typeof value === "string" || typeof value === "number")
    .map(([key, value]) => `${key}=${String(value)}`);
  return [name, ...details].join(" ");
}

function processTable(): string[] {
  try {
    const table = NodeChildProcess.execFileSync("ps", ["-eo", "pid,ppid,etimes,stat,args"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    return table
      .split("\n")
      .filter((line) => PROCESS_PATTERN.test(line))
      .slice(0, PROCESS_LINES)
      .map((line) => line.trim().slice(0, 200));
  } catch (error) {
    return [`ps failed: ${String(error)}`];
  }
}

function unfinishedFiles(vitest: unknown): string[] {
  const state: unknown = Reflect.get(Object(vitest), "state");
  const read: unknown = Reflect.get(Object(state), "getFiles");
  const files: unknown = typeof read === "function" ? Reflect.apply(read, state, []) : [];
  if (!Array.isArray(files)) return [];
  return files
    .map((file: unknown) => {
      const result: unknown = Reflect.get(Object(file), "result");
      const status: unknown = Reflect.get(Object(result), "state");
      return { path: String(Reflect.get(Object(file), "filepath")), status: String(status) };
    })
    .filter(({ status }) => status !== "pass" && status !== "fail" && status !== "skip")
    .map(({ path, status }) => `${path} [${status}]`);
}

function dump(
  reason: string,
  finished: ReadonlyArray<string>,
  inFlight: ReadonlyArray<string>,
  unfinished: ReadonlyArray<string>,
) {
  const counts = new Map<string, number>();
  for (const handle of activeHandles()) {
    const label = describeHandle(handle);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  log(`DUMP (${reason}); last file finished: ${finished.at(-1) ?? "none"}`);
  log(`in flight (started, not finished): ${inFlight.length === 0 ? "none" : inFlight.join(", ")}`);
  log(`unfinished per vitest state: ${unfinished.length === 0 ? "none" : unfinished.join(", ")}`);
  log(`active resources: ${JSON.stringify(process.getActiveResourcesInfo())}`);
  for (const [label, count] of counts) log(`handle x${count}: ${label}`);
  for (const line of processTable()) log(`ps: ${line}`);
}

/** CI-only: says what keeps the vitest process alive when the run stops after the last test file. */
export default class TeardownDiagnostics {
  private readonly finished: string[] = [];
  private readonly inFlight = new Set<string>();
  private lastFinishedAt = Date.now();
  private runEndedAt: number | null = null;
  private lastDumpAt = 0;
  private vitest: unknown = null;

  onInit(vitest: unknown) {
    this.vitest = vitest;
    process.once("exit", (code) => log(`process exit event, code ${String(code)}`));
    setInterval(() => this.tick(), DUMP_EVERY_MS).unref();
  }

  onTestModuleStart(testModule: { readonly moduleId: string }) {
    this.inFlight.add(testModule.moduleId);
  }

  onTestModuleEnd(testModule: { readonly moduleId: string }) {
    this.inFlight.delete(testModule.moduleId);
    this.finished.push(testModule.moduleId);
    this.lastFinishedAt = Date.now();
  }

  onTestRunEnd(testModules: ReadonlyArray<unknown>) {
    this.runEndedAt = Date.now();
    log(
      `test run ended: ${String(testModules.length)} files; last file finished at ${new Date(this.lastFinishedAt).toISOString()}`,
    );
  }

  private tick() {
    const now = Date.now();
    const afterRun = this.runEndedAt !== null && now - this.runEndedAt > EXIT_DUMP_AFTER_MS;
    const idle = this.runEndedAt === null && now - this.lastFinishedAt > IDLE_DUMP_AFTER_MS;
    if ((afterRun || idle) && now - this.lastDumpAt >= DUMP_EVERY_MS) {
      this.lastDumpAt = now;
      try {
        dump(
          afterRun ? "process still alive after the run ended" : "no file finished for 3 minutes",
          this.finished,
          [...this.inFlight],
          unfinishedFiles(this.vitest),
        );
      } catch (error) {
        log(`dump failed: ${String(error)}`);
      }
    }
  }
}
