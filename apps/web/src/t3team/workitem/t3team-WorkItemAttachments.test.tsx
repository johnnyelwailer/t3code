import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { WorkItemAttachments } from "./t3team-WorkItemAttachments";

describe("WorkItemAttachments", () => {
  it("renders nothing when there are no attachments", () => {
    expect(renderToStaticMarkup(<WorkItemAttachments attachments={[]} nowMs={Date.now()} />)).toBe(
      "",
    );
  });

  it("resolves each attachment's href and thumbnail through resolveAssetUrl", () => {
    const markup = renderToStaticMarkup(
      <WorkItemAttachments
        attachments={[
          { id: "1", filename: "diagram.png", mimeType: "image/png", content: "raw/diagram.png" },
        ]}
        resolveAssetUrl={(url) => `/resolved/${url}`}
        nowMs={Date.now()}
      />,
    );

    expect(markup).toContain("/resolved/raw/diagram.png");
    expect(markup).toContain("Attachments");
  });

  it("lays out the grid at 2/3/4 columns across the container breakpoints", () => {
    const markup = renderToStaticMarkup(
      <WorkItemAttachments attachments={[{ id: "1", filename: "a.txt" }]} nowMs={Date.now()} />,
    );

    expect(markup).toContain("grid-cols-2");
    expect(markup).toContain("@lg/workitem:grid-cols-3");
    expect(markup).toContain("@3xl/workitem:grid-cols-4");
  });
});
