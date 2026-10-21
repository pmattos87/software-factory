// Factory hook: a `gh pr merge` uses a merge commit, keeps the branch, never
// bypasses the PR checks, and never targets the production branch.

import { spawnSync } from 'node:child_process';
import { readToolCall, block } from './lib/hook.mjs';
import { invocations } from './lib/shell.mjs';
import { repoRoot } from './lib/git.mjs';
import { loadConfig } from './lib/config.mjs';
import { checkMerge } from './lib/conventions.mjs';
import { parseMerge } from './lib/merge.mjs';

const { command, cwd } = readToolCall();
if (!/\bgh\b/.test(command)) process.exit(0);

for (const inv of invocations(command, cwd)) {
  if (inv.tool === 'gh' && inv.sub === 'pr' && inv.args[0] === 'merge') guard(inv.dir, parseMerge(inv.args.slice(1)));
}

function guard(dir, merge) {
  const root = repoRoot(dir);
  const branches = (root && loadConfig(root)?.branches) ?? { integration: 'develop', production: 'main' };
  refuse(checkMerge({ branches, flags: merge.flags, base: null }));
  const base = prBase(dir, merge);
  if (!base) block('merge-guard', "Couldn't read the PR's target branch with `gh pr view`; name the PR (number or URL) and try again.");
  refuse(checkMerge({ branches, flags: merge.flags, base }));
}

function refuse(problems) {
  if (problems.length) block('merge-guard', `The merge breaks the conventions:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
}

function prBase(dir, { pr, repo }) {
  const args = ['pr', 'view', ...(pr ? [pr] : []), ...(repo ? ['--repo', repo] : []), '--json', 'baseRefName', '--jq', '.baseRefName'];
  const r = spawnSync('gh', args, { cwd: dir, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}
