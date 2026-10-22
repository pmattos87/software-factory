// Factory hook: no `gh pr create` unless the PR follows the conventions, a
// Feature branch's Story has a passed Review on the branch head, and the
// project's gates pass on the branch. There is no override: shipping without
// Review is Pedro's, from his own terminal.

import { spawnSync } from 'node:child_process';
import { readToolCall, block } from './lib/hook.mjs';
import { invocations } from './lib/shell.mjs';
import { git, repoRoot, currentBranch } from './lib/git.mjs';
import { loadConfig, CONFIG_PATH } from './lib/config.mjs';
import { checkPullRequest, isReleaseBranch, parseFeatureBranch } from './lib/conventions.mjs';
import { findFlowboardCli, checkReview } from './lib/review.mjs';

const { command, cwd } = readToolCall();
if (!/\bgh\b/.test(command)) process.exit(0);

for (const inv of invocations(command, cwd)) {
  if (inv.tool === 'gh' && inv.sub === 'pr' && inv.args[0] === 'create') gate(inv.dir, flags(inv.args.slice(1)));
}

function gate(dir, opts) {
  const root = repoRoot(dir);
  if (!root) block('pr-gate', `${dir} is not a git repository.`);
  const config = loadConfig(root);
  if (!config?.boardKey) block('pr-gate', `The project has no ${CONFIG_PATH} with a boardKey, so its conventions and gates are unknown. Add it first.`);
  if (!opts.title) block('pr-gate', 'Pass the PR title with --title, carrying the Story key.');

  const head = opts.head?.replace(/^[^:]+:/, '') ?? currentBranch(root); // --head owner:branch
  if (head !== currentBranch(root)) block('pr-gate', `Check out ${head} first: the gates run on the working tree.`);
  if (git(root, 'status', '--porcelain', '--untracked-files=no')) {
    block('pr-gate', 'Commit or stash the uncommitted changes first: the gates must run on exactly what the PR carries.');
  }

  const baseRef = ['origin/', ''].map((p) => p + opts.base).find((r) => opts.base && git(root, 'rev-parse', '--verify', '--quiet', r));
  const subjects = baseRef ? (git(root, 'log', '--no-merges', '--format=%s', `${baseRef}..HEAD`) ?? '').split('\n').filter(Boolean) : [];
  const problems = checkPullRequest({ ...config, head, base: opts.base, title: opts.title, subjects });
  if (opts.base && !baseRef) problems.push(`Base branch ${opts.base} doesn't exist here.`);
  if (problems.length) block('pr-gate', `The PR breaks the conventions:\n${problems.map((p) => `  - ${p}`).join('\n')}`);

  // A Release branch carries Stories already reviewed on their own branches.
  if (!isReleaseBranch(head)) requireReview(parseFeatureBranch(head, config.boardKey).story, git(root, 'rev-parse', 'HEAD'));

  for (const cmd of config.gates) {
    const r = spawnSync(cmd, { cwd: root, shell: true, encoding: 'utf8' });
    if (r.status !== 0) {
      const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n');
      block('pr-gate', `Gate failed: \`${cmd}\` (exit ${r.status}). Fix it before opening the PR.\n${output}`);
    }
  }
}

function requireReview(key, head) {
  const cli = findFlowboardCli();
  if (!cli) block('pr-gate', `Can't read ${key}'s Review: flowboard-cli not found. Install Flowboard, or set FLOWBOARD_CLI to its path.`);
  const [cmd, pre] = cli;
  const r = spawnSync(cmd, [...pre, 'story', 'show', key], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) {
    let error = (r.stderr || r.error?.message || '').trim();
    try { error = JSON.parse(error).error; } catch {}
    if (/legacy project/.test(error)) return; // not on the Factory ladder: no Review to record
    block('pr-gate', `Can't read ${key}'s Review from Flowboard: ${error}`);
  }
  const problem = checkReview(JSON.parse(r.stdout), head);
  if (problem) block('pr-gate', problem);
}

function flags(args) {
  const names = { '--title': 'title', '-t': 'title', '--base': 'base', '-B': 'base', '--head': 'head', '-H': 'head' };
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].split(/=(.*)/s);
    if (names[flag]) out[names[flag]] = inline ?? args[++i];
  }
  return out;
}
