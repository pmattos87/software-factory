import { git } from './git.mjs';

// Whether a Simplify pass left the Story exactly at the commit QA verified:
// no tracked or untracked change, and HEAD still the sha recorded before the
// hand-off. Returns { skip, reason }, or null when git can't be read.
export function checkNoop(dir, verified) {
  const status = git(dir, 'status', '--porcelain');
  const head = git(dir, 'rev-parse', 'HEAD');
  const want = verified && git(dir, 'rev-parse', '--verify', '--quiet', `${verified}^{commit}`);
  if (status === null || head === null) return null;
  if (!want) return { skip: false, reason: `${verified || '(none)'} is not a commit here: Verify it.` };
  if (status) return { skip: false, reason: `The tree has changes: Verify it.\n${status}` };
  if (head !== want) return { skip: false, reason: `HEAD moved from ${want} to ${head}: Verify it.` };
  return { skip: true, reason: `No change: tree clean, HEAD ${head} already verified` };
}
