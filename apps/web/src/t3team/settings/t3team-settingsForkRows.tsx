/**
 * The fork's settings rows as registered components. Each row keeps its exact SettingsRow
 * markup from the panels; `t3team-settingsRegistry.tsx` wires them into the panels, the search
 * index and the anchor ids.
 */
import { DEFAULT_UNIFIED_SETTINGS, type UnifiedSettings } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import type { ComponentType } from "react";

import { SettingResetButton, SettingsRow } from "../../components/settings/settingsLayout";
import { searchableSetting } from "../../components/settings/settingsSearch";
import { AgentInstructionsSettingRow } from "../../components/settings/t3team-AgentInstructionsSetting";
import { T3TeamVoiceSettings } from "../../components/settings/t3team-VoiceSettings";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";
import type { ScopedSettingsPatch } from "../../components/settings/scopedSettings";
import { T3TeamAboutLicensesDescription } from "../t3team-AboutLicensesDescription";
import { T3TEAM_INTERFACE_AND_LABS_ROWS } from "./t3team-settingsInterfaceRows";

/** What a fork row needs from its host panel: the merged settings and the scoped writer. */
export interface T3TeamSettingsRowProps {
  readonly settings: UnifiedSettings;
  readonly updateSettings: (patch: ScopedSettingsPatch) => void;
}
/** Where a fork row renders inside its host panel. */
export type T3TeamSettingsRowSlot = "agent" | "voice" | "display" | "interface" | "labs" | "legal";

export interface T3TeamSettingsRow {
  readonly slot: T3TeamSettingsRowSlot;
  /** The settings key the row writes, for the registry's documentation. */
  readonly key: string;
  /** The row's settings-search id; also its DOM anchor unless `targetId` names another. */
  readonly anchorId: string;
  /** The DOM anchor search scrolls to when the row has no anchor of its own. */
  readonly targetId?: string;
  /** The page the row lives on, as a settings-search target. */
  readonly to: "/settings/general" | "/settings/appearance" | "/settings/labs" | "/settings/about";
  readonly label: string;
  readonly searchTerms: readonly string[];
  readonly component: ComponentType<T3TeamSettingsRowProps>;
}

export function AgentInstructionsRow({ settings, updateSettings }: T3TeamSettingsRowProps) {
  return (
    <AgentInstructionsSettingRow
      value={settings.agentInstructions}
      onChange={(agentInstructions) => updateSettings({ agentInstructions })}
    />
  );
}

export function VoiceSettingsRow({ settings, updateSettings }: T3TeamSettingsRowProps) {
  return (
    <T3TeamVoiceSettings
      transcriber={settings.voice.transcriber}
      onTranscriberChange={(transcriber) => updateSettings({ voice: { transcriber } })}
    />
  );
}

export function ActivityLabelsRow({ settings, updateSettings }: T3TeamSettingsRowProps) {
  const defaultOn = DEFAULT_UNIFIED_SETTINGS.t3team.activityLabels;
  return (
    <SettingsRow
      {...searchableSetting("live-activity-labels")}
      description="Show a short AI-generated label for what active threads are working on instead of the static “Working” text. Generation is tiny, debounced, and non-thinking; labels clear when a thread goes idle."
      resetAction={
        settings.t3team.activityLabels !== defaultOn ? (
          <SettingResetButton
            label="live activity labels"
            onClick={() => updateSettings({ t3team: { activityLabels: defaultOn } })}
          />
        ) : null
      }
      control={
        <Switch
          checked={settings.t3team.activityLabels}
          onCheckedChange={(checked) => updateSettings({ t3team: { activityLabels: checked } })}
          aria-label="Live activity labels"
        />
      }
    />
  );
}

export function ProjectScopePillsRow({ settings, updateSettings }: T3TeamSettingsRowProps) {
  const defaultOn = DEFAULT_UNIFIED_SETTINGS.t3team.projectScopePills;
  return (
    <SettingsRow
      {...searchableSetting("project-scope-pills")}
      description="Replace the sidebar's project dropdown with one-click pills for your recent projects. The pull request list follows the selected project, including a work-source project's linked repositories."
      resetAction={
        settings.t3team.projectScopePills !== defaultOn ? (
          <SettingResetButton
            label="project scope pills"
            onClick={() => updateSettings({ t3team: { projectScopePills: defaultOn } })}
          />
        ) : null
      }
      control={
        <Switch
          checked={settings.t3team.projectScopePills}
          onCheckedChange={(checked) => updateSettings({ t3team: { projectScopePills: checked } })}
          aria-label="Project scope pills"
        />
      }
    />
  );
}

export function PrivacySecurityRow() {
  if (typeof navigator === "undefined") return null;
  if (!/Mac/i.test(navigator.platform) && !/Mac OS X/i.test(navigator.userAgent)) return null;
  const open = () => {
    const opener = window.desktopBridge?.openPrivacySecurity;
    if (opener) void opener();
  };
  return (
    <SettingsRow
      {...searchableSetting("privacy-security")}
      description="Opens System Settings → Privacy & Security so you can allow Nexi Work."
      control={
        <Button size="sm" variant="outline" onClick={open}>
          Open Privacy & Security
        </Button>
      }
    />
  );
}

export function AboutLicensesRow() {
  return (
    <SettingsRow
      {...searchableSetting("open-source-licenses")}
      description={<T3TeamAboutLicensesDescription />}
      control={
        <Button render={<Link to="/settings/open-source-licenses" />} size="sm" variant="outline">
          View licenses
        </Button>
      }
    />
  );
}

export const T3TEAM_SETTINGS_ROWS: readonly T3TeamSettingsRow[] = [
  {
    slot: "agent",
    key: "agentInstructions",
    anchorId: "agent-personality",
    to: "/settings/general",
    label: "Agent personality / instructions",
    searchTerms: [],
    component: AgentInstructionsRow,
  },
  {
    slot: "voice",
    key: "voice",
    anchorId: "voice-model",
    to: "/settings/general",
    label: "Voice model",
    searchTerms: ["whisper transcription dictation speech download large-v3-turbo"],
    component: VoiceSettingsRow,
  },
  {
    slot: "display",
    key: "t3team.activityLabels",
    anchorId: "live-activity-labels",
    to: "/settings/general",
    label: "Live activity labels",
    searchTerms: [],
    component: ActivityLabelsRow,
  },
  {
    slot: "display",
    key: "t3team.projectScopePills",
    anchorId: "project-scope-pills",
    to: "/settings/general",
    label: "Project scope pills",
    searchTerms: ["sidebar recent projects filter pull requests scope experimental"],
    component: ProjectScopePillsRow,
  },
  ...T3TEAM_INTERFACE_AND_LABS_ROWS,
  {
    slot: "legal",
    key: "openSourceLicenses",
    anchorId: "open-source-licenses",
    to: "/settings/about",
    label: "Open source licenses",
    searchTerms: [],
    component: AboutLicensesRow,
  },
  {
    slot: "legal",
    key: "privacySecurity",
    anchorId: "privacy-security",
    to: "/settings/about",
    label: "Privacy & Security",
    searchTerms: ["system settings gatekeeper open anyway microphone screen recording"],
    component: PrivacySecurityRow,
  },
];
