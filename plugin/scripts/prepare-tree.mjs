// Makes the working tree ready for a Run's Gates (SF-146), so no Gate fails
// for an environment reason. From the worktree the Run builds in:
//   node prepare-tree.mjs
// - Prints the repo root as git reports it: every Gate command runs from
//   there, never from a hand-typed path (a lowercase drive letter once made
//   vitest load no tests).
// - Runs the project's install (`npm ci` with package-lock.json, or
//   `bun install --frozen-lockfile` with bun.lock, SF-151) when node_modules is
//   missing or older than the lock file.
// - Checks `.claude/factory.json` exists on the branch.
// Exits 0 when ready, 1 when the install fails, 2 when the tree can't run the
// Gates (no git repo, or no factory.json on the branch).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { repoRoot, git } from './lib/git.mjs';
import { CONFIG_PATH } from './lib/config.mjs';
import { packageManager } from './lib/package-manager.mjs';

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

const pm = packageManager(root);
if (pm) {
  const modules = path.join(root, 'node_modules');
  const stamp = [pm.stamp, modules].find((f) => f && fs.existsSync(f));
  if (!stamp || fs.statSync(stamp).mtimeMs < fs.statSync(pm.lock).mtimeMs) {
    const lockName = path.basename(pm.lock);
    console.log(stamp ? `node_modules is older than ${lockName}: ${pm.install}` : `node_modules is missing: ${pm.install}`);
    const r = spawnSync(pm.install, { cwd: root, shell: true, stdio: 'inherit' });
    if (r.status !== 0) {
      console.log(`${pm.install} failed (exit ${r.status ?? 'killed'}).`);
      process.exit(1);
    }
    // With no install marker of its own, node_modules is the stamp: make it newer than the lock.
    if (!pm.stamp && fs.existsSync(modules)) {
      const now = new Date();
      fs.utimesSync(modules, now, now);
    }
  } else {
    console.log('node_modules is current.');
  }
}
console.log('ready');
