import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Runs git in `dir`; returns trimmed stdout, or null when git fails.
export function git(dir, ...args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

export const repoRoot = (dir) => git(dir, 'rev-parse', '--show-toplevel');

export const currentBranch = (dir) => git(dir, 'symbolic-ref', '--quiet', '--short', 'HEAD');

export const branchExists = (dir, name) =>
  git(dir, 'rev-parse', '--verify', '--quiet', `refs/heads/${name}`) !== null;

// The directory every Gate command runs from: git's own repo root, with a
// Windows drive letter in upper case and native separators, so a Run never
// depends on how a path was typed (SF-146: a lowercase `c:` cwd made vitest
// load no tests). Falls back to `dir` outside a git repo.
export function gateRoot(dir) {
  const top = repoRoot(dir);
  if (!top) return dir;
  const native = path.resolve(top);
  return process.platform === 'win32' ? native.replace(/^[a-z]:/, (d) => d.toUpperCase()) : native;
}
