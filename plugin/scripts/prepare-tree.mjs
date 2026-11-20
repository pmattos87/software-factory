// Makes the working tree ready for a Run's Gates (SF-146), so no Gate fails
// for an environment reason. From the worktree the Run builds in:
//   node prepare-tree.mjs
// - Prints the repo root as git reports it: every Gate command runs from
//   there, never from a hand-typed path (a lowercase drive letter once made
//   vitest load no tests).
// - Runs `npm ci` when package-lock.json exists and node_modules is missing or
//   older than it.
// - Checks `.claude/factory.json` exists on the branch.
// Exits 0 when ready, 1 when `npm ci` fails, 2 when the tree can't run the
// Gates (no git repo, or no factory.json on the branch).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { repoRoot, git } from './lib/git.mjs';
import { CONFIG_PATH } from './lib/config.mjs';

const root = repoRoot(process.cwd());
if (!root) {
  console.log('Not inside a git repository.');
  process.exit(2);
}
console.log(`root: ${root}`);

if (git(root, 'cat-file', '-e', `HEAD:${CONFIG_PATH}`) === null && !fs.existsSync(path.join(root, CONFIG_PATH))) {
  console.log(`No ${CONFIG_PATH} on this branch: the Gates can't run. Merge the commit that adds it (or cut the branch from one that has it), then run again.`);
  process.exit(2);
}

const lock = path.join(root, 'package-lock.json');
if (fs.existsSync(lock)) {
  const modules = path.join(root, 'node_modules');
  // npm writes node_modules/.package-lock.json on every install: it is the install's own timestamp.
  const stamp = [path.join(modules, '.package-lock.json'), modules].find((f) => fs.existsSync(f));
  if (!stamp || fs.statSync(stamp).mtimeMs < fs.statSync(lock).mtimeMs) {
    console.log(stamp ? 'node_modules is older than package-lock.json: npm ci' : 'node_modules is missing: npm ci');
    const r = spawnSync('npm ci', { cwd: root, shell: true, stdio: 'inherit' });
    if (r.status !== 0) {
      console.log(`npm ci failed (exit ${r.status ?? 'killed'}).`);
      process.exit(1);
    }
  } else {
    console.log('node_modules is current.');
  }
}
console.log('ready');
