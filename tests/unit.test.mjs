import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { splitCommands, invocations } from '../plugin/scripts/lib/shell.mjs';
import { parsePush } from '../plugin/scripts/lib/push.mjs';
import { checkPullRequest, parseFeatureBranch } from '../plugin/scripts/lib/conventions.mjs';

test('splitCommands honors quotes and separators', () => {
  assert.deepEqual(splitCommands(`git add . && git commit -m "a && b; c" | cat; FOO=1 gh pr create -t 'x y'`), [
    ['git', 'add', '.'],
    ['git', 'commit', '-m', 'a && b; c'],
    ['cat'],
    ['gh', 'pr', 'create', '-t', 'x y'],
  ]);
});

test('invocations follow cd and git -C', () => {
  const root = path.resolve('/repo');
  const found = invocations('cd sub && git -C ../other push origin x', root);
  assert.equal(found[0].dir, path.resolve(root, 'other'));
  assert.equal(found[0].sub, 'push');
});

test('parsePush reads remotes, refspecs and deletes', () => {
  assert.deepEqual(parsePush(['-u', 'origin', 'feat/x']), { remote: 'origin', all: false, refspecs: [{ src: 'feat/x', dst: 'feat/x' }] });
  assert.deepEqual(parsePush(['origin', 'HEAD:refs/heads/develop']).refspecs, [{ src: 'HEAD', dst: 'develop' }]);
  assert.deepEqual(parsePush(['origin', ':main']).refspecs, [{ src: null, dst: 'main' }]);
  assert.deepEqual(parsePush(['origin', '--delete', 'main']).refspecs, [{ src: null, dst: 'main' }]);
  assert.equal(parsePush(['--mirror']).all, true);
});

const branches = { integration: 'develop', production: 'main' };
const pr = (over) => checkPullRequest({ boardKey: 'FB', branches, head: 'feat/FB-12-new-thing', base: 'develop', title: 'feat: new thing (FB-12)', subjects: ['feat(ui): add thing'], ...over });

test('a compliant Feature branch PR passes', () => {
  assert.deepEqual(pr({}), []);
  assert.deepEqual(pr({ base: 'release/v1.2.0' }), []);
  assert.deepEqual(parseFeatureBranch('fix/FB-3-x', 'FB'), { type: 'fix', story: 'FB-3' });
  assert.deepEqual(pr({ boardKey: ['FB', 'SF'], head: 'chore/SF-21-checks', title: 'chore: checks (SF-21)' }), []);
});

test('convention violations are reported', () => {
  assert.equal(pr({ head: 'feature/thing' }).length, 1);
  assert.equal(pr({ head: 'feat/HL-12-thing' }).length, 1);
  assert.equal(pr({ base: 'main' }).length, 1);
  assert.equal(pr({ title: 'feat: new thing' }).length, 1);
  assert.equal(pr({ title: 'feat: FB-123' }).length, 1);
  assert.equal(pr({ subjects: ['wip'] }).length, 1);
});

test('a Release branch goes only into production', () => {
  assert.deepEqual(pr({ head: 'release/v1.5.0', base: 'main', title: 'Release v1.5.0', subjects: ['wip'] }), []);
  assert.equal(pr({ head: 'release/v1.5.0', base: 'develop' }).length, 1);
});
