/**
 * The fork rows on Appearance → Interface and on the Features page (upstream's Labs): project
 * workspace, the My Work digest beta, the animated companion and Nexi's feature switches. Every
 * Labs/Features entry and every new flag registers here or in `t3team-settingsForkRows.tsx`,
 * never as inline JSX in a settings panel.
 */
import { T3TeamBetaSettings } from "../../components/settings/t3team-BetaSettings";
import { T3TeamCompanionSetting } from "../../components/settings/t3team-CompanionSetting";
import {
  T3TeamNexiFeatureSections,
  T3TeamUpstreamFeaturesHeading,
} from "../../components/settings/t3team-FeatureOriginSections";
import { T3TeamProjectSetupSetting } from "../../components/settings/t3team-ProjectSetupSetting";
import type { T3TeamSettingsRow } from "./t3team-settingsForkRows";

/** Settings → Features: Nexi's switches on top, then the heading over T3 Code's Beta and Legacy. */
export function NexiFeaturesRow() {
  return (
    <>
      <T3TeamNexiFeatureSections />
      <T3TeamUpstreamFeaturesHeading />
    </>
  );
}

export function ProjectSetupRow() {
  return <T3TeamProjectSetupSetting />;
}

export function DigestBetaRow() {
  return <T3TeamBetaSettings />;
}

/** Nexi's 3D companion: off by default, shown only to viewers who turn it on here. */
export function CompanionRow() {
  return <T3TeamCompanionSetting />;
}

export const T3TEAM_INTERFACE_AND_LABS_ROWS: readonly T3TeamSettingsRow[] = [
  {
    slot: "interface",
    key: "projectSetup",
    anchorId: "project-workspace",
    targetId: "appearance-interface",
    to: "/settings/appearance",
    label: "Project workspace",
    searchTerms: ["default project setup profile reopen initial setup wizard welcome"],
    component: ProjectSetupRow,
  },
  {
    slot: "interface",
    key: "t3team:beta-flags",
    anchorId: "mywork-digest-beta",
    targetId: "appearance-interface",
    to: "/settings/appearance",
    label: "My Work digest beta",
    searchTerms: ["digest variants burndown lens row navigation agent dots experimental"],
    component: DigestBetaRow,
  },
  {
    slot: "interface",
    key: "t3team:companion-enabled",
    anchorId: "t3team-companion",
    to: "/settings/appearance",
    label: "Animated companion",
    searchTerms: ["3d nexi pet character mascot webgl animation"],
    component: CompanionRow,
  },
  {
    slot: "labs",
    key: "featureFlags",
    anchorId: "nexi-feature-switches",
    targetId: "features-nexi",
    to: "/settings/labs",
    label: "Nexi feature switches",
    searchTerms: ["feature flag switch nexi work toggles overrides preset"],
    component: NexiFeaturesRow,
  },
];
