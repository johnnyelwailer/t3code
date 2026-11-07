/**
 * Settings → Features is upstream's Labs page with Nexi's switches on top. These two slots sit in
 * `LabsSettingsPanel`: Nexi's flag groups first, then a heading that marks Beta and Legacy below
 * as T3 Code's. Both hide while `SETTINGS_FEATURES_PAGE` is off, leaving upstream's page as is.
 */
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";
import { FeatureFlagsSettings } from "./t3team-FeatureFlagsSettings";
import { PressureThresholdSettings } from "./t3team-PressureThresholdSettings";
import { useFeatureFlagsSettings } from "./t3team-useFeatureFlagsSettings";

function FeatureOriginHeading({
  id,
  title,
  description,
}: {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <header id={id} className="space-y-1 border-b border-border/60 px-3 pb-2 sm:px-4">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <p className="max-w-xl text-xs text-muted-foreground/80">{description}</p>
    </header>
  );
}

function NexiFeatureSections() {
  return (
    <>
      <FeatureOriginHeading
        id="features-nexi"
        title="Nexi Work"
        description="Switches Nexi adds to T3 Code. An env override wins over your choice, your choice over the release preset, the preset over the default."
      />
      <FeatureFlagsSettings controller={useFeatureFlagsSettings()} />
      <PressureThresholdSettings />
    </>
  );
}

export function T3TeamNexiFeatureSections() {
  return useFeatureFlag("SETTINGS_FEATURES_PAGE") ? <NexiFeatureSections /> : null;
}

export function T3TeamUpstreamFeaturesHeading() {
  return useFeatureFlag("SETTINGS_FEATURES_PAGE") ? (
    <FeatureOriginHeading
      id="features-t3code"
      title="T3 Code"
      description="Beta and Legacy come from T3 Code, the app Nexi Work builds on. Beta is still settling in; Legacy keeps older behavior for people who rely on it."
    />
  ) : null;
}
