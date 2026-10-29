import { describe, expect, it } from "vite-plus/test";

import {
  buildWorkItemFilterJql,
  quoteJqlString,
  restrictJqlToProject,
} from "./t3team-jqlProjectScope.ts";

const PROJECT = "10001";
const CLAUSE = `project in (${PROJECT})`;

const refused = (jql: string | undefined) => {
  const result = restrictJqlToProject(jql, PROJECT);
  expect(result.ok, `expected a refusal for ${JSON.stringify(jql)}`).toBe(false);
};
const scoped = (jql: string | undefined) => {
  const result = restrictJqlToProject(jql, PROJECT);
  if (!result.ok)
    throw new Error(`expected ${JSON.stringify(jql)} to be accepted: ${result.reason}`);
  return result.jql;
};

describe("restrictJqlToProject", () => {
  it("wraps the caller's query so an OR cannot escape the project clause", () => {
    expect(scoped("project = OTHER OR status = Open")).toBe(
      `(project = OTHER OR status = Open) AND ${CLAUSE}`,
    );
  });

  it("turns an empty query into the project clause, never into 'every issue'", () => {
    for (const empty of [undefined, "", "   ", "\t"]) expect(scoped(empty)).toBe(CLAUSE);
  });

  it("ANDs host-built narrowing in front of the project clause, keeping the caller's ORDER BY", () => {
    expect(restrictJqlToProject("a = 1 ORDER BY created", PROJECT, 'labels = "x"')).toEqual({
      ok: true,
      jql: `(a = 1) AND (labels = "x") AND ${CLAUSE} ORDER BY created`,
    });
    expect(restrictJqlToProject(undefined, PROJECT, 'labels = "x"')).toEqual({
      ok: true,
      jql: `(labels = "x") AND ${CLAUSE}`,
    });
  });

  it("keeps a trailing ORDER BY after the clause", () => {
    expect(scoped("status = Open ORDER BY created DESC, priority ASC")).toBe(
      `(status = Open) AND ${CLAUSE} ORDER BY created DESC, priority ASC`,
    );
    expect(scoped("ORDER BY created")).toBe(`${CLAUSE} ORDER BY created`);
  });

  it("refuses a query that closes the wrapping parenthesis early", () => {
    refused("a = 1) OR project = OTHER OR (b = 2");
    refused("(status = Open");
    refused('summary ~ ")" AND (project = OTHER');
  });

  it("refuses an unterminated string, which would swallow the appended clause", () => {
    refused('summary ~ "abc');
    refused('summary ~ "abc\\');
  });

  it("does not let an escaped quote end a string for the scan but not for Jira", () => {
    expect(scoped('summary ~ "said \\" OR project = OTHER"')).toMatch(
      new RegExp(`AND ${CLAUSE.replace(/[()]/g, "\\$&")}$`),
    );
  });

  it("refuses homoglyphs and control characters outside a string", () => {
    refused("рroject = OTHER");
    refused("ｐroject = OTHER");
    refused("status = Open\nOR project = OTHER");
    refused("status = Open\u0000");
  });

  it("allows non-ASCII inside a string literal", () => {
    expect(scoped('summary ~ "Grüße 日本語"')).toContain("Grüße 日本語");
  });

  it("refuses a nested ORDER BY and an ORDER BY tail that carries more than sort keys", () => {
    refused("(status = Open ORDER BY created)");
    refused("status = Open ORDER BY created DESC OR project = OTHER");
    refused("status = Open ORDER BY created; DROP");
    refused('status = Open ORDER BY created, "');
  });

  it("does not treat 'order by' inside a string as the sort clause", () => {
    expect(scoped('summary ~ "order by created"')).toBe(
      `(summary ~ "order by created") AND ${CLAUSE}`,
    );
  });

  it("refuses an over-long query", () => {
    refused("a".repeat(5000));
  });

  it("refuses a project binding that is not a numeric id, since it is interpolated into JQL", () => {
    for (const bad of ["IES", "10001) OR (1=1", "", "-1", "1e3"]) {
      expect(restrictJqlToProject("status = Open", bad).ok).toBe(false);
    }
  });
});

describe("buildWorkItemFilterJql", () => {
  it("ANDs the structured filters with quoted values", () => {
    expect(
      buildWorkItemFilterJql({
        status: ["In Progress", "Review"],
        labels: ["a", "b"],
        type: "Bug",
        text: 'a "quoted" term',
        assignee: "unassigned",
      }),
    ).toBe(
      'status in ("In Progress", "Review") AND issuetype = "Bug" AND text ~ "a quoted term" AND labels = "a" AND labels = "b" AND assignee is EMPTY',
    );
  });

  it("escapes quotes and backslashes in a value instead of letting them end the string", () => {
    expect(quoteJqlString('x" OR project = OTHER OR "y')).toBe('"x\\" OR project = OTHER OR \\"y"');
    const body = buildWorkItemFilterJql({ type: 'x" OR project = OTHER OR "y' });
    expect(body).not.toBeNull();
    expect(restrictJqlToProject(body, PROJECT).ok).toBe(true);
  });

  it("refuses a value with a control character", () => {
    expect(buildWorkItemFilterJql({ type: "Bug\nOR project = OTHER" })).toBeNull();
  });
});
