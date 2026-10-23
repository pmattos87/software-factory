// Work on the integration branch that hasn't reached production yet, grouped
// by the Story whose Feature branch brought it, and matched against the files
// a split's Subtasks expect to change.

import { git } from './git.mjs';
import { parseFeatureBranch } from './conventions.mjs';

// The branch a merge commit's subject names: a GitHub PR merge, or a plain
// `git merge`. Null for any other subject.
export function mergedBranch(subject) {
  const m = /^Merge pull request #\d+ from [^/\s]+\/(\S+)/.exec(subject) ?? /^Merge branch '([^']+)'/.exec(subject);
  return m ? m[1] : null;
}

// Parses `git log --name-only --format=%x00%h %s` output into commits.
export function parseLog(out) {
  return out
    .split('\0')
    .filter((block) => block.trim())
    .map((block) => {
      const [head, ...files] = block.split('\n').map((l) => l.trim()).filter(Boolean);
      const i = head.indexOf(' ');
      return { hash: i < 0 ? head : head.slice(0, i), subject: i < 0 ? '' : head.slice(i + 1), files };
    });
}

// Groups the integration branch's unreleased entries (one per first-parent
// commit: a merge with the commits it brought, or a commit made there directly)
// by Story key, and keeps the groups that touched any of `files`. A group with
// no Story (a direct commit, or a merge of a branch that isn't a Feature
// branch) is named by its entry's hash. Each result lists all of the group's
// commits and only the overlapping files.
export function unreleasedOverlap(entries, files, boardKey) {
  const wanted = new Set(files.map((f) => f.replace(/\\/g, '/').replace(/^\.\//, '')));
  const groups = new Map();
  for (const { hash, subject, commits } of entries) {
    const branch = mergedBranch(subject);
    const story = branch ? parseFeatureBranch(branch, boardKey)?.story ?? null : null;
    const id = story ?? hash;
    const group = groups.get(id) ?? { story, branch, hash, commits: [], files: new Set() };
    for (const c of commits) {
      group.commits.push({ hash: c.hash, subject: c.subject });
      for (const f of c.files) if (wanted.has(f)) group.files.add(f);
    }
    groups.set(id, group);
  }
  return [...groups.values()].filter((g) => g.files.size).map((g) => ({ ...g, files: [...g.files].sort() }));
}

// Reads the unreleased entries from git, between the remote production and
// integration branches. Null when git fails (no such branch, not a repo).
export function readUnreleased(dir, { production, integration }) {
  const out = git(dir, 'log', '--first-parent', '--format=%H %P%x09%s', `origin/${production}..origin/${integration}`);
  if (out === null) return null;
  const entries = [];
  for (const line of out.split('\n').filter(Boolean)) {
    const [ids, subject = ''] = line.split('\t');
    const [hash, first, second] = ids.split(' ');
    // A merge carries the commits of its second parent that are on neither
    // production nor the integration branch before it.
    const range = second ? [`^origin/${production}`, `^${first}`, second] : ['-1', hash];
    const log = git(dir, 'log', '--name-only', '--format=%x00%h %s', ...range);
    if (log === null) return null;
    entries.push({ hash: hash.slice(0, 7), subject, commits: parseLog(log) });
  }
  return entries;
}
