import type { Meta, StoryObj } from "@storybook/react";
import type { EnvironmentAppearance, EnvironmentSetupProfile } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { T3TeamPackBrandImage } from "~/t3team/t3team-PackBrandImage";
import { applyT3TeamPackAppearance } from "~/t3team/t3team-packAppearance";
import { T3TeamSetupWelcomeSurface } from "~/t3team/t3team-SetupWelcomeSurface";

/**
 * Loads the theme of the workspace pack served at /pack (see
 * T3TEAM_STORYBOOK_PACK_DIR in the storybook main config) and rewrites
 * pack-relative brand asset paths to served URLs.
 */
async function loadPackAppearance(): Promise<EnvironmentAppearance | undefined> {
  const manifestResponse = await fetch("/pack/pack.json");
  if (!manifestResponse.ok) return undefined;
  const manifest = (await manifestResponse.json()) as {
    contents?: { themes?: readonly { path: string }[] };
  };
  const reference = manifest.contents?.themes?.[0];
  if (!reference) return undefined;
  const theme = (await (await fetch(`/pack/${reference.path}`)).json()) as Record<
    string,
    unknown
  > & {
    id: string;
    brand?: Record<string, string>;
  };
  const brand = Object.fromEntries(
    Object.entries(theme.brand ?? {}).map(([key, value]) => [
      key,
      value.startsWith("data:") ? value : `/pack/${value}`,
    ]),
  );
  return { ...theme, themeId: theme.id, brand } as unknown as EnvironmentAppearance;
}

/**
 * Reads the pack's real setup-profile catalog from the served `profiles.ts`
 * (single source of truth) so the wizard preview shows the actual pack roles and
 * illustrations without running the server-side activation entrypoint.
 */
async function loadPackSetupProfiles(): Promise<readonly EnvironmentSetupProfile[] | undefined> {
  const response = await fetch("/pack/profiles.ts");
  if (!response.ok) return undefined;
  const source = await response.text();
  // Seek the array literal after the `=` so the type annotation's `[]` is skipped.
  const assign = source.indexOf("=", source.indexOf("NEXI_SETUP_PROFILES"));
  const start = source.indexOf("[", assign);
  const end = source.lastIndexOf("]");
  if (assign < 0 || start < 0 || end <= start) return undefined;
  const entries = JSON.parse(source.slice(start, end + 1)) as ReadonlyArray<
    EnvironmentSetupProfile & { readonly iconFile: string }
  >;
  return entries.map(({ iconFile, ...profile }) => ({
    ...profile,
    iconDataUrl: `/pack/assets/profiles/${iconFile}`,
    ...(profile.id === "product-owner" ? { default: true } : {}),
  }));
}

function PaletteTile({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
      <span
        className="size-5 shrink-0 rounded-sm border border-border/60"
        style={{ background: value }}
      />
      <span className="truncate text-[11px] text-muted-foreground">{name}</span>
      <span className="ml-auto font-mono text-[10px] text-foreground/70">{value}</span>
    </div>
  );
}

function PackBrandingSheet({ mode }: { mode: "light" | "dark" }) {
  const [appearance, setAppearance] = useState<EnvironmentAppearance | undefined>(undefined);
  const [setupProfiles, setSetupProfiles] = useState<
    readonly EnvironmentSetupProfile[] | undefined
  >(undefined);
  useEffect(() => {
    let live = true;
    void loadPackAppearance().then((loaded) => {
      if (live) setAppearance(loaded);
    });
    void loadPackSetupProfiles().then((loaded) => {
      if (live) setSetupProfiles(loaded);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    if (appearance) applyT3TeamPackAppearance(appearance);
    return () => {
      applyT3TeamPackAppearance(undefined);
      document.documentElement.classList.remove("dark");
    };
  }, [appearance, mode]);

  if (!appearance) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        No pack theme found — run storybook with T3TEAM_STORYBOOK_PACK_DIR=&lt;pack directory&gt;.
      </div>
    );
  }
  const colors = appearance.colors[mode];
  const appName = appearance.labels?.appName ?? appearance.productName ?? appearance.name;
  // The app's global CSS pins body/#root to overflow:hidden (it owns its own scroll
  // regions), so in Storybook this full-height sheet must provide its own scroll container.
  return (
    <div className="h-screen overflow-y-auto bg-background text-foreground">
      <div className="flex h-[52px] items-center gap-2 border-b border-border bg-(--app-chrome-background) px-4">
        <T3TeamPackBrandImage brand={appearance.brand} kind="mark" className="size-5 shrink-0" />
        <span className="truncate text-sm font-semibold">{appName}</span>
      </div>

      <div className="mx-auto flex max-w-5xl flex-col gap-8 p-8">
        <div className="flex items-center justify-between gap-6">
          <T3TeamPackBrandImage
            brand={appearance.brand}
            kind="wordmark"
            alt={appearance.publisher ?? ""}
            className="h-7 w-auto"
          />
          <span className="text-xs text-muted-foreground">
            {appearance.publisher} · {mode} mode
          </span>
        </div>

        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">Deliver work, not busywork.</h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Headings use the pack display font; body copy stays on the readable sans stack. This
            paragraph verifies contrast, muted foreground and line rhythm in {mode} mode.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary action</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(colors).map(([name, value]) => (
            <PaletteTile key={name} name={name} value={value} />
          ))}
        </div>
      </div>

      <div className="flex min-h-[720px] flex-col border-t border-border">
        <T3TeamSetupWelcomeSurface onCreate={() => undefined} profilesOverride={setupProfiles} />
      </div>
    </div>
  );
}

const meta: Meta<typeof PackBrandingSheet> = {
  title: "t3team/PackBranding",
  component: PackBrandingSheet,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof PackBrandingSheet>;

export const Light: Story = { args: { mode: "light" } };
export const Dark: Story = { args: { mode: "dark" } };
