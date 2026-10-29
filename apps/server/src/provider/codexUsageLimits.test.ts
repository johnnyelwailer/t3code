import * as CodexErrors from "effect-codex-app-server/errors";
import { describe, expect, it } from "vite-plus/test";

import {
  codexRateLimitsFailureMessage,
  codexRateLimitsToLimits,
  codexRateLimitsToUpdate,
  mergeCodexRateLimits,
} from "./codexUsageLimits.ts";

const checkedAt = "2026-07-18T10:00:00.000Z";

describe("codexRateLimitsToLimits", () => {
  it("shows an Enterprise monthly credit allowance in reads and notifications without a duration", () => {
    const snapshot = {
      limitId: "codex",
      planType: "enterprise_cbp_usage_based",
      primary: null,
      secondary: null,
      individualLimit: { remainingPercent: 99, resetsAt: 1_784_500_000 },
    };
    const windows = [
      {
        id: "individual",
        kind: "monthly",
        label: "Monthly credit limit",
        usedPercent: 1,
        resetsAt: "2026-07-19T22:26:40.000Z",
      },
    ];

    expect(
      codexRateLimitsToLimits({
        checkedAt,
        snapshot: { limitId: "spark" },
        rateLimitsByLimitId: { codex: snapshot },
      }),
    ).toEqual({ checkedAt, windows });
    expect(codexRateLimitsToUpdate(snapshot)).toEqual({ windows });
  });

  it("maps primary and secondary onto the session and weekly windows", () => {
    expect(
      codexRateLimitsToLimits({
        checkedAt,
        snapshot: {
          planType: "plus",
          primary: { usedPercent: 12, resetsAt: 1_784_000_000, windowDurationMins: 300 },
          secondary: { usedPercent: 47, resetsAt: 1_784_500_000, windowDurationMins: 10080 },
        },
      }),
    ).toEqual({
      checkedAt,
      windows: [
        {
          id: "primary",
          kind: "session",
          label: "Session",
          usedPercent: 12,
          windowDurationMins: 300,
          resetsAt: "2026-07-14T03:33:20.000Z",
        },
        {
          id: "secondary",
          kind: "weekly",
          label: "Weekly",
          usedPercent: 47,
          windowDurationMins: 10080,
          resetsAt: "2026-07-19T22:26:40.000Z",
        },
      ],
    });
  });

  it("treats a lone duration-less primary as monthly on Free and Go", () => {
    expect(
      codexRateLimitsToLimits({
        checkedAt,
        snapshot: { planType: "free", primary: { usedPercent: 80, resetsAt: null } },
      }).windows,
    ).toEqual([
      {
        id: "primary",
        kind: "monthly",
        label: "Monthly",
        usedPercent: 80,
        windowDurationMins: 43_200,
      },
    ]);
  });

  it("selects the main Codex allowance and leaves Spark out", () => {
    const spark = {
      limitId: "codex_bengalfox",
      individualLimit: { remainingPercent: 99, resetsAt: 1_784_500_000 },
      primary: { usedPercent: 0, windowDurationMins: 300 },
      secondary: { usedPercent: 90, windowDurationMins: 10080 },
    };
    expect(
      codexRateLimitsToLimits({
        checkedAt,
        snapshot: spark,
        rateLimitsByLimitId: {
          codex_bengalfox: spark,
          codex: { secondary: { usedPercent: 42, windowDurationMins: 10080 } },
        },
      }).windows,
    ).toEqual([
      {
        id: "secondary",
        kind: "weekly",
        label: "Weekly",
        usedPercent: 42,
        windowDurationMins: 10080,
      },
    ]);
  });

  it.each([undefined, null, {}])(
    "supports legacy reads with no bucket map: %j",
    (rateLimitsByLimitId) => {
      const snapshot = { primary: { usedPercent: 12, windowDurationMins: 300 } };
      expect(codexRateLimitsToLimits({ checkedAt, snapshot, rateLimitsByLimitId })).toEqual(
        codexRateLimitsToLimits({ checkedAt, snapshot }),
      );
    },
  );
});

describe("codexRateLimitsToUpdate", () => {
  it("does not republish cached windows over a newer account probe", () => {
    const cached = {
      primary: { usedPercent: 0, resetsAt: 1_784_000_000, windowDurationMins: 300 },
      secondary: { usedPercent: 20, resetsAt: 1_784_500_000, windowDurationMins: 10080 },
    };
    expect(codexRateLimitsToUpdate(cached)?.windows).toHaveLength(2);
    expect(codexRateLimitsToUpdate(structuredClone(cached), cached)).toBeUndefined();

    const changed = { ...cached, secondary: { ...cached.secondary, usedPercent: 21 } };
    expect(codexRateLimitsToUpdate(changed, cached)?.windows.map((window) => window.id)).toEqual([
      "secondary",
    ]);
    expect(codexRateLimitsToUpdate({ primary: cached.primary }, cached)).toBeUndefined();
    expect(
      codexRateLimitsToUpdate({ primary: { ...cached.primary, resetsAt: 1_784_001_000 } }, cached)
        ?.windows,
    ).toHaveLength(1);
    expect(
      codexRateLimitsToUpdate({ primary: { ...cached.primary, usedPercent: 76 } }, cached)
        ?.windows[0]?.usedPercent,
    ).toBe(76);
  });

  it("carries only the windows the notification names", () => {
    expect(
      codexRateLimitsToUpdate({
        secondary: { usedPercent: 51, windowDurationMins: 10080 },
      }),
    ).toEqual({
      windows: [
        {
          id: "secondary",
          kind: "weekly",
          label: "Weekly",
          usedPercent: 51,
          windowDurationMins: 10080,
        },
      ],
    });
    expect(codexRateLimitsToUpdate({ planType: "plus" })).toBeUndefined();
  });

  it("ignores Spark notifications so they cannot overwrite the main allowance", () => {
    expect(
      codexRateLimitsToUpdate({
        limitId: "codex_bengalfox",
        individualLimit: { remainingPercent: 99, resetsAt: 1_784_500_000 },
        primary: { usedPercent: 0, windowDurationMins: 300 },
        secondary: { usedPercent: 90, windowDurationMins: 10080 },
      }),
    ).toBeUndefined();
    expect(
      codexRateLimitsToUpdate({
        limitId: "codex",
        secondary: { usedPercent: 42, windowDurationMins: 10080 },
      })?.windows,
    ).toEqual([
      {
        id: "secondary",
        kind: "weekly",
        label: "Weekly",
        usedPercent: 42,
        windowDurationMins: 10080,
      },
    ]);
  });
});

describe("codexRateLimitsFailureMessage", () => {
  it("keeps the JSON-RPC code and nothing else from a request failure", () => {
    expect(
      codexRateLimitsFailureMessage(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage:
            "failed to fetch codex rate limits: GET https://chatgpt.com/backend-api/wham/usage failed: 401 Unauthorized",
        }),
      ),
    ).toBe("Codex could not read usage (JSON-RPC -32603).");
  });
});

describe("mergeCodexRateLimits", () => {
  it("updates monthly credit usage and retains it when omitted or reported as null", () => {
    const snapshot = {
      limitId: "codex",
      primary: { usedPercent: 12 },
      individualLimit: { remainingPercent: 99, resetsAt: 1_784_500_000 },
    };
    const individualLimit = { remainingPercent: 75, resetsAt: 1_787_000_000 };
    const changed = mergeCodexRateLimits(snapshot, { individualLimit });
    expect(changed).toEqual({ ...snapshot, individualLimit });
    expect(codexRateLimitsToUpdate(changed!)).toEqual({
      windows: [
        {
          id: "primary",
          kind: "session",
          label: "Session",
          usedPercent: 12,
          windowDurationMins: 300,
        },
        {
          id: "individual",
          kind: "monthly",
          label: "Monthly credit limit",
          usedPercent: 25,
          resetsAt: "2026-08-17T20:53:20.000Z",
        },
      ],
    });

    const retained = mergeCodexRateLimits(changed, { primary: null });
    expect(retained).toEqual({ ...snapshot, primary: null, individualLimit });
    // t3team: Business accounts send `individualLimit: null` after every turn while the cap is
    // still set, so null keeps the last known cap instead of clearing it.
    expect(mergeCodexRateLimits(retained, { individualLimit: null })).toEqual(retained);
  });

  it("ignores a model-specific snapshot so it cannot replace the main allowance", () => {
    const main = {
      limitId: "codex",
      primary: { usedPercent: 100, resetsAt: 1_800_000_000, windowDurationMins: 300 },
    };
    expect(
      mergeCodexRateLimits(main, {
        limitId: "spark",
        individualLimit: { remainingPercent: 99, resetsAt: 1_784_500_000 },
        primary: { usedPercent: 3, resetsAt: 1_800_000_000, windowDurationMins: 300 },
      }),
    ).toBe(main);
  });
});

import { codexUsageLimitResetAt } from "./codexUsageLimits.ts";

describe("codexUsageLimitResetAt", () => {
  it("waits for every exhausted window and never invents an unknown reset", () => {
    expect(
      codexUsageLimitResetAt({
        primary: { usedPercent: 100, resetsAt: 2000000000 },
        secondary: { usedPercent: 100, resetsAt: 2000100000 },
      }),
    ).toBe("2033-05-19T07:20:00.000Z");
    expect(codexUsageLimitResetAt({ primary: { usedPercent: 100 } })).toBeNull();
    expect(
      codexUsageLimitResetAt({ primary: { usedPercent: 50, resetsAt: 2000000000 } }),
    ).toBeNull();
  });
});

describe("Business monthly credit limit", () => {
  // Shape of `account/rateLimits/read` from codex-cli 0.161.0 on a capped
  // Business account, with the figures altered.
  const business = {
    limitId: "codex",
    limitName: null,
    primary: null,
    secondary: null,
    individualLimit: {
      limit: "1000",
      used: "1000.25",
      remainingPercent: 0,
      resetsAt: 1_793_491_200,
    },
    spendControlReached: true,
    planType: "business",
    rateLimitReachedType: "workspace_member_usage_limit_reached",
  } as const;
  const monthlyWindow = {
    id: "individual",
    kind: "monthly",
    label: "Monthly credit limit",
    usedPercent: 100,
    resetsAt: "2026-11-01T00:00:00.000Z",
  };
  // What `account/rateLimits/updated` sends after every turn while the cap is set.
  const turnNotification = {
    limitId: "codex",
    primary: null,
    secondary: null,
    individualLimit: null,
    spendControlReached: null,
    planType: "business",
    rateLimitReachedType: null,
  } as const;

  it("reports the credit limit from the read response", () => {
    expect(
      codexRateLimitsToLimits({
        checkedAt,
        snapshot: business,
        rateLimitsByLimitId: { codex: business },
        resetCredits: { availableCount: 0, credits: [] },
      }),
    ).toEqual({ checkedAt, windows: [monthlyWindow], resetCredits: { availableCount: 0 } });
  });

  it("reports the credit limit from an update notification", () => {
    expect(codexRateLimitsToUpdate(business)).toEqual({ windows: [monthlyWindow] });
  });

  it("emits nothing for a turn notification that does not report the cap", () => {
    expect(codexRateLimitsToUpdate(turnNotification)).toBeUndefined();
  });

  it("uses remainingPercent unless the spend control says the cap is reached", () => {
    const partial = { limit: "100", used: "30", remainingPercent: 70, resetsAt: 0 };
    expect(codexRateLimitsToUpdate({ individualLimit: partial })?.windows).toEqual([
      { id: "individual", kind: "monthly", label: "Monthly credit limit", usedPercent: 30 },
    ]);
    expect(
      codexRateLimitsToUpdate({ individualLimit: partial, spendControlReached: true })?.windows[0]
        ?.usedPercent,
    ).toBe(100);
  });

  it("shows the credit limit beside primary/secondary windows", () => {
    expect(
      codexRateLimitsToUpdate({
        primary: { usedPercent: 10, windowDurationMins: 300 },
        individualLimit: { remainingPercent: 60, resetsAt: 0 },
      })?.windows.map((window) => window.id),
    ).toEqual(["primary", "individual"]);
  });

  it("names the monthly reset in the stop message", () => {
    expect(codexUsageLimitMessage(business, "2026-10-08T00:00:00.000Z")).toBe(
      "Codex usage limit reached. The monthly limit resets in 24d. The workspace spend limit is reached: ask your workspace owner to raise it, or send the message again once the limit resets.",
    );
  });

  it("waits for the credit limit to reset before continuing", () => {
    expect(codexUsageLimitResetAt(business)).toBe("2026-11-01T00:00:00.000Z");
  });

  it("keeps the known cap when a turn notification reports it as null", () => {
    const merged = mergeCodexRateLimits(business, turnNotification);
    expect(merged?.individualLimit).toEqual(business.individualLimit);
    expect(merged?.spendControlReached).toBe(true);
    expect(codexUsageLimitResetAt(merged)).toBe("2026-11-01T00:00:00.000Z");
  });

  it("drops the reached flag when spend control says so without a cap", () => {
    const nearlyCapped = {
      ...business,
      individualLimit: { ...business.individualLimit, remainingPercent: 5 },
    };
    expect(codexRateLimitsToUpdate(nearlyCapped)?.windows[0]?.usedPercent).toBe(100);
    const lifted = mergeCodexRateLimits(nearlyCapped, { spendControlReached: false });
    expect(codexRateLimitsToUpdate(lifted!)?.windows[0]?.usedPercent).toBe(95);
    expect(codexUsageLimitResetAt(lifted)).toBeNull();
  });

  it("takes a newer cap the notification does report", () => {
    const reset = mergeCodexRateLimits(business, {
      individualLimit: { remainingPercent: 100, resetsAt: 1_796_083_200 },
    });
    expect(codexRateLimitsToUpdate(reset!)?.windows[0]?.usedPercent).toBe(0);
  });
});
