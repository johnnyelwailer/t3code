/**
 * Conformance of resolveCloudSessionVisibleStatus against CloudSession.tla
 * under ApplyFix = TRUE. The oracle below is a line-by-line transcription of
 * the TLA operators (SetupCard, EndedBannerFixed, CloneBannerFixed,
 * OfflineBannerFixed, VisibleStatuses). Expected "current" values on the
 * named traces come from TLC itself (Alias visible), not from this oracle.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  resolveCloudSessionVisibleStatus,
  type CloudSessionConn,
  type CloudSessionQueuedRecord,
  type CloudSessionVisibleFacts,
} from "./t3team-cloudSessionVisibleStatus";
import { tlcTraces } from "./t3team-cloudSessionVisibleStatus.fixtures";

const TERMINAL = new Set(["failed", "stopped", "cancelled"]);
const PROVISIONING = new Set(["creating", "requested", "queued", "preparing", "starting"]);

/** SetupCard */
function specSetupCard(f: CloudSessionVisibleFacts): string {
  if (f.queued === "none" && (TERMINAL.has(f.phase) || f.phase === "none")) return "hidden";
  if (f.queued === "none" && !PROVISIONING.has(f.phase)) return "hidden";
  if (
    f.queued === "failed" ||
    (f.queued === "waiting" && TERMINAL.has(f.phase)) ||
    (f.queued === "waiting" && f.endedSticky && !PROVISIONING.has(f.phase) && f.phase !== "ready")
  ) {
    return "failed";
  }
  if (f.phase === "ready" && f.queued === "none") return "ready";
  if (f.queued === "waiting" || f.queued === "sending" || PROVISIONING.has(f.phase))
    return "working";
  return "hidden";
}

/** VisibleStatuses with ApplyFix = TRUE. */
function specVisibleFixed(f: CloudSessionVisibleFacts): string[] {
  const setup = specSetupCard(f);
  const settingUp = setup === "working" || setup === "failed" || setup === "ready";
  const ended = f.endedSticky && !settingUp && !f.startingAnother;
  const clone = false;
  const offline = (f.conn === "connecting" || f.conn === "offline") && !ended && !settingUp;
  const vis: string[] = [];
  if (settingUp) vis.push("setup");
  if (ended) vis.push("ended");
  if (clone) vis.push("clone");
  if (offline) vis.push("offline");
  return vis;
}

/** VisibleStatuses with ApplyFix = FALSE (current code). Used to check fixtures. */
function specVisibleCurrent(f: CloudSessionVisibleFacts): string[] {
  const setup = specSetupCard(f);
  const settingUp = setup === "working" || setup === "failed" || setup === "ready";
  const ended = f.endedSticky;
  const clone = f.cloneSuggested && f.machineConnected && !f.projectReady;
  const offline = (f.conn === "connecting" || f.conn === "offline") && !ended;
  const vis: string[] = [];
  if (settingUp) vis.push("setup");
  if (ended) vis.push("ended");
  if (clone) vis.push("clone");
  if (offline) vis.push("offline");
  return vis;
}

describe("TLC trace conformance", () => {
  for (const name of ["phil-0827", "phil-0832"] as const) {
    it(`reducer matches ApplyFix=TRUE on every ${name} step, and fixtures match TLC current`, () => {
      for (const [i, step] of tlcTraces[name].entries()) {
        const status = resolveCloudSessionVisibleStatus(step.facts);
        expect({ step: i, visible: [...status.visible] }).toEqual({
          step: i,
          visible: [...step.fixed.visible],
        });
        expect(status.setupStage).toBe(step.fixed.setupStage);
        expect(status.setupStage).toBe(specSetupCard(step.facts));
        expect([...status.visible]).toEqual(specVisibleFixed(step.facts));
        // Fixture "current" is what TLC printed for ApplyFix=FALSE.
        expect([...step.current.visible].sort()).toEqual(specVisibleCurrent(step.facts).sort());
        expect(status.visible.length).toBeLessThanOrEqual(1);
      }
    });
  }
});

const PHASES = [
  "none",
  "creating",
  "requested",
  "queued",
  "preparing",
  "starting",
  "ready",
  "failed",
  "stopped",
  "cancelled",
] as const;
const QUEUED: CloudSessionQueuedRecord[] = ["none", "waiting", "failed", "sending"];
const CONNS: CloudSessionConn[] = ["live", "connecting", "offline", "blocked"];

describe("exhaustive fact space vs the TLA transcription", () => {
  it("agrees on every combination of phase, queued, flags, and conn (5 120 cases)", () => {
    let n = 0;
    const mismatches: string[] = [];
    for (const phase of PHASES) {
      for (const queued of QUEUED) {
        for (const endedSticky of [false, true]) {
          for (const startingAnother of [false, true]) {
            for (const machineConnected of [false, true]) {
              for (const projectReady of [false, true]) {
                for (const cloneSuggested of [false, true]) {
                  for (const conn of CONNS) {
                    const f: CloudSessionVisibleFacts = {
                      phase,
                      queued,
                      failureKind: "none",
                      endedSticky,
                      startingAnother,
                      machineConnected,
                      projectReady,
                      providerReady: false,
                      cloneSuggested,
                      conn,
                    };
                    const status = resolveCloudSessionVisibleStatus(f);
                    const expected = specVisibleFixed(f);
                    const stage = specSetupCard(f);
                    n += 1;
                    if (
                      status.setupStage !== stage ||
                      status.visible.join(",") !== expected.join(",") ||
                      status.visible.length > 1
                    ) {
                      mismatches.push(
                        JSON.stringify({
                          f,
                          got: status.visible,
                          stage: status.setupStage,
                          expected,
                          expStage: stage,
                        }),
                      );
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(n).toBe(5120);
    expect(mismatches).toEqual([]);
  });
});
