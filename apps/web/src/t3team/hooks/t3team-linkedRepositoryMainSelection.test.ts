import { describe, expect, it } from "vite-plus/test";

import { resolveMainRepositoryUrl } from "./t3team-linkedRepositoryMainSelection";

const ALPHA = "https://github.com/acme/alpha";
const BETA = "https://github.com/acme/beta";
const GAMMA = "https://github.com/acme/gamma";

describe("resolveMainRepositoryUrl", () => {
  it("leaves main empty when there are no linked repositories", () => {
    expect(
      resolveMainRepositoryUrl({
        linkedUrls: [],
        currentMain: null,
        previousLinkedUrls: [],
      }),
    ).toBeNull();
    expect(
      resolveMainRepositoryUrl({
        linkedUrls: [],
        currentMain: ALPHA,
        previousLinkedUrls: [ALPHA],
      }),
    ).toBeNull();
  });

  it("makes the first linked repository main", () => {
    expect(
      resolveMainRepositoryUrl({
        linkedUrls: [ALPHA],
        currentMain: null,
        previousLinkedUrls: [],
      }),
    ).toBe(ALPHA);
    expect(
      resolveMainRepositoryUrl({
        linkedUrls: [BETA, ALPHA],
        currentMain: null,
        previousLinkedUrls: [],
      }),
    ).toBe(BETA);
  });

  it("keeps an existing main when more repositories are linked", () => {
    expect(
      resolveMainRepositoryUrl({
        linkedUrls: [ALPHA, BETA],
        currentMain: ALPHA,
        previousLinkedUrls: [ALPHA],
      }),
    ).toBe(ALPHA);
  });

  it("keeps a user-chosen main when a non-main repository is unlinked", () => {
    expect(
      resolveMainRepositoryUrl({
        linkedUrls: [BETA],
        currentMain: BETA,
        previousLinkedUrls: [ALPHA, BETA],
      }),
    ).toBe(BETA);
  });

  it("makes the first remaining repository main when the main one is unlinked (option A)", () => {
    // Main is in the middle: the first remaining (list order) becomes main, not "the next after".
    expect(
      resolveMainRepositoryUrl({
        linkedUrls: [ALPHA, GAMMA],
        currentMain: BETA,
        previousLinkedUrls: [ALPHA, BETA, GAMMA],
      }),
    ).toBe(ALPHA);
    expect(
      resolveMainRepositoryUrl({
        linkedUrls: [BETA, GAMMA],
        currentMain: ALPHA,
        previousLinkedUrls: [ALPHA, BETA, GAMMA],
      }),
    ).toBe(BETA);
  });

  it("clears main when the last linked repository (the main one) is removed", () => {
    expect(
      resolveMainRepositoryUrl({
        linkedUrls: [],
        currentMain: ALPHA,
        previousLinkedUrls: [ALPHA],
      }),
    ).toBeNull();
  });

  it("does not auto-promote a main on an existing project that already has linked repos and none set", () => {
    expect(
      resolveMainRepositoryUrl({
        linkedUrls: [ALPHA, BETA],
        currentMain: null,
        previousLinkedUrls: [ALPHA, BETA],
      }),
    ).toBeNull();
    expect(
      resolveMainRepositoryUrl({
        linkedUrls: [ALPHA, BETA, GAMMA],
        currentMain: null,
        previousLinkedUrls: [ALPHA, BETA],
      }),
    ).toBeNull();
  });

  it("keeps an explicit main that is still linked (existing project with old data)", () => {
    expect(
      resolveMainRepositoryUrl({
        linkedUrls: [ALPHA, BETA],
        currentMain: BETA,
        previousLinkedUrls: [ALPHA, BETA],
      }),
    ).toBe(BETA);
  });
});
