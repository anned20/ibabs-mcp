import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export interface Commit {
  hash: string;
  subject: string;
  body: string;
}

interface Parsed {
  type: string;
  scope?: string;
  subject: string;
  breaking: boolean;
}

const HEADER = /^([a-z]+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/i;

const SECTIONS: Record<string, string> = {
  feat: "Features",
  fix: "Fixes",
  perf: "Performance",
  refactor: "Refactoring",
  docs: "Documentation",
};

const ORDER = [...new Set(Object.values(SECTIONS)), "Other changes"];

const VERSION_BUMP = /^\d+\.\d+\.\d+$/;

function parseCommit(commit: Commit): Parsed {
  const match = HEADER.exec(commit.subject.trim());
  const breaking = Boolean(match?.[3]) || /(^|\n)BREAKING[ -]CHANGE:/.test(commit.body);
  if (!match) return { type: "", subject: commit.subject.trim(), breaking };
  return {
    type: match[1]!.toLowerCase(),
    scope: match[2],
    subject: match[4]!.trim(),
    breaking,
  };
}

/** Group commits by conventional-commit type. Non-conventional subjects land in "Other changes". */
export function renderNotes(commits: Commit[]): string {
  const groups = new Map<string, string[]>();
  const breaking: string[] = [];

  for (const commit of commits) {
    const { type, scope, subject, breaking: isBreaking } = parseCommit(commit);
    if (VERSION_BUMP.test(commit.subject.trim())) continue;
    const line = `- ${scope ? `**${scope}:** ` : ""}${subject} (${commit.hash.slice(0, 7)})`;
    if (isBreaking) breaking.push(line);
    const title = SECTIONS[type] ?? "Other changes";
    groups.set(title, [...(groups.get(title) ?? []), line]);
  }

  const blocks: string[] = [];
  const add = (title: string, lines?: string[]) => {
    if (lines?.length) blocks.push(`## ${title}\n\n${lines.join("\n")}`);
  };

  add("Breaking changes", breaking);
  for (const title of ORDER) add(title, groups.get(title));
  return blocks.length > 0 ? blocks.join("\n\n") : "No changes since the previous release.";
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function main(): void {
  const tag = process.argv[2];
  if (!tag) {
    console.error("Usage: tsx scripts/release-notes.ts <tag>");
    process.exit(2);
  }

  let range = tag;
  try {
    const previous = git(["describe", "--abbrev=0", "--tags", `${tag}^`]).trim();
    range = `${previous}..${tag}`;
  } catch {
    // First tagged release: use the whole history.
  }

  const raw = git(["log", "--no-merges", "--format=%H%x1f%s%x1f%b%x1e", range]);
  const commits = raw
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash = "", subject = "", body = ""] = record.split("\x1f");
      return { hash, subject, body };
    })
    .filter((commit) => commit.hash);

  process.stdout.write(`${renderNotes(commits)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
