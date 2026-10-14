import { describe, expect, it } from "vite-plus/test";

import type { TranscriptionEngine } from "./t3team-transcriptionEngine.ts";
import { parseHelperLine } from "./t3team-transcriptionProtocol.ts";
import { selectEngineId, TranscriptionRegistry } from "./t3team-transcriptionRegistry.ts";

const engine = (
  id: string,
  kind: "native" | "custom",
  available: boolean | Error,
): TranscriptionEngine => ({
  id,
  label: id,
  kind,
  probe: async () => {
    if (available instanceof Error) throw available;
    return available ? { available: true } : { available: false, reason: "nope" };
  },
  start: () => ({ stop: () => {}, abort: () => {} }),
});

describe("TranscriptionRegistry", () => {
  it("defaults to the first available native engine", async () => {
    const registry = new TranscriptionRegistry();
    registry.register(engine("whisper", "custom", true));
    registry.register(engine("macos-speech", "native", true));
    const status = await registry.status("de-CH");
    expect(status).toMatchObject({ available: true, engineId: "macos-speech" });
    expect(status.engines.map((e) => e.id)).toEqual(["whisper", "macos-speech"]);
  });

  it("honours the preferred engine when it is available", async () => {
    const registry = new TranscriptionRegistry();
    registry.register(engine("macos-speech", "native", true));
    registry.register(engine("whisper", "custom", true));
    registry.setPreferred("whisper");
    expect((await registry.status()).engineId).toBe("whisper");
  });

  it("falls back to native when the preferred engine is unavailable, then to custom", async () => {
    const registry = new TranscriptionRegistry();
    registry.register(engine("whisper", "custom", false));
    registry.register(engine("macos-speech", "native", true));
    registry.setPreferred("whisper");
    expect((await registry.status()).engineId).toBe("macos-speech");
    expect(
      selectEngineId(
        [
          { id: "n", label: "n", kind: "native", available: false },
          { id: "c", label: "c", kind: "custom", available: true },
        ],
        null,
      ),
    ).toBe("c");
  });

  it("reports unavailable with reasons when no engine works (unsupported OS / probe crash)", async () => {
    const registry = new TranscriptionRegistry();
    expect(await registry.status()).toEqual({ available: false, engineId: null, engines: [] });
    registry.register(engine("broken", "native", new Error("spawn ENOENT")));
    const status = await registry.status();
    expect(status.available).toBe(false);
    expect(status.engines[0]).toMatchObject({
      id: "broken",
      available: false,
      reason: "spawn ENOENT",
    });
  });

  it("unregisters engines", async () => {
    const registry = new TranscriptionRegistry();
    const dispose = registry.register(engine("a", "native", true));
    dispose();
    expect(registry.list()).toEqual([]);
  });
});

describe("parseHelperLine", () => {
  it("parses protocol events and ignores noise", () => {
    expect(parseHelperLine('{"type":"final","text":"Hallo Welt."}')).toEqual({
      type: "final",
      text: "Hallo Welt.",
    });
    expect(parseHelperLine('{"type":"level","level":4}')).toEqual({ type: "level", level: 1 });
    expect(
      parseHelperLine('{"type":"error","code":"permission-denied","message":"x"}'),
    ).toMatchObject({
      code: "permission-denied",
    });
    expect(parseHelperLine('{"type":"error","code":"weird","message":"x"}')).toMatchObject({
      code: "failed",
    });
    expect(parseHelperLine("2026-10-14 No Assistant asset for language de-CH")).toBeNull();
    expect(parseHelperLine("{broken")).toBeNull();
    expect(
      parseHelperLine('{"type":"probe","available":true,"locales":["de-CH",3]}'),
    ).toMatchObject({
      type: "probe",
      available: true,
      locales: ["de-CH"],
    });
  });
});
