import type { FeatureFlagView } from "@t3tools/contracts";

import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { SettingResetButton } from "./settingsLayout";
import { featureFlagLockReason, featureFlagSourceChip } from "./t3team-featureFlagsSettings.logic";

export interface FeatureFlagRowProps {
  /** Already carries an optimistic value while a request is in flight. */
  readonly flag: FeatureFlagView;
  readonly preset: string | undefined;
  readonly canEdit: boolean;
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly onSetEnabled: (key: string, enabled: boolean) => void;
  readonly onReset: (key: string) => void;
}

/** Laid out like `SettingsRow`, which binds to `ServerSettings` keys and their scope
 * inheritance; a flag's layering (env > user > preset > default) is its own. */
export function FeatureFlagRow({
  flag,
  preset,
  canEdit,
  busy,
  error,
  onSetEnabled,
  onReset,
}: FeatureFlagRowProps) {
  const chip = featureFlagSourceChip(flag, preset);
  const lockReason = featureFlagLockReason(flag, canEdit);
  const descriptionId = `feature-flag-${flag.key}-description`;

  return (
    <div
      id={`feature-flag-${flag.key}`}
      data-slot="settings-row"
      className="@container/settings-row px-3 py-3 sm:px-4"
    >
      <div className="flex flex-col gap-3 @min-[32rem]/settings-row:grid @min-[32rem]/settings-row:grid-cols-[minmax(0,1fr)_auto] @min-[32rem]/settings-row:items-center @min-[32rem]/settings-row:gap-8">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-h-5 flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-medium text-foreground">{flag.label}</h3>
            {flag.scope === "pack" ? (
              <Badge variant="outline" size="sm">
                Pack
              </Badge>
            ) : null}
            {flag.source === "user" && canEdit ? (
              <SettingResetButton
                label={flag.label}
                tooltip={
                  preset === undefined ? "Back to the default" : "Back to the release preset"
                }
                disabled={busy}
                onClick={() => onReset(flag.key)}
              />
            ) : null}
          </div>
          <p
            id={descriptionId}
            className="max-w-xl text-xs leading-normal text-muted-foreground/80"
          >
            {flag.description}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <Badge variant={chip.variant} size="sm">
              {chip.label}
            </Badge>
            {flag.restartPending ? (
              <Badge variant="warning" size="sm">
                Restart needed
              </Badge>
            ) : null}
            {lockReason === null ? null : (
              <span className="text-xs text-muted-foreground">{lockReason}</span>
            )}
          </div>
          {error === undefined ? null : (
            <p role="alert" className="text-xs text-destructive-foreground">
              {error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center @min-[32rem]/settings-row:justify-end">
          <Switch
            checked={flag.enabled}
            disabled={lockReason !== null || busy}
            onCheckedChange={(checked) => onSetEnabled(flag.key, Boolean(checked))}
            aria-label={flag.label}
            aria-describedby={descriptionId}
          />
        </div>
      </div>
    </div>
  );
}
