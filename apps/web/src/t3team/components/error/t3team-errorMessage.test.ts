import { describe, expect, it } from "vite-plus/test";

import { toUserFacingError } from "./t3team-errorMessage";

describe("toUserFacingError", () => {
  it("maps a failed fetch / offline error and marks it retryable", () => {
    const result = toUserFacingError(new TypeError("Failed to fetch"));
    expect(result.headline).toBe("You appear to be offline.");
    expect(result.canRetry).toBe(true);
    expect(result.technical).toContain("Failed to fetch");
  });

  it("maps 401/403 and unauthorized/permission errors as not retryable", () => {
    expect(toUserFacingError(new Error("Request failed with 401")).headline).toBe(
      "You don't have access to this.",
    );
    expect(toUserFacingError(new Error("Request failed with 403"))).toMatchObject({
      headline: "You don't have access to this.",
      canRetry: false,
    });
    expect(toUserFacingError(new Error("unauthorized"))).toMatchObject({ canRetry: false });
    expect(toUserFacingError({ status: 403 })).toMatchObject({
      headline: "You don't have access to this.",
      canRetry: false,
    });
    expect(toUserFacingError(new Error("Missing permission for this project"))).toMatchObject({
      headline: "You don't have access to this.",
    });
  });

  it("maps 404 / not found errors as not retryable", () => {
    expect(toUserFacingError(new Error("Request failed with 404"))).toMatchObject({
      headline: "This isn't available anymore.",
      canRetry: false,
    });
    expect(toUserFacingError({ status: 404, statusText: "Not Found" })).toMatchObject({
      headline: "This isn't available anymore.",
      canRetry: false,
    });
  });

  it("maps 429 / rate limit errors as retryable", () => {
    expect(toUserFacingError(new Error("429 Too Many Requests"))).toMatchObject({
      headline: "Too many requests just now. Try again in a moment.",
      canRetry: true,
    });
    expect(toUserFacingError({ status: 429 })).toMatchObject({
      headline: "Too many requests just now. Try again in a moment.",
    });
  });

  it("maps 5xx / internal errors as retryable", () => {
    expect(toUserFacingError(new Error("Request failed with 500"))).toMatchObject({
      headline: "Something went wrong on our end.",
      canRetry: true,
    });
    expect(toUserFacingError({ status: 503 })).toMatchObject({
      headline: "Something went wrong on our end.",
    });
  });

  it("maps timeout / abort errors as retryable", () => {
    expect(toUserFacingError(new Error("The request timed out"))).toMatchObject({
      headline: "That took too long.",
      canRetry: true,
    });
    expect(toUserFacingError(new DOMException("aborted", "AbortError"))).toMatchObject({
      headline: "That took too long.",
    });
  });

  it("surfaces Jira field validation errors as detail, not retryable", () => {
    const result = toUserFacingError({
      errorMessages: ["You do not have permission to edit this issue."],
      errors: { summary: "Summary is required." },
    });

    expect(result.headline).toBe("Jira rejected the change.");
    expect(result.canRetry).toBe(false);
    expect(result.detail).toContain("You do not have permission to edit this issue.");
    expect(result.detail).toContain("summary: Summary is required.");
  });

  it("finds Jira field errors nested under an error's cause", () => {
    const result = toUserFacingError({
      message: "Jira update failed.",
      cause: { errors: { assignee: "Assignee is invalid." } },
    });

    expect(result.headline).toBe("Jira rejected the change.");
    expect(result.detail).toBe("assignee: Assignee is invalid.");
  });

  it("falls back to a generic message for anything else, keeping the original in technical", () => {
    const result = toUserFacingError(new Error("Something unexpected happened in module X"));
    expect(result.headline).toBe("Something went wrong.");
    expect(result.canRetry).toBe(true);
    expect(result.technical).toContain("Something unexpected happened in module X");
  });

  it("handles null and undefined robustly", () => {
    expect(toUserFacingError(null)).toMatchObject({
      headline: "Something went wrong.",
      canRetry: true,
    });
    expect(toUserFacingError(undefined)).toMatchObject({
      headline: "Something went wrong.",
      canRetry: true,
    });
  });

  it("handles a plain string error", () => {
    expect(toUserFacingError("Request failed with 404")).toMatchObject({
      headline: "This isn't available anymore.",
    });
  });

  it("handles a bare { message } object", () => {
    expect(toUserFacingError({ message: "Rate limit exceeded, please slow down" })).toMatchObject({
      headline: "Too many requests just now. Try again in a moment.",
    });
  });

  it("handles a bare { status, statusText } response-like object", () => {
    expect(toUserFacingError({ status: 500, statusText: "Internal Server Error" })).toMatchObject({
      headline: "Something went wrong on our end.",
      canRetry: true,
    });
  });

  it("handles Effect-style tagged errors shaped like T3TeamAtlassianError", () => {
    const tagged = {
      _tag: "T3TeamAtlassianError",
      message:
        "Atlassian request timed out after 12000ms. Check Jira auth and network connectivity.",
    };
    expect(toUserFacingError(tagged)).toMatchObject({
      headline: "That took too long.",
      canRetry: true,
    });
  });

  it("passes an already-formatted { title, description } error through as-is", () => {
    const result = toUserFacingError({
      title: "Couldn't move PROJ-24 to In Progress",
      description: "No Jira transition moves PROJ-24 into In Progress.",
    });

    expect(result).toMatchObject({
      headline: "Couldn't move PROJ-24 to In Progress",
      detail: "No Jira transition moves PROJ-24 into In Progress.",
      canRetry: true,
    });
  });

  it("folds the action context into technical detail without changing the headline", () => {
    const result = toUserFacingError(new Error("boom"), { action: "loading assignees" });
    expect(result.headline).toBe("Something went wrong.");
    expect(result.technical).toContain("Action: loading assignees");
    expect(result.technical).toContain("boom");
  });
});
