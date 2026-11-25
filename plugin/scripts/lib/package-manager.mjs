// The project's package manager, read from its lock file (SF-151): what installs
// its dependencies, and what tells an install apart from a stale one. npm wins
// when both lock files exist, so an npm project behaves exactly as before.

import fs from 'node:fs';
import path from 'node:path';

const MANAGERS = [
  // npm writes node_modules/.package-lock.json on every install: it is the install's own timestamp.
  { name: 'npm', locks: ['package-lock.json'], install: 'npm ci', stamp: path.join('node_modules', '.package-lock.json') },
  // bun writes no marker of its own; prepare-tree touches node_modules after an install instead.
  { name: 'bun', locks: ['bun.lock', 'bun.lockb'], install: 'bun install --frozen-lockfile', stamp: null },
];

// { name, lock, install, stamp } for the repo at `root`, or null when it has no lock file.
// `lock` and `stamp` are absolute paths; `stamp` is null when node_modules itself is the stamp.
export function packageManager(root) {
  for (const m of MANAGERS) {
    const lock = m.locks.map((l) => path.join(root, l)).find((f) => fs.existsSync(f));
    if (lock) return { name: m.name, lock, install: m.install, stamp: m.stamp && path.join(root, m.stamp) };
  }
  return null;
}

// The install command to name in a fix, `npm ci` when the project has no lock file.
export const installCommand = (root) => packageManager(root)?.install ?? 'npm ci';
