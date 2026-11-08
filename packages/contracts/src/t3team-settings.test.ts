import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  ClientSettingsSchema,
  DEFAULT_CLIENT_SETTINGS,
  DEFAULT_SERVER_SETTINGS,
  ServerSettings,
  ServerSettingsPatch,
} from "./settings.ts";
import {
  migrateLegacyT3TeamClientSettingsJson,
  migrateLegacyT3TeamServerSettingsJson,
} from "./t3team-settings.ts";

const decodeServerSettings = Schema.decodeUnknownSync(ServerSettings);
const decodeServerSettingsPatch = Schema.decodeUnknownSync(ServerSettingsPatch);
const decodeClientSettings = Schema.decodeUnknownSync(ClientSettingsSchema);
const encodeClientSettings = Schema.encodeSync(ClientSettingsSchema);

const OLD_SERVER_PAYLOAD = {
  t3teamActivityLabelsEnabled: false,
  t3teamProjectScopePillsEnabled: false,
  t3teamProjectSourceIconIngestEnabled: true,
  t3teamStoredSidebarPinsJson: '  [{"id":"pin-1"}]  ',
  t3teamStoredSidecarCompositionJson: '  {"sections":[]}  ',
  // An unrelated upstream key proves the migration leaves other fields alone.
  autoResumeLimitedThreads: false,
};

const OLD_CLIENT_PAYLOAD = {
  t3teamStoredSidebarNavPreferencesJson: '  {"p":"prefs"}  ',
  t3teamStoredProjectsJson: '  [{"id":"p1"}]  ',
  t3teamStoredSidebarPinsJson: '  [{"id":"pin-1"}]  ',
  t3teamStoredSidecarCompositionJson: '  {"sections":[]}  ',
  t3teamStoredThreadsJson: '  [{"id":"t1"}]  ',
  wordWrap: false,
};

describe("migrateLegacyT3TeamServerSettingsJson", () => {
  it("loads a persisted payload in the old shape with every fork value intact", () => {
    const settings = decodeServerSettings(
      migrateLegacyT3TeamServerSettingsJson(OLD_SERVER_PAYLOAD),
    );
    expect(settings.t3team.activityLabels).toBe(false);
    expect(settings.t3team.projectScopePills).toBe(false);
    expect(settings.t3team.projectSourceIconIngest).toBe(true);
    expect(settings.t3team.storedSidebarPinsJson).toBe('[{"id":"pin-1"}]');
    expect(settings.t3team.storedSidecarCompositionJson).toBe('{"sections":[]}');
    expect(settings.autoResumeLimitedThreads).toBe(false);
  });

  it("keeps decoding defaults when the old keys are absent", () => {
    const settings = decodeServerSettings(migrateLegacyT3TeamServerSettingsJson({}));
    expect(settings.t3team.activityLabels).toBe(DEFAULT_SERVER_SETTINGS.t3team.activityLabels);
    expect(settings.t3team.projectScopePills).toBe(
      DEFAULT_SERVER_SETTINGS.t3team.projectScopePills,
    );
    expect(settings.t3team.projectSourceIconIngest).toBe(
      DEFAULT_SERVER_SETTINGS.t3team.projectSourceIconIngest,
    );
    expect(settings.t3team.storedSidebarPinsJson).toBeUndefined();
  });

  it("lets an explicit t3team value win over the legacy key", () => {
    const settings = decodeServerSettings(
      migrateLegacyT3TeamServerSettingsJson({
        t3teamActivityLabelsEnabled: false,
        t3team: { activityLabels: true },
      }),
    );
    expect(settings.t3team.activityLabels).toBe(true);
  });

  it("is idempotent and returns payloads without legacy keys untouched", () => {
    const once = migrateLegacyT3TeamServerSettingsJson(OLD_SERVER_PAYLOAD);
    expect(migrateLegacyT3TeamServerSettingsJson(once)).toBe(once);
    const modern = { t3team: { activityLabels: false } };
    expect(migrateLegacyT3TeamServerSettingsJson(modern)).toBe(modern);
    expect(migrateLegacyT3TeamServerSettingsJson(null)).toBeNull();
    expect(migrateLegacyT3TeamServerSettingsJson([1])).toEqual([1]);
  });
});

describe("migrateLegacyT3TeamClientSettingsJson", () => {
  it("loads a persisted payload in the old shape with every fork value intact", () => {
    const settings = decodeClientSettings(
      migrateLegacyT3TeamClientSettingsJson(OLD_CLIENT_PAYLOAD),
    );
    expect(settings.t3team.storedSidebarNavPreferencesJson).toBe('{"p":"prefs"}');
    expect(settings.t3team.storedProjectsJson).toBe('[{"id":"p1"}]');
    expect(settings.t3team.storedSidebarPinsJson).toBe('[{"id":"pin-1"}]');
    expect(settings.t3team.storedSidecarCompositionJson).toBe('{"sections":[]}');
    expect(settings.t3team.storedThreadsJson).toBe('[{"id":"t1"}]');
    expect(settings.wordWrap).toBe(false);
  });

  it("round-trips a migrated payload through the new schema without old keys", () => {
    const settings = decodeClientSettings(
      migrateLegacyT3TeamClientSettingsJson(OLD_CLIENT_PAYLOAD),
    );
    const encoded = encodeClientSettings(settings);
    expect((encoded as Record<string, unknown>).t3teamStoredProjectsJson).toBeUndefined();
    // Re-decoding the re-encoded value keeps the stored value under the new key.
    expect(decodeClientSettings(encoded).t3team.storedProjectsJson).toBe('[{"id":"p1"}]');
    expect(decodeClientSettings(encodeClientSettings(DEFAULT_CLIENT_SETTINGS))).toEqual(
      DEFAULT_CLIENT_SETTINGS,
    );
  });
});

describe("legacy and new shapes coexist on the wire", () => {
  it("patches carry only the new namespace; a legacy payload merged after a patch keeps both values consistent", () => {
    const patch = decodeServerSettingsPatch({ t3team: { activityLabels: false } });
    expect(JSON.stringify(patch).includes("t3teamActivityLabelsEnabled")).toBe(false);

    // Server-side apply is a deep merge of the patch into the migrated current settings.
    const current = decodeServerSettings(migrateLegacyT3TeamServerSettingsJson({}));
    const next = { ...current, t3team: { ...current.t3team, ...patch.t3team } };
    expect(next.t3team.activityLabels).toBe(false);
    expect(next.t3team.projectScopePills).toBe(true);
  });
});
