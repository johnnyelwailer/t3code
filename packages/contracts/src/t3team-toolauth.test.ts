import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { ToolAuthInstallInput, ToolAuthPhase, ToolAuthState, ToolAuthToolId } from "./t3team-toolauth.ts";

const decodeToolAuthToolId = Schema.decodeUnknownSync(ToolAuthToolId);
const decodeToolAuthInstallInput = Schema.decodeUnknownSync(ToolAuthInstallInput);
const decodeToolAuthState = Schema.decodeUnknownSync(ToolAuthState);
const decodeToolAuthPhase = Schema.decodeUnknownSync(ToolAuthPhase);

describe("ToolAuthInstallInput — the client can only send a closed tool id", () => {
  it("accepts the known tool ids", () => {
    expect(decodeToolAuthInstallInput({ tool: "claude" })).toEqual({ tool: "claude" });
    expect(decodeToolAuthInstallInput({ tool: "codex" })).toEqual({ tool: "codex" });
  });

  it("rejects any string outside the closed union — no command, package, or flag can ride along", () => {
    expect(() => decodeToolAuthInstallInput({ tool: "rm -rf /" })).toThrow();
    expect(() => decodeToolAuthInstallInput({ tool: "npm install -g anything" })).toThrow();
    expect(() => decodeToolAuthInstallInput({ tool: "fake" })).toThrow();
  });

  it("drops extra fields — no way to smuggle a version, registry, or flags through", () => {
    const decoded = decodeToolAuthInstallInput({
      tool: "claude",
      version: "1.2.3",
      command: "rm -rf /",
    } as never);
    expect(decoded).toEqual({ tool: "claude" });
  });

  it("shares the same closed union as ToolAuthToolId", () => {
    expect(() => decodeToolAuthToolId("claude")).not.toThrow();
    expect(() => decodeToolAuthToolId("codex")).not.toThrow();
    expect(() => decodeToolAuthToolId("anything-else")).toThrow();
  });
});

describe("ToolAuthPhase — install is one more beat of the existing journey, not a parallel one", () => {
  it("accepts the new 'installing' phase alongside the existing sign-in phases", () => {
    expect(decodeToolAuthPhase("installing")).toBe("installing");
    expect(decodeToolAuthPhase("starting")).toBe("starting");
    expect(decodeToolAuthPhase("connected")).toBe("connected");
  });

  it("rejects an unknown phase", () => {
    expect(() => decodeToolAuthPhase("downloading")).toThrow();
  });
});

describe("ToolAuthState.installLog", () => {
  it("decodes without installLog (every other phase)", () => {
    const decoded = decodeToolAuthState({ tool: "claude", phase: "connected" });
    expect(decoded.installLog).toBeUndefined();
  });

  it("decodes an installing state carrying a rolling log", () => {
    const decoded = decodeToolAuthState({
      tool: "codex",
      phase: "installing",
      installLog: "added 1 package in 2s\n",
    });
    expect(decoded.phase).toBe("installing");
    expect(decoded.installLog).toBe("added 1 package in 2s\n");
  });

  it("decodes a failed install carrying the package manager's own message", () => {
    const decoded = decodeToolAuthState({
      tool: "codex",
      phase: "failed",
      message: "npm ERR! 403 Forbidden",
    });
    expect(decoded.message).toBe("npm ERR! 403 Forbidden");
  });
});
