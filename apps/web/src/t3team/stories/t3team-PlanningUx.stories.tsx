import type { Decorator, Meta, StoryObj } from "@storybook/react";
import type { EnvironmentAppearance } from "@t3tools/contracts";
import { useEffect, type ReactNode } from "react";

import { THEME_APPEARANCE_MODE_STORAGE_KEY } from "~/themePalette";
import { applyT3TeamPackAppearance } from "~/t3team/t3team-packAppearance";
import { applyT3TeamSelectedTheme } from "~/t3team/t3team-packThemePaint";
import {
  LensSwitcherPrototype,
  ReadinessPrototype,
  SideAgentPrototype,
  TeamLoadLanesPrototype,
  ZoomLadderPrototype,
} from "~/t3team/planning-ux/t3team-PlanningUxPrototypes";
import fixture from "~/t3team/planning-ux/t3team-planningUxFixture.json";
import type { ProjectTicket } from "~/t3team/t3team-types";

/**
 * Planning UX exploration — clickable prototypes over a demo backlog (two sprints). PRIVACY: keys,
 * titles, people, sprint names and goals are scrambled; descriptions/links/avatars removed.
 * Theme: when Storybook serves a pack at /pack (T3TEAM_STORYBOOK_PACK_DIR), its theme is applied
 * the same way the PackBranding stories do.
 */
const tickets = fixture as unknown as readonly ProjectTicket[];

async function loadPackAppearance(): Promise<EnvironmentAppearance | undefined> {
  const manifest = await fetch("/pack/pack.json")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const ref = (manifest as { contents?: { themes?: { path: string }[] } } | null)?.contents
    ?.themes?.[0];
  if (!ref) return undefined;
  const theme = (await (await fetch(`/pack/${ref.path}`)).json()) as Record<string, unknown> & {
    id: string;
    brand?: Record<string, string>;
  };
  const brand = Object.fromEntries(
    Object.entries(theme.brand ?? {}).map(([k, v]) => [
      k,
      v.startsWith("data:") ? v : `/pack/${v}`,
    ]),
  );
  return { ...theme, themeId: theme.id, brand } as unknown as EnvironmentAppearance;
}

/** Applies the pack theme, then keeps the canvas on the story's `theme` global (the pack seeds a mode). */
function PackTheme({ dark, children }: { dark: boolean; children: ReactNode }) {
  useEffect(() => {
    let live = true;
    const root = document.documentElement;
    const enforce = () => {
      if (root.classList.contains("dark") !== dark) root.classList.toggle("dark", dark);
    };
    const observer = new MutationObserver(enforce);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    // The upstream theme engine paints the palette for the stored appearance mode, so the story's
    // theme global has to go through that preference, not only the `.dark` class.
    window.localStorage.setItem(THEME_APPEARANCE_MODE_STORAGE_KEY, dark ? "dark" : "light");
    void loadPackAppearance().then((a) => {
      if (live && a) {
        applyT3TeamPackAppearance(a);
        const themeId = root.dataset.themeId;
        if (themeId) applyT3TeamSelectedTheme(themeId);
      }
      enforce();
    });
    enforce();
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [dark]);
  return <>{children}</>;
}
const withPackTheme: Decorator = (Story, context) => (
  <PackTheme dark={context.globals.theme === "dark"}>
    <Story />
  </PackTheme>
);

const meta = {
  title: "T3Team/Planning UX (exploration)",
  decorators: [withPackTheme],
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type S = StoryObj<typeof meta>;

export const LensSwitcher: S = { render: () => <LensSwitcherPrototype tickets={tickets} /> };
export const LensSwitcherAsLead: S = {
  render: () => <LensSwitcherPrototype tickets={tickets} initialProfile="delivery-lead" />,
};
export const StoryReadiness: S = { render: () => <ReadinessPrototype tickets={tickets} /> };
export const TeamLoadAndSprintLanes: S = {
  render: () => <TeamLoadLanesPrototype tickets={tickets} />,
};
export const ZoomLadder: S = { render: () => <ZoomLadderPrototype tickets={tickets} /> };
export const SideAgent: S = { render: () => <SideAgentPrototype tickets={tickets} /> };
