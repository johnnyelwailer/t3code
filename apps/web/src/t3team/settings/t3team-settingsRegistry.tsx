/**
 * The fork's settings surface as registered data: the one section it adds to the settings nav
 * (Connected Tools; the Features page is upstream's Labs, labelled Features there) and the rows
 * it places on the panels (`t3team-settingsForkRows.tsx`). The hot files render from these
 * registrations; search picks the items up through `useT3TeamSettingsSearchItems`.
 */
import type { ComponentType } from "react";
import { Link2Icon } from "lucide-react";
import type { SettingsPath, SettingsSearchItem } from "../../components/settings/settingsSearch";
import { SETTINGS_NAV_GROUPS } from "../../components/settings/settingsSearch";
import { useConnectedToolsSettingsVisible } from "../../components/settings/t3team-connectedToolsSettingsVisible";
import { useFeatureFlag } from "../t3team-useFeatureFlag";
import {
  T3TEAM_SETTINGS_ROWS,
  type T3TeamSettingsRowProps,
  type T3TeamSettingsRowSlot,
} from "./t3team-settingsForkRows";

/** The section this fork adds on top of upstream's settings pages. */
export type T3TeamSettingsSectionPath = "/settings/connected-tools";
export type SettingsSectionPath = SettingsPath | T3TeamSettingsSectionPath;

export interface T3TeamSettingsSection {
  readonly path: T3TeamSettingsSectionPath;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
  /** The upstream section this fork section follows in the nav. */
  readonly after: SettingsPath;
}

export const T3TEAM_SETTINGS_SECTIONS: readonly T3TeamSettingsSection[] = [
  {
    path: "/settings/connected-tools",
    label: "Connected Tools",
    icon: Link2Icon,
    after: "/settings/providers",
  },
];

/** Icon lookup by section path; upstream's own record covers every other path. */
export const T3TEAM_SETTINGS_SECTION_ICONS: Readonly<
  Record<string, ComponentType<{ className?: string }>>
> = {
  "/settings/connected-tools": Link2Icon,
};

export function t3teamSettingsSection(to: string): T3TeamSettingsSection | null {
  return T3TEAM_SETTINGS_SECTIONS.find((section) => section.path === to) ?? null;
}

export function t3teamSettingsSectionLabel(to: string): string | null {
  return t3teamSettingsSection(to)?.label ?? null;
}

/**
 * Upstream's nav groups with each fork section spliced in after the section it follows.
 * Visibility is applied by `useT3TeamSettingsNavGroups`, which owns the hooks.
 */
export function t3teamSettingsNavGroups(): ReadonlyArray<{
  readonly heading: string | null;
  readonly paths: ReadonlyArray<SettingsSectionPath>;
}> {
  return SETTINGS_NAV_GROUPS.map((group) => ({
    heading: group.heading,
    paths: group.paths.flatMap((to): ReadonlyArray<SettingsSectionPath> => {
      const forkTo = T3TEAM_SETTINGS_SECTIONS.find((section) => section.after === to)?.path;
      return forkTo === undefined ? [to] : [to, forkTo];
    }),
  }));
}

/** The nav groups with fork sections filtered by their visibility hooks. */
export function useT3TeamSettingsNavGroups() {
  const connectedToolsVisible = useConnectedToolsSettingsVisible();
  return t3teamSettingsNavGroups()
    .map((group) => ({
      heading: group.heading,
      paths: group.paths.filter(
        (to) => to !== "/settings/connected-tools" || connectedToolsVisible,
      ),
    }))
    .filter((group) => group.paths.length > 0);
}

/** The fork rows that render inside a panel slot, in registration order. */
export function t3teamSettingsRows(slot: T3TeamSettingsRowSlot, props?: T3TeamSettingsRowProps) {
  // Rows that ignore the props still type as components taking them.
  const rowProps: T3TeamSettingsRowProps = props ?? ({} as T3TeamSettingsRowProps);
  return T3TEAM_SETTINGS_ROWS.filter((row) => row.slot === slot).map((row) => (
    <row.component key={row.anchorId} {...rowProps} />
  ));
}

/** Voice sub-rows: anchored items for the rows `t3team-VoiceSettings` renders. */
const VOICE_SEARCH_ITEMS: ReadonlyArray<SettingsSearchItem> = [
  {
    id: "voice-hotkey",
    title: "Voice shortcut",
    to: "/settings/general",
    desktopOnly: true,
    searchTerms: ["talk dictate microphone hotkey chord global keys whisper"],
  },
  {
    id: "voice-model",
    title: "Voice model",
    to: "/settings/general",
    desktopOnly: true,
    searchTerms: ["whisper transcription dictation speech download large-v3-turbo"],
  },
  {
    id: "voice-model-path",
    title: "Voice model file",
    to: "/settings/general",
    desktopOnly: true,
    searchTerms: ["whisper ggml bin path transcription dictation"],
  },
  {
    id: "voice-language",
    title: "Voice language",
    to: "/settings/general",
    desktopOnly: true,
    searchTerms: ["whisper transcription dictation speech locale auto detect"],
  },
  {
    id: "voice-languages",
    title: "Voice language list",
    to: "/settings/general",
    desktopOnly: true,
    searchTerms: ["whisper dictation speech language picker options german english"],
  },
  {
    id: "voice-silence",
    title: "Voice silence",
    to: "/settings/general",
    desktopOnly: true,
    searchTerms: ["dictation auto commit stop pause silence seconds end recording"],
  },
];

/** Section-level fork items; the Features page anchors into upstream's Labs page. */
const SECTION_SEARCH_ITEMS: ReadonlyArray<SettingsSearchItem> = [
  {
    id: "connected-tools",
    title: "Connected tools",
    to: "/settings/connected-tools" as SettingsPath,
    sectionLabel: "Connected Tools",
    searchTerms: ["jira atlassian tool auth sign in connections integrations"],
  },
  {
    id: "nexi-feature-switches",
    title: "Nexi feature switches",
    to: "/settings/labs",
    targetId: "features-nexi",
    searchTerms: ["feature flag switch nexi work toggles overrides preset"],
  },
];

/**
 * Every fork settings-search item. The panel rows come from their registrations; `sectionLabel`
 * carries the fork section names upstream's `SETTINGS_SECTION_LABELS` does not know.
 */
export const T3TEAM_SETTINGS_SEARCH_ITEMS: ReadonlyArray<SettingsSearchItem> = [
  ...T3TEAM_SETTINGS_ROWS.map((row): SettingsSearchItem => ({
    id: row.anchorId,
    title: row.label,
    to: row.to,
    ...(row.searchTerms.length > 0 ? { searchTerms: row.searchTerms } : {}),
  })),
  ...VOICE_SEARCH_ITEMS,
  ...SECTION_SEARCH_ITEMS,
];

/** The fork items whose availability a hook decides (flag-gated sections). */
export function useT3TeamSettingsSearchItems(): ReadonlyArray<SettingsSearchItem> {
  const featuresPageEnabled = useFeatureFlag("SETTINGS_FEATURES_PAGE");
  const connectedToolsVisible = useConnectedToolsSettingsVisible();
  return T3TEAM_SETTINGS_SEARCH_ITEMS.filter((item) => {
    if (item.id === "connected-tools") return connectedToolsVisible;
    if (item.id === "nexi-feature-switches") return featuresPageEnabled;
    return true;
  });
}
