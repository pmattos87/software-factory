// Factory hook: no commit or push on the integration or production branch.
// Branch names come from the project's .claude/factory.json.

import { readToolCall, block } from './lib/hook.mjs';
import { invocations } from './lib/shell.mjs';
import { git, repoRoot, currentBranch, branchExists } from './lib/git.mjs';
import { protectedBranches } from './lib/config.mjs';
import { parsePush } from './lib/push.mjs';

const { command, cwd } = readToolCall();
if (!/\bgit\b/.test(command)) process.exit(0);

// Tracks the branch each repo will be on as the command line runs, since an
// earlier `git checkout develop` changes where a later commit lands.
const branchIn = new Map();

for (const inv of invocations(command, cwd)) {
  if (inv.tool !== 'git') continue;
  const root = repoRoot(inv.dir);
  if (!root) continue;
  if (!branchIn.has(root)) branchIn.set(root, currentBranch(root));
  const protectedNames = protectedBranches(root);
  const onBranch = branchIn.get(root);

  if (inv.sub === 'checkout' || inv.sub === 'switch') {
    const target = checkoutTarget(inv.args, root);
    if (target) branchIn.set(root, target);
  } else if (inv.sub === 'commit') {
    if (protectedNames.includes(onBranch)) {
      block('protected-branches', `Commits never land on ${onBranch} directly. Commit on the Story's Feature branch (cut from the production branch) and let it reach ${onBranch} through a PR.`);
    }
  } else if (inv.sub === 'push') {
    const push = parsePush(inv.args);
    if (push.all) block('protected-branches', `git push --all/--mirror would push ${protectedNames.join(' and ')}. Push the Feature branch by name.`);
    // `git push --tags` with no refspec sends only tags, whatever branch it runs on.
    const targets = push.refspecs.length
      ? push.refspecs.map((r) => (r.dst === 'HEAD' ? onBranch : r.dst))
      : push.tags ? [] : [onBranch, upstreamName(root, onBranch)];
    const hit = targets.find((t) => protectedNames.includes(t));
    if (hit) block('protected-branches', `Pushes to ${hit} are not allowed. ${hit} only changes through PRs.`);
  }
}

function checkoutTarget(args, root) {
  const create = args.findIndex((a) => ['-b', '-B', '-c', '-C', '--orphan'].includes(a));
  if (create !== -1) return args[create + 1];
  const name = args.find((a) => !a.startsWith('-'));
  if (!name || args.includes('--')) return null;
  return branchExists(root, name) || protectedBranches(root).includes(name) ? name : null;
}

// The remote branch a bare `git push` would update, when an upstream is set.
function upstreamName(root, branch) {
  if (!branch) return null;
  return git(root, 'config', `branch.${branch}.merge`)?.replace(/^refs\/heads\//, '') ?? null;
}
