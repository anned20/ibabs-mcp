import { describe, expect, it } from "vitest";
import { renderNotes } from "../scripts/release-notes.js";

const commit = (hash: string, subject: string, body = "") => ({
  hash: hash.padEnd(40, "0"),
  subject,
  body,
});

describe("release notes", () => {
  it("groups conventional commits and falls back to other changes", () => {
    const notes = renderNotes([
      commit("aaaaaaa", "feat(login): accept an SSO session"),
      commit("bbbbbbb", "fix: stop posting credentials to the portal"),
      commit("ccccccc", "chore: tidy workflow"),
      commit("ddddddd", "Accept a completed SSO login"),
    ]);

    expect(notes).toContain("## Features\n\n- **login:** accept an SSO session (aaaaaaa)");
    expect(notes).toContain("## Fixes\n\n- stop posting credentials to the portal (bbbbbbb)");
    expect(notes).toContain("## Other changes\n\n- tidy workflow (ccccccc)\n- Accept a completed SSO login (ddddddd)");
    expect(notes.indexOf("## Features")).toBeLessThan(notes.indexOf("## Fixes"));
    expect(notes.indexOf("## Fixes")).toBeLessThan(notes.indexOf("## Other changes"));
  });

  it("lists breaking changes first", () => {
    const notes = renderNotes([
      commit("aaaaaaa", "feat!: drop the old portal", "BREAKING CHANGE: portalUrl is required"),
    ]);

    expect(notes.startsWith("## Breaking changes")).toBe(true);
    expect(notes).toContain("- drop the old portal (aaaaaaa)");
  });

  it("reports an empty range", () => {
    expect(renderNotes([])).toBe("No changes since the previous release.");
  });

  it("drops version bump commits", () => {
    expect(renderNotes([commit("aaaaaaa", "0.2.4"), commit("bbbbbbb", "fix: real change")]))
      .not.toContain("0.2.4 (aaaaaaa)");
  });
});
