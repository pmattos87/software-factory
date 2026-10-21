// The GitHub conventions a PR must follow (docs/spec/issues/06-github-conventions.md).
// Used by the PR gate hook and by the conventions check in Actions.

export const TYPES = ['feat', 'fix', 'docs', 'chore', 'refactor', 'test', 'perf', 'build', 'ci', 'style', 'revert'];

const RELEASE_BRANCH = /^release\/v\d+\.\d+\.\d+$/;
const COMMIT_SUBJECT = new RegExp(`^(${TYPES.join('|')})(\\([^)]+\\))?!?: \\S`);

export const isReleaseBranch = (name) => RELEASE_BRANCH.test(name);

// Parses `<type>/<KEY>-<n>-<slug>`; returns { type, story } or null.
// `boardKey` is a key or a list of them (a repo may host work of several boards).
export function parseFeatureBranch(name, boardKey) {
  const keys = [boardKey].flat().join('|');
  const m = new RegExp(`^(${TYPES.join('|')})/((?:${keys})-\\d+)-[a-z0-9]+(-[a-z0-9]+)*$`).exec(name);
  return m ? { type: m[1], story: m[2] } : null;
}

// Returns the list of convention violations of a PR; empty when it complies.
// `subjects` are the subjects of the PR's non-merge commits.
export function checkPullRequest({ boardKey, branches, head, base, title, subjects }) {
  const keys = [boardKey].flat().join('|');
  const problems = [];

  if (isReleaseBranch(head)) {
    if (base !== branches.production) {
      problems.push(`A Release branch is PR'd into ${branches.production} only, not ${base}.`);
    }
    return problems;
  }

  const feature = parseFeatureBranch(head, boardKey);
  if (!feature) {
    problems.push(
      `Branch "${head}" doesn't follow <type>/<${keys}>-<n>-<slug> ` +
        `(type one of ${TYPES.join(', ')}; slug lowercase words joined by "-").`,
    );
  }
  if (base !== branches.integration && !isReleaseBranch(base)) {
    problems.push(
      `A Feature branch is PR'd into ${branches.integration} or a release/vX.Y.Z branch, not ${base || '(no base given)'}.`,
    );
  }
  if (feature && !new RegExp(`\\b${feature.story}\\b`).test(title ?? '')) {
    problems.push(`The PR title must carry the Story key ${feature.story}.`);
  }
  for (const s of subjects) {
    if (!COMMIT_SUBJECT.test(s)) problems.push(`Commit "${s}" isn't a conventional commit (type(scope): description).`);
  }
  return problems;
}
