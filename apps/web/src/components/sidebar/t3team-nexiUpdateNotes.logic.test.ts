import { describe, expect, it } from "vite-plus/test";
import { plainReleaseNotes } from "./t3team-nexiUpdateNotes.logic";

const GHE = "https://nexplore.ghe.com/hive/nx-nexi/pull";

describe("plainReleaseNotes", () => {
  it("turns the real 0.1.2-rc.8 titles into plain one-liners", () => {
    const raw = [
      `fix(publish): do not bundle ffi-rs into the server tarball; a smoke step that shows its errors by @pj in ${GHE}/984`,
      `chore: pin vendor/t3code to fork main 898a0deca9 (Windows payload budget fix) by @pj in ${GHE}/986`,
      `chore: pin vendor/t3code to fork main e203574893 (upstream sync v0.1.6+, environment filter, mobile draft fixes) by @pj in ${GHE}/975`,
      `fix(nexi-work): a phone cloud session starts behind an open draft, never ending in an error by @pj in ${GHE}/816`,
    ];
    expect(plainReleaseNotes(raw)).toEqual([
      "A phone cloud session starts behind an open draft, never ending in an error",
    ]);
  });

  it("drops build-tooling lines with the publish scope, whatever the type", () => {
    expect(
      plainReleaseNotes([
        `fix(publish): do not bundle ffi-rs into the server tarball; a smoke step that shows its errors by @pj in ${GHE}/984`,
        "feat(publish)!: sign the installer",
        "fix(web): publish dialog closes on Escape",
        "fix(publisher): keeps its scope",
      ]),
    ).toEqual(["Publish dialog closes on Escape", "Keeps its scope"]);
  });

  it("drops maintenance lines, PR numbers and the changelog footer from a whole release", () => {
    const raw = [
      `docs: AGENTS.md rule: chat features work and render on mobile by @pj in ${GHE}/932`,
      `docs(nexi-work): design scoped work-item read tools by @pj in ${GHE}/950`,
      `fix(nexi-work): project pills are 48 dp touch targets in one swipe strip (#951) by @pj in ${GHE}/953`,
      `**Full Changelog**: https://nexplore.ghe.com/hive/nx-nexi/compare/desktop-v0.1.2-rc.7...desktop-v0.1.2-rc.8`,
    ];
    expect(plainReleaseNotes(raw)).toEqual([
      "Project pills are 48 dp touch targets in one swipe strip",
    ]);
  });

  it.each(["ci", "docs", "refactor", "test", "build", "chore", "style"])(
    "drops %s lines, with or without a scope",
    (type) => {
      expect(plainReleaseNotes([`${type}: tidy things`, `${type}(web): tidy things`])).toEqual([]);
    },
  );

  it("drops unprefixed pin and bump lines", () => {
    expect(plainReleaseNotes(["Pin vendor/t3code to 898a0deca9", "Bump electron to 40"])).toEqual(
      [],
    );
  });

  it("keeps the human part of feat, fix and breaking prefixes", () => {
    expect(
      plainReleaseNotes([
        "feat(web)!: footer shows the update icon",
        "fix: Later stays dismissed",
        "perf(server): start faster",
      ]),
    ).toEqual(["Footer shows the update icon", "Later stays dismissed", "Start faster"]);
  });

  it("keeps an already plain line and strips markup and links", () => {
    expect(
      plainReleaseNotes([
        "Quieter update checks.",
        "fix: **bold** `code` and [a link](https://example.com/x) read plainly in https://example.com/y",
      ]),
    ).toEqual(["Quieter update checks.", "Bold code and a link read plainly in"]);
  });

  it("de-duplicates case-insensitively and caps at five", () => {
    expect(
      plainReleaseNotes([
        "fix: one",
        "fix(web): One",
        "fix: two",
        "fix: three",
        "fix: four",
        "fix: five",
        "fix: six",
      ]),
    ).toEqual(["One", "Two", "Three", "Four", "Five"]);
  });

  it("returns nothing when nothing is left", () => {
    expect(plainReleaseNotes([])).toEqual([]);
    expect(plainReleaseNotes([`chore: pin x by @pj in ${GHE}/1`, "fix:", "   "])).toEqual([]);
  });
});
