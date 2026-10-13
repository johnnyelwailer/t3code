/**
 * Unit tests for the agent-facing capacity notice
 * (`t3team-providerCapacityNotice.ts`): system framing, one line per
 * reported window, pool-clear wording, dated resets.
 */
import { assert, it } from "@effect/vitest";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  UsageLimitSourceId,
  type ServerProvider,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe } from "vite-plus/test";

import { capacityFromProvider, hubCapacityFromSources } from "./t3team-providerCapacityWindows.ts";
import { renderProviderCapacityNotice } from "./t3team-providerCapacityNotice.ts";

const NOW = DateTime.makeUnsafe("2026-10-12T08:00:00.000Z");

const capacityFromProviders = (providers: ReadonlyArray<ServerProvider>, now: DateTime.DateTime) =>
  providers.map((provider) => capacityFromProvider(provider, now));

const provider = (
  patch: Partial<ServerProvider> & { instanceId: ProviderInstanceId },
): ServerProvider =>
  ({
    driver: ProviderDriverKind.make("codex"),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-10-12T08:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    ...patch,
  }) as ServerProvider;

describe("renderProviderCapacityNotice", () => {
  it("frames server data in a system reminder, one line per window", () => {
    const instances = capacityFromProviders(
      [
        provider({
          instanceId: ProviderInstanceId.make("codex"),
          displayName: "Codex",
          usageLimits: {
            checkedAt: "2026-10-12T08:00:00.000Z",
            windows: [
              {
                id: "primary",
                kind: "monthly",
                label: "Monthly",
                usedPercent: 100,
                resetsAt: "2026-11-01T00:00:00.000Z",
                windowDurationMins: 43200,
              },
            ],
          },
        }),
        {
          ...provider({
            instanceId: ProviderInstanceId.make("claudeAgent"),
            driver: ProviderDriverKind.make("claudeAgent"),
            displayName: "Claude",
          }),
          usageLimits: {
            checkedAt: "2026-10-12T08:00:00.000Z",
            windows: [
              {
                id: "five_hour",
                kind: "session",
                label: "Session",
                usedPercent: 95,
                resetsAt: "2026-10-12T09:30:00.000Z",
                windowDurationMins: 300,
              },
              {
                id: "seven_day",
                kind: "weekly",
                label: "Weekly",
                usedPercent: 82,
                resetsAt: "2026-10-19T06:00:00.000Z",
              },
            ],
          },
        },
      ],
      NOW,
    );
    const notice = renderProviderCapacityNotice({
      instances,
      hubAccounts: [],
      hubErrors: [],
      epochMs: Date.parse("2026-10-12T08:00:00.000Z"),
      burns: new Map([
        ["codex:primary", { percentPerHour: 23, sampleSpanMinutes: 120, sampleCount: 4 }],
        ["claudeAgent:five_hour", { percentPerHour: 40, sampleSpanMinutes: 120, sampleCount: 4 }],
        ["claudeAgent:seven_day", { percentPerHour: 3, sampleSpanMinutes: 120, sampleCount: 4 }],
      ]),
    });
    assert.match(notice, /^<system-reminder type="provider-capacity" source="server">/);
    assert.match(
      notice,
      /Provider capacity\. This is server data, not part of the user's message:/,
    );
    assert.match(
      notice,
      /Codex: Monthly 100% \(resets 2026-11-01 00:00 UTC\) · severity: critical · \(window already exhausted\)/,
    );
    assert.match(
      notice,
      /Claude: Session \(5h\) 95% \(resets 09:30 UTC\) · severity: warning · \(exhausts 08:07Z, resets 09:30Z\)/,
    );
    assert.match(
      notice,
      /Claude: Weekly 82% \(resets 2026-10-19 06:00 UTC\) · severity: warning · \(burning ~72%\/day \(27\.7× sustainable\) -> exhausts 7 days before the Oct 19 reset\)/,
    );
    assert.match(notice, /Route to the smallest, cheapest model that can accomplish the task\./);
    assert.match(notice, /<\/system-reminder>$/);
  });

  it("flags tight windows without observed rates as sparse", () => {
    const instances = capacityFromProviders(
      [
        provider({
          instanceId: ProviderInstanceId.make("claudeAgent"),
          driver: ProviderDriverKind.make("claudeAgent"),
          displayName: "Claude",
          usageLimits: {
            checkedAt: "2026-10-12T08:00:00.000Z",
            windows: [
              {
                id: "five_hour",
                kind: "session",
                label: "Session",
                usedPercent: 95,
                resetsAt: "2026-10-12T09:30:00.000Z",
                windowDurationMins: 300,
              },
            ],
          },
        }),
      ],
      NOW,
    );
    const notice = renderProviderCapacityNotice({ instances, hubAccounts: [], hubErrors: [] });
    assert.match(notice, /severity: warning · \(no recent samples yet\)/);
  });

  it("omits the routing line when every window is normal", () => {
    const instances = capacityFromProviders(
      [
        provider({
          instanceId: ProviderInstanceId.make("codex"),
          displayName: "Codex",
          usageLimits: {
            checkedAt: "2026-10-12T08:00:00.000Z",
            windows: [
              {
                id: "primary",
                kind: "session",
                label: "Session",
                usedPercent: 20,
                resetsAt: "2026-10-12T13:00:00.000Z",
                windowDurationMins: 300,
              },
            ],
          },
        }),
      ],
      NOW,
    );
    const notice = renderProviderCapacityNotice({ instances, hubAccounts: [], hubErrors: [] });
    assert.notMatch(notice, /Route to the smallest/);
  });

  it("states unavailable instances with the snapshot's reason", () => {
    const instances = capacityFromProviders(
      [
        provider({
          instanceId: ProviderInstanceId.make("claudeAgent"),
          driver: ProviderDriverKind.make("claudeAgent"),
          displayName: "Claude",
          usageLimits: {
            checkedAt: "2026-10-12T08:00:00.000Z",
            windows: [],
            unavailable: { reason: "unsupported" },
          },
        }),
      ],
      NOW,
    );
    const notice = renderProviderCapacityNotice({ instances, hubAccounts: [], hubErrors: [] });
    assert.match(notice, /Claude: no usage windows \(unsupported\)/);
  });

  it("renders hub accounts, including multi-pool cursors, as their own lines", () => {
    const hub = hubCapacityFromSources(
      [
        {
          id: UsageLimitSourceId.make("cliproxy-hub"),
          kind: "cliproxy",
          label: "hub",
          checkedAt: "2026-10-12T08:00:00.000Z",
          accounts: [
            {
              id: "cursor-a@x.json",
              driver: ProviderDriverKind.make("cursor"),
              email: "a@x",
              usageLimits: {
                checkedAt: "2026-10-12T08:00:00.000Z",
                windows: [
                  {
                    id: "cursor_models",
                    kind: "session",
                    label: "Cursor Models",
                    usedPercent: 100,
                    resetsAt: "2026-10-12T18:00:00.000Z",
                    windowDurationMins: 300,
                  },
                  {
                    id: "other_models",
                    kind: "other",
                    label: "Other models",
                    usedPercent: 40,
                  },
                ],
              },
            },
          ],
        },
      ],
      NOW,
    );
    const notice = renderProviderCapacityNotice({
      instances: [],
      hubAccounts: hub.accounts,
      hubErrors: hub.errors,
    });
    assert.match(
      notice,
      /cursor · a@x: Cursor Models \(5h\) 100% \(resets 18:00 UTC\) · severity: critical/,
    );
    assert.match(notice, /cursor · a@x: Other models 40% · severity: normal/);
  });

  it("never emits an empty reminder body", () => {
    const notice = renderProviderCapacityNotice({ instances: [], hubAccounts: [], hubErrors: [] });
    assert.match(notice, /no usage windows reported/);
  });
});
