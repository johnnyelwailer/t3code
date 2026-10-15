// @effect-diagnostics nodeBuiltinImport:off globalTimers:off - fakes a child process with Node streams.
import * as NodeEvents from "node:events";
import * as NodeStream from "node:stream";

import { describe, expect, it, vi } from "vite-plus/test";

import { HelperProcessEngine, type Spawn } from "./t3team-helperProcessEngine.ts";
import { installTranscriptionIpc, type TranscriptionIpcSender } from "./t3team-transcriptionIpc.ts";
import { TRANSCRIPTION_IPC } from "./t3team-transcriptionProtocol.ts";
import { TranscriptionRegistry } from "./t3team-transcriptionRegistry.ts";

/** Fake helper process: tests write protocol lines to stdout and read what was sent to stdin. */
function fakeSpawn(script: (child: FakeChild, args: ReadonlyArray<string>) => void) {
  const calls: Array<ReadonlyArray<string>> = [];
  const spawn: Spawn = (_command, args) => {
    calls.push(args);
    const child = new FakeChild();
    queueMicrotask(() => script(child, args));
    return child as never;
  };
  return { spawn, calls };
}
class FakeChild extends NodeEvents.EventEmitter {
  stdout = new NodeStream.PassThrough();
  stdin = new NodeStream.PassThrough();
  stdinText = "";
  killed = false;
  constructor() {
    super();
    this.stdin.on("data", (d: Buffer) => (this.stdinText += d.toString()));
  }
  line(obj: unknown) {
    this.stdout.write(`${JSON.stringify(obj)}\n`);
  }
  kill() {
    this.killed = true;
    this.emit("exit", null);
    return true;
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("HelperProcessEngine", () => {
  it("probes via `probe --locale` and reports capability", async () => {
    const { spawn, calls } = fakeSpawn((child) =>
      child.line({ type: "probe", available: true, onDevice: true }),
    );
    const engine = new HelperProcessEngine(
      "macos-speech",
      "macOS",
      "native",
      { command: "x" },
      spawn,
    );
    expect(await engine.probe("de-CH")).toMatchObject({ available: true, onDevice: true });
    expect(calls[0]).toEqual(["probe", "--locale", "de-CH"]);
  });

  it("reports a missing helper as unavailable instead of throwing", async () => {
    const { spawn } = fakeSpawn((child) => child.emit("error", new Error("spawn ENOENT")));
    const engine = new HelperProcessEngine("e", "e", "native", { command: "x" }, spawn);
    expect(await engine.probe()).toMatchObject({
      available: false,
      reason: expect.stringContaining("ENOENT"),
    });
  });

  it("streams events, sends stop on stdin and ends once", async () => {
    let child!: FakeChild;
    const { spawn, calls } = fakeSpawn((c) => {
      child = c;
      c.line({ type: "ready", engine: "windows-sapi", locale: "de-DE" });
      c.line({ type: "partial", text: "hal" });
      c.line({ type: "final", text: "Hallo" });
    });
    const engine = new HelperProcessEngine(
      "w",
      "w",
      "native",
      {
        command: "powershell.exe",
        args: ["-File", "h.ps1"],
        protocolArgs: (m, l) => [m, "-Locale", l!],
      },
      spawn,
    );
    const events: unknown[] = [];
    const session = engine.start({ locale: "de-CH", onEvent: (e) => events.push(e) });
    await flush();
    expect(calls[0]).toEqual(["-File", "h.ps1", "listen", "-Locale", "de-CH"]);
    session.stop();
    await flush();
    expect(child.stdinText).toBe("stop\n");
    child.line({ type: "end" });
    child.emit("exit", 0);
    await flush();
    expect(events).toEqual([
      { type: "ready", engine: "windows-sapi", locale: "de-DE", onDevice: false },
      { type: "partial", text: "hal" },
      { type: "final", text: "Hallo" },
      { type: "end" },
    ]);
  });
});

describe("installTranscriptionIpc", () => {
  function setup() {
    const handlers = new Map<
      string,
      (event: { sender: TranscriptionIpcSender }, raw: unknown) => unknown
    >();
    const ipcMain = {
      handle: (
        channel: string,
        fn: (event: { sender: TranscriptionIpcSender }, raw: unknown) => unknown,
      ) => handlers.set(channel, fn),
      removeHandler: (channel: string) => handlers.delete(channel),
    };
    let child!: FakeChild;
    const { spawn } = fakeSpawn((c, args) => {
      child = c;
      if (args[0] === "probe") c.line({ type: "probe", available: true });
      else c.line({ type: "final", text: "hello" });
    });
    const registry = new TranscriptionRegistry();
    registry.register(
      new HelperProcessEngine("native-1", "Native", "native", { command: "x" }, spawn),
    );
    const dispose = installTranscriptionIpc(ipcMain, registry);
    const sent: unknown[] = [];
    const destroyed = new NodeEvents.EventEmitter();
    const sender: TranscriptionIpcSender = {
      id: 7,
      send: (_channel, payload) => sent.push(payload),
      isDestroyed: () => false,
      once: (event, listener) => void destroyed.once(event, listener),
    };
    const call = (channel: string, raw: unknown, from = sender) =>
      handlers.get(channel)!({ sender: from }, raw);
    return { handlers, call, sent, destroyed, dispose, getChild: () => child };
  }

  it("reports status, starts the selected engine and forwards its events to the caller", async () => {
    const { call, sent } = setup();
    expect(await call(TRANSCRIPTION_IPC.status, { locale: "de-CH" })).toMatchObject({
      available: true,
      engineId: "native-1",
    });
    const started = (await call(TRANSCRIPTION_IPC.start, { locale: "de-CH" })) as {
      sessionId: string;
    };
    expect(started).toMatchObject({ ok: true, engineId: "native-1" });
    await flush();
    expect(sent).toContainEqual({
      sessionId: started.sessionId,
      event: { type: "final", text: "hello" },
    });
  });

  it("refuses unknown engines and controls from other windows; aborts on window close", async () => {
    const { call, destroyed, getChild } = setup();
    expect(
      await call(TRANSCRIPTION_IPC.start, { locale: "en-US", engineId: "nope" }),
    ).toMatchObject({
      ok: false,
      code: "unavailable",
    });
    const { sessionId } = (await call(TRANSCRIPTION_IPC.start, { locale: "en-US" })) as {
      sessionId: string;
    };
    await flush();
    const other = { id: 9, send: vi.fn(), isDestroyed: () => false, once: vi.fn() };
    expect(await call(TRANSCRIPTION_IPC.stop, { sessionId }, other)).toBe(false);
    destroyed.emit("destroyed");
    expect(getChild().killed).toBe(true);
  });

  it("dispose removes every handler", () => {
    const { handlers, dispose } = setup();
    dispose();
    expect(handlers.size).toBe(0);
  });
});
