import { describe, expect, it } from "vite-plus/test";

import { shouldUseRestingComposerLayout } from "./composerFooterLayout";

describe("shouldUseRestingComposerLayout (t3team focus and blur-collapse rules)", () => {
  const resting = {
    isExistingThread: true,
    isMobileViewport: false,
    isFocused: false,
    isScrollCollapsed: false,
    hasExpandedChrome: false,
    hasMultilinePrompt: false,
    collapseOnBlur: true,
    timelineOverflows: true,
  };

  it("uses the resting layout after a timeline scroll", () => {
    expect(shouldUseRestingComposerLayout({ ...resting, isScrollCollapsed: true })).toBe(true);
  });

  it("keeps an unfocused composer expanded when blur collapse is off", () => {
    expect(shouldUseRestingComposerLayout({ ...resting, collapseOnBlur: false })).toBe(false);
  });

  it("keeps a scroll-collapsed composer expanded while focused", () => {
    expect(
      shouldUseRestingComposerLayout({ ...resting, isFocused: true, isScrollCollapsed: true }),
    ).toBe(false);
  });

  it("rests a scroll-collapsed composer when unfocused, regardless of the blur preference", () => {
    expect(
      shouldUseRestingComposerLayout({
        ...resting,
        isFocused: false,
        isScrollCollapsed: true,
        collapseOnBlur: false,
      }),
    ).toBe(true);
  });

  it("keeps the composer expanded until the timeline is scrolled", () => {
    expect(
      shouldUseRestingComposerLayout({
        ...resting,
        isScrollCollapsed: false,
        collapseOnBlur: false,
      }),
    ).toBe(false);
  });
});
