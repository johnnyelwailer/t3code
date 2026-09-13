import type { Meta, StoryObj } from "@storybook/react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect } from "react";

import { useTheme } from "~/hooks/useTheme";
import { T3TeamNexploreStripArt } from "~/t3team/t3team-NexploreStageArt";

/**
 * The strip measures its host header and drops the orb into the widest run free of content, so the
 * only way to judge it is against real header content at several widths. Each row below is a
 * faithful stand-in for the sidebar header: same 52px height, same brand inset, same 32px trailing
 * toggle — so the measurement sees the same boxes it sees in the app.
 */
const meta = {
  title: "t3team/NexploreStageArt",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;

/** Mirrors `sidebar-stage-backdrop`: 80px tall, absolutely placed, masked so it fades downward. */
function Backdrop() {
  return (
    <div
      aria-hidden
      className="sidebar-stage-backdrop pointer-events-none absolute inset-x-0 top-0 z-0 h-20 select-none overflow-hidden"
    >
      <T3TeamNexploreStripArt />
    </div>
  );
}

function HeaderRow({
  width,
  brandInset,
  label,
  style,
  trafficLights = false,
}: {
  width: number;
  brandInset: number;
  label: string;
  style?: CSSProperties;
  trafficLights?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-mono text-[10px] text-neutral-500">{label}</div>
      <div
        className="relative flex h-[52px] shrink-0 flex-row items-center overflow-visible rounded-md"
        style={style ? { width, ...style } : { width }}
      >
        <Backdrop />
        {/* Pack background layer — `t3team-ProjectSidebarHeader` renders this above the stage
            backdrop (absolute inset-0, pointer-events-none, transparent by default). The stand-in
            must keep it: the measurement has to ignore decorative layers or the whole header reads
            as occupied and the orb sinks off the strip (regression 2026-09-13). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{ background: "transparent" }}
        />
        {/* Brand: inset differs between macOS desktop (traffic-light reserve) and everywhere else. */}
        <div
          className="relative z-10 flex h-7 items-center gap-1.5"
          style={{ marginLeft: brandInset }}
        >
          <span className="text-sm font-semibold text-white">nexi</span>
          <span className="truncate text-sm font-semibold text-white">Work</span>
        </div>
        {/* Trailing toggle: anchored right, so it slides inward as the sidebar narrows. */}
        <div className="relative z-10 ml-auto pr-2">
          <div className="size-8 rounded-md bg-white/25" />
        </div>
        {trafficLights ? (
          <div aria-hidden className="pointer-events-none absolute left-[13px] top-[13px] z-20 flex gap-2">
            <span className="size-3 rounded-full" style={{ background: "#ff5f57" }} />
            <span className="size-3 rounded-full" style={{ background: "#febc2e" }} />
            <span className="size-3 rounded-full" style={{ background: "#28c840" }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Off-mac (web, Windows, and macOS fullscreen): brand hugs the left edge, so the widest free run is
 * between brand and toggle. As the width drops that run shrinks and the orb slides DOWN out of the
 * content band instead of shrinking or colliding.
 */
export const WidthsOffMac: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-16 rounded-lg bg-neutral-900 p-6">
      {/* 256px is the real minimum (`SIDEBAR_RESIZE_DEFAULT_MIN_WIDTH`); 220 and 190 are below it
          and included only to show where the descent takes over. */}
      {[420, 340, 288, 256, 220, 190].map((width) => (
        <HeaderRow key={width} width={width} brandInset={18} label={`${width}px · off-mac`} />
      ))}
    </div>
  ),
};

/**
 * macOS desktop: the brand is pushed to `--workspace-titlebar-content-left` (134px), which makes
 * the LEFT run the widest, so the orb lands in the traffic-light reserve — behind the native window
 * buttons — with no platform branch in the component. The dashed box marks where those buttons sit.
 */
export const WidthsMacDesktop: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-16 rounded-lg bg-neutral-900 p-6">
      {[420, 340, 288, 256].map((width) => (
        <div key={width} className="relative">
          <HeaderRow width={width} brandInset={134} label={`${width}px · macOS desktop`} />
          <div
            aria-hidden
            className="pointer-events-none absolute left-[13px] top-[22px] z-20 h-8 rounded-full border border-dashed border-white/70"
            style={{ width: 57 }}
          />
        </div>
      ))}
    </div>
  ),
};

/** Both palettes, so the orb can be judged against Orange/Rosa and Blau/Lila grounds. */
export const DarkGround: StoryObj = {
  render: () => (
    <div className="dark flex flex-col gap-5 rounded-lg bg-neutral-900 p-6">
      {[420, 288].map((width) => (
        <HeaderRow key={width} width={width} brandInset={18} label={`${width}px · dark`} />
      ))}
    </div>
  ),
};

/**
 * The wash is light-appearance only, and Storybook's theme store may resolve to either — force
 * light for this story so every row is judged on the same appearance.
 */
function ForceLight({ children }: { children: ReactNode }) {
  const { setAppearanceMode } = useTheme();
  useEffect(() => {
    setAppearanceMode("light");
  }, [setAppearanceMode]);
  return <>{children}</>;
}

// Each row sets the wash tokens on the header itself; the component reads them at measurement
// time, so one story shows the strength range without any component change.
const FADE_CASES: ReadonlyArray<{ label: string; vars?: Record<string, string> }> = [
  { label: "wash off — today's look" , vars: { "--stage-nx-fade-opacity": "0" } },
  { label: "default — 55% · 140px" },
  { label: "soft — 40% · 110px", vars: { "--stage-nx-fade-opacity": "0.4", "--stage-nx-fade-width": "110px" } },
  { label: "strong — 70% · 180px", vars: { "--stage-nx-fade-opacity": "0.7", "--stage-nx-fade-width": "180px" } },
  { label: "whisper — 30% · 90px", vars: { "--stage-nx-fade-opacity": "0.3", "--stage-nx-fade-width": "90px" } },
];

/**
 * macOS light-theme traffic-light contrast: the left-edge wash (light appearance only). Each row
 * is the macOS desktop header with the native buttons drawn in, at the strength set through the
 * `--stage-nx-fade-*` tokens — flip between them here instead of rebuilding the app.
 */
export const TrafficLightFade: StoryObj = {
  render: () => (
    <ForceLight>
      <div className="flex flex-col gap-16 rounded-lg bg-neutral-900 p-6">
        {FADE_CASES.map(({ label, vars }) => (
          <HeaderRow
            key={label}
            width={340}
            brandInset={134}
            label={label}
            {...(vars ? { style: vars as CSSProperties } : {})}
            trafficLights
          />
        ))}
      </div>
    </ForceLight>
  ),
};
