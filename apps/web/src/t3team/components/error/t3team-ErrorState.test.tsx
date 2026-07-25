import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { T3TeamErrorState } from "./t3team-ErrorState";

/** React escapes apostrophes to `&#x27;` in static markup. */
function render(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(node).replaceAll("&#x27;", "'");
}

describe("T3TeamErrorState", () => {
  it("renders the block variant with a plain headline and a collapsed technical disclosure", () => {
    const markup = render(<T3TeamErrorState error={new Error("db exploded")} />);

    expect(markup).toContain("Something went wrong.");
    expect(markup).toContain("Technical details");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("db exploded");
    expect(markup).toContain('role="alert"');
  });

  it("shows a retry button when onRetry is given and the error is retryable", () => {
    const markup = render(
      <T3TeamErrorState error={new Error("Request failed with 500")} onRetry={() => {}} />,
    );

    expect(markup).toContain("Something went wrong on our end.");
    expect(markup).toContain("Try again");
  });

  it("hides the retry button when the error is not retryable, even with onRetry given", () => {
    const markup = render(
      <T3TeamErrorState error={new Error("Request failed with 404")} onRetry={() => {}} />,
    );

    expect(markup).toContain("This isn't available anymore.");
    expect(markup).not.toContain("Try again");
  });

  it("hides the retry button entirely when no onRetry is given", () => {
    const markup = render(
      <T3TeamErrorState error={new Error("Request failed with 500")} />,
    );

    expect(markup).not.toContain("Try again");
  });

  it("renders the inline variant as a single compact line with its own collapsed disclosure", () => {
    const markup = render(
      <T3TeamErrorState error={new Error("Request failed with 401")} variant="inline" />,
    );

    expect(markup).toContain("You don't have access to this.");
    expect(markup).toContain("Technical details");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("text-xs");
  });

  it("renders the page variant centered with vertical padding", () => {
    const markup = render(
      <T3TeamErrorState error={new Error("Request failed with 500")} variant="page" />,
    );

    expect(markup).toContain("Something went wrong on our end.");
    expect(markup).toContain("justify-center");
    expect(markup).toContain('role="alert"');
  });

  it("surfaces Jira field validation detail in the block variant", () => {
    const markup = render(
      <T3TeamErrorState
        error={{ errorMessages: [], errors: { summary: "Summary is required." } }}
      />,
    );

    expect(markup).toContain("Jira rejected the change.");
    expect(markup).toContain("summary: Summary is required.");
  });
});
