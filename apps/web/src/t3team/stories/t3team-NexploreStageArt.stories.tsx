import type { Meta, StoryObj } from "@storybook/react";

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
}: {
  width: number;
  brandInset: number;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-mono text-[10px] text-neutral-500">{label}</div>
      <div
        className="relative flex h-[52px] shrink-0 flex-row items-center overflow-visible rounded-md"
        style={{ width }}
      >
        <Backdrop />
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
