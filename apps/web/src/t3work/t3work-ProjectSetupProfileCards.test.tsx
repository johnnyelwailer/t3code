import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  listT3workProjectSetupCardOptions,
  T3workProjectSetupProfileCards,
} from "./t3work-ProjectSetupProfileCards";

describe("T3workProjectSetupProfileCards", () => {
  it("renders all setup profiles and marks the selected card", () => {
    const markup = renderToStaticMarkup(
      <T3workProjectSetupProfileCards
        selectedProfileId="engineering-copilot"
        onSelectProfile={() => {}}
      />,
    );

    for (const option of listT3workProjectSetupCardOptions()) {
      expect(markup).toContain(option.title);
      expect(markup).toContain(option.description);
      expect(markup).toContain(`data-profile-id="${option.id}"`);
    }

    expect(markup).toContain('data-profile-id="engineering-copilot"');
    expect(markup).toContain('data-selected="true"');
    expect(markup).toContain('aria-pressed="true"');
    // The descriptive copy gets the full card width below the logo/title row.
    expect(markup).toContain("grid-cols-[auto_minmax(0,1fr)]");
    expect(markup).toContain("col-span-2 line-clamp-2 text-muted-foreground");
  });

  it("renders pack-contributed profiles with badge, bullets and illustration", () => {
    const packProfiles = [
      {
        id: "nexi-dev",
        title: "Developer",
        description: "Implementation guidance with diff-first defaults.",
        badge: "DEV",
        bullets: ["Plan changes", "Address PR feedback"],
        category: "engineering" as const,
        iconDataUrl: "data:image/png;base64,AAAA",
      },
    ];
    const options = listT3workProjectSetupCardOptions(packProfiles);
    expect(options.map((option) => option.id)).toEqual(["nexi-dev"]);
    expect(options[0]?.eyebrow).toBe("DEV");
    expect(options[0]?.iconSrc).toBe("data:image/png;base64,AAAA");

    const markup = renderToStaticMarkup(
      <T3workProjectSetupProfileCards
        selectedProfileId="nexi-dev"
        onSelectProfile={() => {}}
        profiles={packProfiles}
      />,
    );
    expect(markup).toContain('data-profile-id="nexi-dev"');
    expect(markup).toContain('src="data:image/png;base64,AAAA"');
    expect(markup).toContain("Developer");
    // Built-in generic profiles must not leak in when a pack owns the catalog.
    expect(markup).not.toContain('data-profile-id="engineering-copilot"');
  });
});
