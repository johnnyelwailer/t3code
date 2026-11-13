import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { JiraProjectPicker } from "~/t3team/components/t3team-JiraProjectPicker";
import type { CatalogRow } from "~/t3team/hooks/t3team-createProjectCatalogRows";
import {
  jiraCatalogEntryKey,
  type JiraCatalogProject,
  type JiraCatalogSiteFailure,
} from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import { render } from "../../../test/render";

const project = (
  accountId: string,
  siteHost: string,
  id: string,
  key: string,
  title: string,
): JiraCatalogProject => ({
  entryKey: jiraCatalogEntryKey(accountId, id),
  accountId,
  provider: "atlassian",
  externalProjectId: id,
  key,
  title,
  iconUrl: undefined,
  siteHost,
});

const SITE_ONE = "example-one.atlassian.net";
const SITE_TWO = "example-two.atlassian.net";

const twoSiteCatalog = [
  project("a", SITE_ONE, "1", "ALPHA", "Alpha Board"),
  project("a", SITE_ONE, "2", "BETA", "Beta Board"),
  project("b", SITE_TWO, "1", "GAMMA", "Gamma Board"),
];

const failure = (accountId: string, host: string, error: string): JiraCatalogSiteFailure => ({
  accountId,
  provider: "atlassian",
  siteHost: host,
  label: host,
  error,
});

async function show(props: Partial<React.ComponentProps<typeof JiraProjectPicker>> = {}) {
  const onChoose = vi.fn<(row: CatalogRow) => void>();
  const onRefresh = vi.fn();
  const screen = await render(
    <JiraProjectPicker
      catalog={twoSiteCatalog}
      boundProjectIds={new Map()}
      loading={false}
      error={null}
      onRefresh={onRefresh}
      onChoose={onChoose}
      {...props}
    />,
    { router: false },
  );
  return Object.assign(screen, { onChoose, onRefresh });
}

const chipButtons = (el: HTMLElement) => [
  ...el.querySelectorAll<HTMLButtonElement>('[data-testid="jira-site-chips"] button[aria-pressed]'),
];

const rowTitles = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLButtonElement>("li button")].map(
    (button) => button.textContent ?? "",
  );

describe("JiraProjectPicker site chips", () => {
  it("hides chips when only one site is connected", async () => {
    await using shown = await show({
      catalog: [project("a", SITE_ONE, "1", "ALPHA", "Alpha Board")],
    });
    expect(shown.container.querySelector('[data-testid="jira-site-chips"]')).toBeNull();
    expect(shown.container.querySelector(".bg-success")).toBeNull();
    expect(rowTitles(shown.container).join(" ")).toContain("Alpha Board");
  });

  it("says so in plain text when a site has no projects", async () => {
    await using shown = await show({ catalog: [] });
    expect(shown.container.textContent).toContain(
      "No projects found on your connected Jira sites.",
    );
    expect(shown.container.querySelector('[data-testid="jira-site-chips"]')).toBeNull();
  });

  it("reports an offline site on its chip, with Retry, and keeps the other site's projects", async () => {
    await using shown = await show({
      catalog: [project("a", SITE_ONE, "1", "ALPHA", "Alpha Board")],
      siteFailures: [failure("b", SITE_TWO, "ENOTFOUND")],
    });
    const chips = chipButtons(shown.container);
    expect(chips).toHaveLength(2);
    expect(chips.map((chip) => chip.textContent).join(" ")).toContain(SITE_TWO);
    expect(chips.map((chip) => chip.textContent).join(" ")).toContain("Offline");
    expect(shown.container.querySelector(".bg-success")).toBeNull();
    expect(rowTitles(shown.container).join(" ")).toContain("Alpha Board");
    const retry = [...shown.container.querySelectorAll("button")].find(
      (button) => button.textContent === "Retry",
    );
    expect(retry).toBeTruthy();
    await userEvent.click(retry!);
    expect(shown.onRefresh).toHaveBeenCalledTimes(1);
  });

  it("reports an auth-expired site as Sign-in expired", async () => {
    await using shown = await show({
      catalog: [project("a", SITE_ONE, "1", "ALPHA", "Alpha Board")],
      siteFailures: [failure("b", SITE_TWO, "401 Unauthorized: token expired")],
    });
    expect(
      chipButtons(shown.container)
        .map((chip) => chip.textContent)
        .join(" "),
    ).toContain("Sign-in expired");
  });

  it("filters the list to the clicked site and combines with search", async () => {
    await using shown = await show();
    const [one, two] = chipButtons(shown.container);
    expect(one).toBeTruthy();
    expect(two).toBeTruthy();
    await userEvent.click(one!);
    expect(one!.getAttribute("aria-pressed")).toBe("true");
    const afterFilter = rowTitles(shown.container).join(" ");
    expect(afterFilter).toContain("Alpha Board");
    expect(afterFilter).toContain("Beta Board");
    expect(afterFilter).not.toContain("Gamma Board");
    const input = shown.container.querySelector("input")!;
    await userEvent.clear(input);
    await userEvent.type(input, "beta");
    expect(rowTitles(shown.container)).toEqual([expect.stringContaining("Beta Board")]);
    await userEvent.clear(input);
    await userEvent.type(input, "gamma");
    expect(shown.container.textContent).toContain(`No project matches “gamma” on ${SITE_ONE}.`);
  });

  it("clears the filter when the same chip is clicked again", async () => {
    await using shown = await show();
    const [one] = chipButtons(shown.container);
    await userEvent.click(one!);
    expect(rowTitles(shown.container).join(" ")).not.toContain("Gamma Board");
    await userEvent.click(one!);
    expect(one!.getAttribute("aria-pressed")).toBe("false");
    const text = rowTitles(shown.container).join(" ");
    expect(text).toContain("Gamma Board");
    expect(text).toContain("Alpha Board");
  });

  it("says so when the filtered site itself has no projects", async () => {
    await using shown = await show({
      catalog: [project("a", SITE_ONE, "1", "ALPHA", "Alpha Board")],
      siteFailures: [failure("b", SITE_TWO, "ENOTFOUND")],
    });
    const two = chipButtons(shown.container).find((chip) =>
      (chip.textContent ?? "").includes(SITE_TWO),
    );
    await userEvent.click(two!);
    expect(shown.container.textContent).toContain(`No projects on ${SITE_TWO}.`);
  });
});
