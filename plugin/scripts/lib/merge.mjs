// Reads the arguments of `gh pr merge`: which PR, which repo, which flags.

const SHORT = { m: 'merge', s: 'squash', r: 'rebase', d: 'delete-branch' };
const TAKES_VALUE = new Set(['body', 'b', 'body-file', 'F', 'subject', 't', 'author-email', 'A', 'match-head-commit', 'repo', 'R']);

// Returns { pr, repo, flags }, with flags by long name.
export function parseMerge(args) {
  const out = { pr: null, repo: null, flags: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [name, inline] = a.slice(2).split(/=(.*)/s);
      const value = TAKES_VALUE.has(name) && inline === undefined ? args[++i] : inline;
      if (name === 'repo') out.repo = value;
      else if (!TAKES_VALUE.has(name)) out.flags.push(name);
    } else if (a.startsWith('-') && a.length > 1) {
      const letters = a.slice(1);
      if (TAKES_VALUE.has(letters[0])) {
        const value = letters.length > 1 ? letters.slice(1) : args[++i];
        if (letters[0] === 'R') out.repo = value;
      } else {
        for (const l of letters) out.flags.push(SHORT[l] ?? l);
      }
    } else if (!out.pr) {
      out.pr = a;
    }
  }
  return out;
}
