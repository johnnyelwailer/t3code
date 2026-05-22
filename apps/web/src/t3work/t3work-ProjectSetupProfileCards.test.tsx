import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  listT3workProjectSetupCardOptions,
  T3workProjectSetupProfileCards,
} from "./t3work-ProjectSetupProfileCards";

describe("T3workProjectSetupProfileCards", () => {
  it("renders all setup profiles and marks the selected card", () => {
    const markup = renderToStaticMarkup(
      <T3workProjectSetupProfileCards selectedProfileId="developer" onSelectProfile={() => {}} />,
    );

    for (const option of listT3workProjectSetupCardOptions()) {
      expect(markup).toContain(option.title);
      expect(markup).toContain(option.description);
      expect(markup).toContain(`data-profile-id="${option.id}"`);
    }

    expect(markup).toContain('data-profile-id="developer"');
    expect(markup).toContain('data-selected="true"');
    expect(markup).toContain('aria-pressed="true"');
  });
});
