import { describe, expect, it } from "vitest";
import { NexiSignInRequiredError } from "./t3team-nexiOAuth";
import { classifyNexiStartError } from "./t3team-nexiStartError";
import {
  FIXTURE_BASE,
  FIXTURE_HOSTS,
  FIXTURE_NOW,
  START_FIXTURES,
} from "./t3team-nexiStartFixtures";
import { deriveNexiStartModel, type NexiStartInput } from "./t3team-nexiStartModel";
import {
  ConnectionBlockedError,
  ConnectionTransientError,
} from "@t3tools/client-runtime/connection";

const derive = (patch: Partial<NexiStartInput>) =>
  deriveNexiStartModel({ ...FIXTURE_BASE, ...patch });
const ids = (patch: Partial<NexiStartInput>) => derive(patch).actions.map((a) => a.id);
const primary = (patch: Partial<NexiStartInput>) =>
  derive(patch).actions.find((a) => a.tone === "primary");
const host = (id: string, label: string, online: boolean, lastSeen?: string) => ({
  id,
  label,
  online,
  lastSeen,
});

describe("deriveNexiStartModel", () => {
  it.each([
    ["flag off", { enabled: false }, "unavailable", ["pair"], "pair"],
    ["checking the stored token", { signedIn: null }, "loading", [], undefined],
    ["signed out", { signedIn: false, hosts: null }, "signed-out", ["sign-in", "pair"], "sign-in"],
    [
      "device code pending",
      { deviceCodePending: true, signedIn: false, hosts: null },
      "device-code",
      [],
      undefined,
    ],
    ["first host fetch in flight", { hosts: null, busy: true }, "loading", [], undefined],
    ["signed in, no hosts", { hosts: [] }, "no-hosts", ["refresh", "pair", "sign-out"], "refresh"],
    ["signed in, hosts", {}, "hosts", ["refresh", "pair", "sign-out"], undefined],
  ] as const)("%s", (_name, patch, mode, actions, primaryId) => {
    const model = derive(patch);
    expect(model.mode).toBe(mode);
    expect(model.actions.map((a) => a.id)).toEqual(actions);
    expect(primary(patch)?.id).toBe(primaryId);
  });

  it("flag off wins over any account state", () => {
    expect(derive({ enabled: false, signedIn: true, hosts: FIXTURE_HOSTS }).mode).toBe(
      "unavailable",
    );
    expect(derive({ enabled: false, signedIn: null }).mode).toBe("unavailable");
  });

  it("signed out offers Entra sign-in first and the stock pairing path second", () => {
    const model = derive({ signedIn: false, hosts: null });
    expect(model.actions.map((a) => a.label)).toEqual([
      "Sign in with Entra",
      "Connect with a pairing link or QR",
    ]);
    expect(model.hosts).toEqual([]);
  });

  it("an expired token returns to sign-in with a re-sign-in action", () => {
    const model = derive(START_FIXTURES["signed-out-expired"]);
    expect(model.mode).toBe("signed-out");
    expect(model.banner).toBe("Your Nexplore sign-in expired. Sign in again.");
    expect(model.actions[0]).toMatchObject({ id: "sign-in", label: "Sign in again" });
  });

  it("offline network disables sign-in and refresh but keeps the pairing path", () => {
    const out = derive({ signedIn: false, hosts: null, offline: true });
    expect(out.banner).toBe("No internet connection.");
    expect(out.actions.map((a) => [a.id, a.disabled])).toEqual([
      ["sign-in", true],
      ["pair", false],
    ]);
    const some = derive({ offline: true });
    expect(some.actions.find((a) => a.id === "refresh")?.disabled).toBe(true);
    expect(some.hosts.every((h) => h.presence === "unknown" && h.disabled)).toBe(true);
  });

  it("offline with nothing loaded says so and offers a retry", () => {
    const model = derive({ hosts: null, offline: true });
    expect(model.mode).toBe("load-failed");
    expect(model.banner).toBe("No internet connection.");
  });

  it("broker 404 with nothing loaded shows the broker's own text and a retry", () => {
    const model = derive(START_FIXTURES["broker-404"]);
    expect(model.mode).toBe("load-failed");
    expect(model.banner).toContain("HTTP 404");
    expect(model.actions[0]).toMatchObject({ id: "refresh", label: "Try again", tone: "primary" });
  });

  it("an empty list differs from a failed list", () => {
    expect(derive({ hosts: [] }).mode).toBe("no-hosts");
    expect(derive({ hosts: [] }).body).toContain("Reachable via Nexi broker");
    expect(derive({ hosts: [], error: { kind: "broker", message: "boom" } }).banner).toBe(
      "Could not refresh: boom",
    );
    expect(derive({ hosts: null, error: { kind: "broker", message: "boom" } }).mode).toBe(
      "load-failed",
    );
  });

  it("a failed refresh keeps the last list but stops claiming presence", () => {
    const model = derive({ error: { kind: "broker", message: "HTTP 502" } });
    expect(model.mode).toBe("hosts");
    expect(model.banner).toBe("Could not refresh: HTTP 502");
    expect(model.hosts.map((h) => h.presence)).toEqual(["unknown", "unknown", "unknown"]);
    expect(model.hosts.every((h) => h.status === "Status unknown")).toBe(true);
  });

  it("one online, one offline: online first, offline row not tappable, last seen shown", () => {
    const model = derive({
      hosts: [host("h-b", "Beta", false, "2026-10-25T07:50:00.000Z"), host("h-a", "Alpha", true)],
    });
    expect(model.title).toBe("1 of 2 online");
    expect(model.hosts.map((h) => [h.title, h.presence, h.disabled])).toEqual([
      ["Alpha", "online", false],
      ["Beta", "offline", true],
    ]);
    expect(model.hosts[1]?.status).toBe("Offline · last seen 2h ago");
    expect(model.body).toBeNull();
  });

  it("all hosts offline explains what to do", () => {
    const model = derive({ hosts: [host("h-a", "A", false), host("h-b", "B", false)] });
    expect(model.title).toBe("0 of 2 online");
    expect(model.body).toContain("All your desktops are offline");
    expect(model.hosts.every((h) => h.disabled && h.status === "Offline")).toBe(true);
  });

  it("a host that went offline between refresh and tap is flagged without trusting the old dot", () => {
    const failed = classifyNexiStartError(new Error("This desktop host is offline."), {
      hostId: "h-3f9a01c2",
    });
    const model = derive({ error: failed });
    expect(failed.kind).toBe("host");
    expect(model.banner).toContain("PJ's MacBook Pro could not be reached");
    expect(model.hosts.find((h) => h.id === "h-3f9a01c2")).toMatchObject({
      presence: "unknown",
      status: "Status unknown",
    });
    expect(model.hosts.find((h) => h.id === "h-7be4d9a0")?.presence).toBe("online");
    expect(model.mode).toBe("hosts");
  });

  it("connecting freezes every row and refresh", () => {
    const model = derive({ busy: true, connectingHostId: "h-7be4d9a0" });
    expect(model.hosts.find((h) => h.connecting)).toMatchObject({
      id: "h-7be4d9a0",
      status: "Connecting…",
    });
    expect(model.hosts.every((h) => h.disabled)).toBe(true);
    expect(model.actions.find((a) => a.id === "refresh")?.disabled).toBe(true);
  });

  it("duplicate labels get an id suffix, case and spacing ignored", () => {
    const model = derive({
      hosts: [
        host("h-1111aaaa", "MacBook", true),
        host("h-2222bbbb", " macbook ", true),
        host("h-3333cccc", "Other", true),
      ],
    });
    expect(model.hosts.map((h) => h.status)).toEqual([
      "Online · ID aaaa",
      "Online · ID bbbb",
      "Online",
    ]);
  });

  it("long and unicode names pass through whole; empty names get a placeholder", () => {
    const model = derive(START_FIXTURES["long-names"]);
    expect(model.hosts.map((h) => h.id)).toEqual(["h-aaaa0001", "h-aaaa0003", "h-aaaa0002"]);
    expect(model.hosts[2]?.title).toBe("山田のMac Studio 🖥️");
    expect(model.hosts[0]?.title).toContain("extraordinarily long");
    expect(model.hosts.find((h) => h.id === "h-aaaa0002")?.status).toBe(
      "Offline · last seen 1d ago",
    );
    expect(derive({ hosts: [host("h-x", "  ", true)] }).hosts[0]?.title).toBe("Unnamed desktop");
  });

  it("50 hosts stay sorted, online first, numerically within a group", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      host(`h-${String(i).padStart(8, "0")}`, `Mac ${50 - i}`, i % 5 === 0),
    );
    const model = derive({ hosts: many });
    expect(model.hosts).toHaveLength(50);
    expect(model.title).toBe("10 of 50 online");
    const online = model.hosts.slice(0, 10).map((h) => h.title);
    expect(online).toEqual(
      [...online].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    );
    expect(model.hosts.slice(0, 10).every((h) => h.presence === "online")).toBe(true);
    expect(model.hosts.slice(10).every((h) => h.presence === "offline")).toBe(true);
  });

  it("never mutates the input list", () => {
    const input = [host("h-b", "B", false), host("h-a", "A", true)];
    derive({ hosts: input });
    expect(input.map((h) => h.id)).toEqual(["h-b", "h-a"]);
    expect(FIXTURE_NOW).toBeGreaterThan(0);
  });
});

describe("classifyNexiStartError", () => {
  it("maps the broker client's real errors to recoveries", () => {
    expect(classifyNexiStartError(new NexiSignInRequiredError("x")).kind).toBe("auth");
    expect(
      classifyNexiStartError(
        new ConnectionBlockedError({
          reason: "authentication",
          detail: "Sign in to Nexplore again.",
        }),
      ).kind,
    ).toBe("auth");
    expect(
      classifyNexiStartError(
        new ConnectionBlockedError({ reason: "unsupported", detail: "Enable it." }),
      ).kind,
    ).toBe("other");
    expect(
      classifyNexiStartError(new ConnectionTransientError({ reason: "network", detail: "offline" }))
        .kind,
    ).toBe("network");
    const broker = classifyNexiStartError(
      new ConnectionTransientError({
        reason: "remote-unavailable",
        detail: "The broker is unavailable (HTTP 404).",
      }),
    );
    expect(broker).toEqual({ kind: "broker", message: "The broker is unavailable (HTTP 404)." });
  });

  it("treats a bare fetch failure as network and a failed connect as a host problem", () => {
    expect(classifyNexiStartError(new TypeError("Network request failed")).kind).toBe("network");
    expect(
      classifyNexiStartError(new Error("The desktop host did not identify its environment."), {
        hostId: "h-1",
      }),
    ).toEqual({
      kind: "host",
      message: "The desktop host did not identify its environment.",
      hostId: "h-1",
    });
    expect(classifyNexiStartError("nope").message).toBe("Could not connect to Nexplore.");
  });
});
