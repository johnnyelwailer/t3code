// @effect-diagnostics nodeBuiltinImport:off globalTimers:off - process boundary to the native helper.
import * as NodeChildProcess from "node:child_process";
import * as NodeReadline from "node:readline";

import type {
  TranscriptionEngine,
  TranscriptionSession,
  TranscriptionStartOptions,
} from "./t3team-transcriptionEngine.ts";
import { parseHelperLine, type TranscriptionProbe } from "./t3team-transcriptionProtocol.ts";

/** How to run a helper that speaks the JSON-lines protocol. */
export interface HelperCommand {
  readonly command: string;
  /** Arguments placed before the protocol arguments (e.g. a script path). */
  readonly args?: ReadonlyArray<string>;
  /** Builds the protocol arguments; defaults to `probe|listen --locale <locale>`. */
  readonly protocolArgs?: (mode: "probe" | "listen", locale: string | undefined) => string[];
  readonly env?: Readonly<Record<string, string>>;
}

export type Spawn = (
  command: string,
  args: ReadonlyArray<string>,
  options: NodeChildProcess.SpawnOptions,
) => NodeChildProcess.ChildProcess;

const defaultProtocolArgs = (mode: "probe" | "listen", locale: string | undefined) =>
  locale ? [mode, "--locale", locale] : [mode];

const PROBE_TIMEOUT_MS = 8000;
const STOP_GRACE_MS = 6000;

/** Engine backed by an external helper process (native OS helpers and custom command engines). */
export class HelperProcessEngine implements TranscriptionEngine {
  readonly id: string;
  readonly label: string;
  readonly kind: "native" | "custom";
  private readonly helper: HelperCommand;
  private readonly spawn: Spawn;

  constructor(
    id: string,
    label: string,
    kind: "native" | "custom",
    helper: HelperCommand,
    spawn: Spawn = NodeChildProcess.spawn,
  ) {
    this.id = id;
    this.label = label;
    this.kind = kind;
    this.helper = helper;
    this.spawn = spawn;
  }

  private argv(mode: "probe" | "listen", locale: string | undefined): string[] {
    return [
      ...(this.helper.args ?? []),
      ...(this.helper.protocolArgs ?? defaultProtocolArgs)(mode, locale),
    ];
  }

  private run(mode: "probe" | "listen", locale: string | undefined) {
    return this.spawn(this.helper.command, this.argv(mode, locale), {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, ...this.helper.env },
    });
  }

  probe(locale?: string): Promise<TranscriptionProbe> {
    return new Promise((resolve) => {
      let child: NodeChildProcess.ChildProcess;
      try {
        child = this.run("probe", locale);
      } catch (error) {
        resolve({ available: false, reason: `helper failed to start: ${String(error)}` });
        return;
      }
      let settled = false;
      const done = (probe: TranscriptionProbe) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill();
        resolve(probe);
      };
      const timer = setTimeout(
        () => done({ available: false, reason: "probe timed out" }),
        PROBE_TIMEOUT_MS,
      );
      child.on("error", (error) =>
        done({ available: false, reason: `helper failed to start: ${error.message}` }),
      );
      child.on("exit", (code) =>
        done({ available: false, reason: `helper exited (${code}) without a probe` }),
      );
      NodeReadline.createInterface({ input: child.stdout! }).on("line", (line) => {
        const parsed = parseHelperLine(line);
        if (parsed?.type === "probe") {
          const { type: _type, ...probe } = parsed;
          done(
            probe.available
              ? probe
              : { ...probe, reason: probe.reason ?? "engine reports unavailable" },
          );
        } else if (parsed?.type === "error") {
          done({ available: false, reason: parsed.message });
        }
      });
    });
  }

  start({ locale, onEvent }: TranscriptionStartOptions): TranscriptionSession {
    let ended = false;
    let aborted = false;
    const end = () => {
      if (ended) return;
      ended = true;
      clearTimeout(killTimer);
      onEvent({ type: "end" });
    };
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let child: NodeChildProcess.ChildProcess;
    try {
      child = this.run("listen", locale);
    } catch (error) {
      queueMicrotask(() => {
        onEvent({
          type: "error",
          code: "failed",
          message: `helper failed to start: ${String(error)}`,
        });
        end();
      });
      return { stop: () => {}, abort: () => {} };
    }
    child.on("error", (error) => {
      if (!aborted)
        onEvent({
          type: "error",
          code: "failed",
          message: `helper failed to start: ${error.message}`,
        });
      end();
    });
    child.on("exit", () => end());
    child.stdin?.on("error", () => {});
    NodeReadline.createInterface({ input: child.stdout! }).on("line", (line) => {
      if (aborted) return;
      const parsed = parseHelperLine(line);
      if (!parsed || parsed.type === "probe") return;
      if (parsed.type === "end") end();
      else onEvent(parsed);
    });
    return {
      stop: () => {
        if (ended) return;
        child.stdin?.end("stop\n");
        killTimer = setTimeout(() => child.kill(), STOP_GRACE_MS);
      },
      abort: () => {
        aborted = true;
        child.kill();
        end();
      },
    };
  }
}
