import { spawnSync } from 'node:child_process';

// Runs git in `dir`; returns trimmed stdout, or null when git fails.
export function git(dir, ...args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

export const repoRoot = (dir) => git(dir, 'rev-parse', '--show-toplevel');

export const currentBranch = (dir) => git(dir, 'symbolic-ref', '--quiet', '--short', 'HEAD');

export const branchExists = (dir, name) =>
  git(dir, 'rev-parse', '--verify', '--quiet', `refs/heads/${name}`) !== null;
