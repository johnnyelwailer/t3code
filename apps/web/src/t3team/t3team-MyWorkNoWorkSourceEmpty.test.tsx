import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { T3TeamMyWorkNoWorkSourceEmpty } from "./t3team-MyWorkNoWorkSourceEmpty";

describe("T3TeamMyWorkNoWorkSourceEmpty", () => {
  it("is My Work's empty state plus one connect-Jira action, not a setup page", () => {
    const html = renderToStaticMarkup(<T3TeamMyWorkNoWorkSourceEmpty onConnect={() => {}} />);
    expect(html).toContain("No projects are connected to a work source yet.");
    expect(html).not.toContain("Bring your Jira work");
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain("Connect a Jira project");
  });

  it("offers no action without a handler", () => {
    expect(renderToStaticMarkup(<T3TeamMyWorkNoWorkSourceEmpty />)).not.toContain("<button");
  });
});
