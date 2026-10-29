import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitCommands, invocations } from '../plugin/scripts/lib/shell.mjs';
import { parsePush } from '../plugin/scripts/lib/push.mjs';
import { checkPullRequest, parseFeatureBranch, checkMerge } from '../plugin/scripts/lib/conventions.mjs';
import { parseMerge } from '../plugin/scripts/lib/merge.mjs';
import { checkSpecialist, checkTierOverrides, ROLE_AGENTS } from '../plugin/scripts/lib/specialists.mjs';
import { releaseSettings, readVersion, checkRelease } from '../plugin/scripts/lib/release.mjs';
import { bumpKind, nextVersion, setVersion, setLockedVersion } from '../plugin/scripts/lib/version.mjs';
import { findCodex, buildPrompt, codexArgs, readEvents, checkVerdict, SCHEMA } from '../plugin/scripts/lib/review.mjs';
import { mergedBranch, parseLog, unreleasedOverlap, readUnreleased } from '../plugin/scripts/lib/unreleased.mjs';
import { git } from '../plugin/scripts/lib/git.mjs';
import { checkNoop } from '../plugin/scripts/lib/noop.mjs';
import { assembleChangelog, sortKeys } from '../plugin/scripts/lib/changelog.mjs';
import { spawnSync } from 'node:child_process';

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
  assert.deepEqual(parsePush(['-u', 'origin', 'feat/x']), { remote: 'origin', all: false, tags: false, refspecs: [{ src: 'feat/x', dst: 'feat/x' }] });
  assert.deepEqual(parsePush(['origin', 'HEAD:refs/heads/develop']).refspecs, [{ src: 'HEAD', dst: 'develop' }]);
  assert.deepEqual(parsePush(['origin', ':main']).refspecs, [{ src: null, dst: 'main' }]);
  assert.deepEqual(parsePush(['origin', '--delete', 'main']).refspecs, [{ src: null, dst: 'main' }]);
  assert.equal(parsePush(['--mirror']).all, true);
});

const branches = { integration: 'develop', production: 'main' };
const pr = (over) => checkPullRequest({ boardKey: 'FB', branches, head: 'feat/FB-12-new-thing', base: 'develop', title: 'feat: new thing (FB-12)', subjects: ['feat(ui): add thing'], ...over });

test('a compliant Feature branch PR passes', () => {
  assert.deepEqual(pr({}), []);
  assert.deepEqual(parseFeatureBranch('fix/FB-3-x', 'FB'), { type: 'fix', story: 'FB-3' });
  assert.deepEqual(pr({ boardKey: ['FB', 'SF'], head: 'chore/SF-21-checks', title: 'chore: checks (SF-21)' }), []);
});

test('convention violations are reported', () => {
  assert.equal(pr({ head: 'feature/thing' }).length, 1);
  assert.equal(pr({ head: 'feat/HL-12-thing' }).length, 1);
  assert.equal(pr({ base: 'main' }).length, 1);
  assert.match(pr({ base: 'release/v1.2.0' })[0], /PR'd into develop only/);
  assert.equal(pr({ title: 'feat: new thing' }).length, 1);
  assert.equal(pr({ title: 'feat: FB-123' }).length, 1);
  assert.equal(pr({ subjects: ['wip'] }).length, 1);
});

test('a Release branch goes only into production, with its version in the title', () => {
  const release = (over) => pr({ head: 'release/v1.5.0', base: 'main', title: 'Release v1.5.0', subjects: ['chore(release): v1.5.0', 'feat(ui): add thing'], ...over });
  assert.deepEqual(release({}), []);
  assert.deepEqual(release({ base: 'develop' }), ["A Release branch is PR'd into main only, not develop."]);
  assert.deepEqual(release({ title: 'Release v1.5.1' }), ['The PR title must carry the Release version v1.5.0.']);
  assert.deepEqual(release({ title: 'Release 1.5.0' }), ['The PR title must carry the Release version v1.5.0.']);
  assert.equal(release({ subjects: ['wip'] }).length, 1);
});

test('parsePush notes a tags-only push', () => {
  assert.deepEqual(parsePush(['origin', '--tags']), { remote: 'origin', all: false, tags: true, refspecs: [] });
  assert.equal(parsePush(['origin', 'v1.6.0']).tags, false);
});

test('parseMerge reads the PR, repo and flags', () => {
  assert.deepEqual(parseMerge(['https://github.com/o/r/pull/7', '--merge']), { pr: 'https://github.com/o/r/pull/7', repo: null, flags: ['merge'] });
  assert.deepEqual(parseMerge(['7', '-sd', '-R', 'o/r', '--subject', 'x y']), { pr: '7', repo: 'o/r', flags: ['squash', 'delete-branch'] });
  assert.deepEqual(parseMerge(['--body=a', '--auto', '-m']), { pr: null, repo: null, flags: ['auto', 'merge'] });
});

test('a merge uses a merge commit, keeps the branch and stays out of production', () => {
  const merge = (flags, base = 'develop') => checkMerge({ branches, flags, base });
  assert.deepEqual(merge(['merge']), []);
  assert.deepEqual(merge(['merge', 'auto'], 'release/v1.2.0'), []);
  assert.equal(merge(['merge'], 'main').length, 1);
  assert.equal(merge(['squash']).length, 1);
  assert.equal(merge(['rebase']).length, 1);
  assert.equal(merge([]).length, 1);
  assert.equal(merge(['merge', 'delete-branch']).length, 1);
  assert.equal(merge(['merge', 'admin']).length, 1);
});

const specialist = (fm, body = '## Scope\nx\n\n## Definition of done\n- y\n') => checkSpecialist('/p/.claude/agents/board-ui.md', `---\n${fm}\n---\n${body}`);

test('a Specialist that follows the contract passes', () => {
  assert.deepEqual(specialist('name: board-ui\ndescription: Builds the board\nmodel: sonnet'), []);
  assert.deepEqual(specialist('name: "board-ui"\r\ndescription: x\r\nmodel: opus', '## Scope\r\n## Definition of Done\r\n'), []);
});

test('Specialist contract violations are reported', () => {
  assert.equal(specialist('name: other\ndescription: x\nmodel: sonnet').length, 1);
  assert.equal(specialist('name: board-ui\nmodel: sonnet').length, 1);
  assert.equal(specialist('name: board-ui\ndescription: x\nmodel: claude-sonnet-4-6').length, 1);
  assert.equal(specialist('name: board-ui\ndescription: x').length, 1);
  assert.equal(specialist('name: board-ui\ndescription: x\nmodel: sonnet', '## Scope\n**Definition of Done:** y').length, 1);
  assert.deepEqual(checkSpecialist('qa.md', 'no frontmatter'), ['no frontmatter block']);
  assert.equal(checkSpecialist('/a/qa.md', '---\nname: qa\ndescription: x\nmodel: opus\n---\n## Scope\n## Definition of done\n').length, 1);
});

test('tier overrides name an agent, an alias and a reason', () => {
  assert.deepEqual(checkTierOverrides({ implementer: { model: 'opus', reason: 'stops' }, 'board-ui': { model: 'haiku', reason: 'x' } }, ['board-ui']), []);
  assert.deepEqual(checkTierOverrides({ implementer: { model: 'claude-opus-5-5', reason: 'x' } })[0].problems.length, 1);
  assert.deepEqual(checkTierOverrides({ qa: { model: 'sonnet' } })[0].problems, ['a reason is required']);
  assert.deepEqual(checkTierOverrides({ ghost: { model: 'opus', reason: 'x' } })[0].problems, ['no such agent']);
  assert.deepEqual(checkTierOverrides({ simplify: { model: 'opus', reason: 'x' } }), []);
});

test('the Role agents list matches the agents the plugin ships', () => {
  const shipped = fs.readdirSync(new URL('../plugin/agents/', import.meta.url)).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
  assert.deepEqual([...ROLE_AGENTS].sort(), shipped.sort());
  assert.equal(checkSpecialist('/a/simplify.md', '---\nname: simplify\ndescription: x\nmodel: sonnet\n---\n## Scope\n## Definition of done\n').length, 1);
});

test('readVersion reads JSON files and the [package] section of Cargo.toml', () => {
  assert.equal(readVersion('package.json', '{"name":"x","version":"1.5.1"}'), '1.5.1');
  assert.equal(readVersion('src-tauri/Cargo.toml', '[package]\nname = "x"\nversion = "1.5.1"\n\n[dependencies]\nserde = { version = "1" }\n'), '1.5.1');
  assert.equal(readVersion('Cargo.toml', '[workspace]\nmembers = []\n'), null);
  assert.equal(readVersion('notes.json', '{'), null);
});

test('release settings are checked against the project files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-release-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"version":"1.5.1"}');
  fs.writeFileSync(path.join(root, 'Cargo.toml'), '[package]\nversion = "1.5.1"\n');
  const check = (raw, opts) => checkRelease(root, releaseSettings(raw), opts);

  assert.deepEqual(check({ versionFiles: ['package.json', 'Cargo.toml'], assets: { build: ['npm run dist'], files: ['dist/*.zip'] } }), []);
  assert.deepEqual(check({}), ['release.versionFiles is empty: name the files that carry the version']);
  assert.deepEqual(check({ versionFiles: ['missing.json'] }), ["missing.json doesn't exist"]);
  assert.deepEqual(check({ versionFiles: ['package.json'], assets: { files: ['x'] } }), ['release.assets.files is set but release.assets.build is empty: nothing would produce them']);

  fs.writeFileSync(path.join(root, 'Cargo.toml'), '[package]\nversion = "1.4.0"\n');
  assert.match(check({ versionFiles: ['package.json', 'Cargo.toml'] })[0], /disagree: package.json 1.5.1, Cargo.toml 1.4.0/);

  assert.equal(check({ versionFiles: ['package.json'] }, { client: true }).length, 3);
  const notes = { client: 'Eduardo & Luli', language: 'pt-BR', staging: 'npm run dev:staging' };
  assert.deepEqual(check({ versionFiles: ['package.json'], notes }, { client: true }), []);
  assert.deepEqual(check({ versionFiles: ['package.json'], notes: { ...notes, guide: 'docs/release-notes.md' } }, { client: true }), ["release.notes.guide docs/release-notes.md doesn't exist"]);
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs/release-notes.md'), '# Deck style\n');
  assert.deepEqual(check({ versionFiles: ['package.json'], notes: { ...notes, guide: 'docs/release-notes.md' } }, { client: true }), []);
});

test('the next version follows the commit types', () => {
  assert.equal(bumpKind(['fix(ui): x', 'docs: y']), 'patch');
  assert.equal(bumpKind(['fix: x', 'feat(board): y\n\nbody']), 'minor');
  assert.equal(bumpKind(['feat(api)!: drop v1']), 'major');
  assert.equal(bumpKind(['fix: x\n\nBREAKING CHANGE: the CLI renames move']), 'major');
  assert.equal(nextVersion('1.5.1', 'patch'), '1.5.2');
  assert.equal(nextVersion('1.5.1', 'minor'), '1.6.0');
  assert.equal(nextVersion('1.5.1', 'major'), '2.0.0');
});

test('setVersion edits only the version, keeping the format', () => {
  const pkg = '{\n  "name": "x",\n  "version": "1.5.1",\n  "dependencies": {\n    "y": "1.5.1"\n  }\n}\n';
  assert.equal(setVersion('package.json', pkg, '1.6.0'), pkg.replace('"version": "1.5.1"', '"version": "1.6.0"'));

  const lock = '{\n  "name": "x",\n  "version": "1.5.1",\n  "packages": {\n    "": {\n      "name": "x",\n      "version": "1.5.1"\n    },\n    "node_modules/y": {\n      "version": "1.5.1"\n    }\n  }\n}\n';
  const out = JSON.parse(setVersion('package-lock.json', lock, '1.6.0'));
  assert.deepEqual([out.version, out.packages[''].version, out.packages['node_modules/y'].version], ['1.6.0', '1.6.0', '1.5.1']);

  const cargo = '[package]\nname = "app"\nversion = "1.5.1"\n\n[dependencies]\nserde = { version = "1.5.1" }\n';
  assert.equal(setVersion('src-tauri/Cargo.toml', cargo, '1.6.0'), cargo.replace('version = "1.5.1"\n\n', 'version = "1.6.0"\n\n'));

  const cargoLock = '[[package]]\nname = "aaa"\nversion = "1.5.1"\n\n[[package]]\nname = "app"\nversion = "1.5.1"\n';
  assert.equal(setLockedVersion(cargoLock, 'app', '1.6.0'), '[[package]]\nname = "aaa"\nversion = "1.5.1"\n\n[[package]]\nname = "app"\nversion = "1.6.0"\n');
  assert.throws(() => setVersion('notes.json', '{}', '1.6.0'), /carries no version/);
});

test('the Review verdict schema is strict, as codex --output-schema requires', () => {
  const schema = JSON.parse(fs.readFileSync(new URL('../plugin/review/verdict.schema.json', import.meta.url), 'utf8'));
  const walk = (node, at) => {
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false, `${at} allows extra properties`);
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort(), `${at} leaves a property optional`);
      for (const [k, v] of Object.entries(node.properties)) walk(v, `${at}.${k}`);
    }
    if (node.type === 'array') walk(node.items, `${at}[]`);
  };
  walk(schema, 'verdict');
  assert.deepEqual(schema.properties.verdict.enum, ['passed', 'failed']);
});

test('findCodex prefers FACTORY_CODEX, then PATH, then the newest VS Code extension', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-'));
  const exe = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const put = (...p) => { const f = path.join(dir, ...p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, ''); return f; };
  const old = put('home/.vscode/extensions/openai.chatgpt-1/bin/win/', exe);
  const newer = put('home/.vscode/extensions/openai.chatgpt-2/bin/win/', exe);
  fs.utimesSync(old, new Date(1000), new Date(1000));
  const home = path.join(dir, 'home');
  assert.equal(findCodex({ env: {}, home }), newer);
  const onPath = put('bin', exe);
  assert.equal(findCodex({ env: { PATH: path.join(dir, 'bin') }, home }), onPath);
  assert.equal(findCodex({ env: { FACTORY_CODEX: old, PATH: path.join(dir, 'bin') }, home }), old);
  assert.equal(findCodex({ env: { FACTORY_CODEX: path.join(dir, 'nope') }, home }), null);
  assert.equal(findCodex({ env: {}, home: path.join(dir, 'empty') }), null);
});

test('round 1 carries the standard; a resumed round sends only the request', () => {
  assert.match(buildPrompt('REQ', { standard: 'STD' }), /^STD[\s\S]*# Review request\n\nREQ/);
  assert.equal(buildPrompt('REQ', { resume: true, standard: 'STD' }), 'REQ');
  const args = codexArgs({ resume: 'abc', verdictFile: 'v.json' });
  assert.deepEqual(args.slice(0, 3), ['exec', 'resume', 'abc']);
  assert.ok(args.includes('sandbox_mode="read-only"') && args.includes(SCHEMA));
  assert.ok(!codexArgs({ verdictFile: 'v.json' }).includes('resume'));
});

test('readEvents finds the session and the errors', () => {
  const jsonl = ['{"type":"thread.started","thread_id":"t-1"}', 'noise', '{"type":"turn.failed","error":{"message":"quota"}}'].join('\n');
  assert.deepEqual(readEvents(jsonl), { session: 't-1', errors: ['quota'] });
});

test('a verdict must be coherent and on the reviewed head', () => {
  const head = 'abcdef1234567890';
  const ok = { commit: head, verdict: 'passed', blocking: [] };
  assert.deepEqual(checkVerdict(ok, head), []);
  assert.deepEqual(checkVerdict({ ...ok, commit: 'abcdef1' }, head), []);
  assert.match(checkVerdict({ ...ok, commit: '999' }, head).join(), /not abcdef/);
  assert.match(checkVerdict({ ...ok, blocking: [{}] }, head).join(), /passed with 1/);
  assert.match(checkVerdict({ ...ok, verdict: 'failed' }, head).join(), /failed with 0/);
  assert.deepEqual(checkVerdict(null, head), ['no verdict JSON']);
});

test('mergedBranch reads PR merges and plain merges', () => {
  assert.equal(mergedBranch('Merge pull request #85 from pmattos87/feat/FB-124-live-refresh'), 'feat/FB-124-live-refresh');
  assert.equal(mergedBranch("Merge branch 'fix/FB-9-x' into develop"), 'fix/FB-9-x');
  assert.equal(mergedBranch('feat(ui): not a merge'), null);
});

test('parseLog reads commits and their files', () => {
  assert.deepEqual(parseLog('\0abc1234 feat: one\n\na.ts\nb/c.ts\n\0def5678 fix: two\n\n'), [
    { hash: 'abc1234', subject: 'feat: one', files: ['a.ts', 'b/c.ts'] },
    { hash: 'def5678', subject: 'fix: two', files: [] },
  ]);
});

test('unreleased work is grouped by Story and kept only where it overlaps', () => {
  const entries = [
    { hash: 'm1', subject: 'Merge pull request #1 from o/feat/FB-1-board', commits: [{ hash: 'a1', subject: 'feat: a', files: ['src/a.ts'] }] },
    { hash: 'm2', subject: 'Merge pull request #2 from o/feat/FB-1-board-merge', commits: [{ hash: 'a2', subject: 'fix: a', files: ['src/b.ts'] }] },
    { hash: 'm3', subject: 'Merge pull request #3 from o/feat/FB-2-other', commits: [{ hash: 'b1', subject: 'feat: b', files: ['src/z.ts'] }] },
    { hash: 'c1', subject: 'chore: direct', commits: [{ hash: 'c1', subject: 'chore: direct', files: ['src/a.ts'] }] },
  ];
  const found = unreleasedOverlap(entries, ['src\\a.ts', './src/b.ts'], ['FB']);
  assert.deepEqual(found.map((g) => [g.story, g.files, g.commits.map((c) => c.hash)]), [
    ['FB-1', ['src/a.ts', 'src/b.ts'], ['a1', 'a2']],
    [null, ['src/a.ts'], ['c1']],
  ]);
  assert.equal(found[1].hash, 'c1');
  assert.deepEqual(unreleasedOverlap(entries, ['src/none.ts'], ['FB']), []);
});

test('readUnreleased reads only what the integration branch has that production lacks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-unreleased-'));
  const commit = (file, msg) => {
    fs.writeFileSync(path.join(dir, file), msg);
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', msg);
  };
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  commit('base.txt', 'chore: init');
  git(dir, 'switch', '-q', '-c', 'develop');
  git(dir, 'switch', '-q', '-c', 'feat/FB-7-thing', 'main');
  commit('thing.txt', 'feat: thing');
  git(dir, 'switch', '-q', 'develop');
  git(dir, 'merge', '-q', '--no-ff', 'feat/FB-7-thing', '-m', 'Merge pull request #7 from o/feat/FB-7-thing');
  commit('direct.txt', 'chore: direct');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'main');
  git(dir, 'update-ref', 'refs/remotes/origin/develop', 'develop');

  const entries = readUnreleased(dir, { production: 'main', integration: 'develop' });
  const found = unreleasedOverlap(entries, ['thing.txt', 'direct.txt', 'base.txt'], 'FB');
  assert.deepEqual(found.map((g) => [g.story, g.files]), [[null, ['direct.txt']], ['FB-7', ['thing.txt']]]);
  assert.equal(readUnreleased(dir, { production: 'main', integration: 'nope' }), null);
});

test('checkNoop skips Verify only for a clean tree at the verified sha', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-noop-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'feat: a');
  const verified = git(dir, 'rev-parse', 'HEAD');

  assert.deepEqual(checkNoop(dir, verified), { skip: true, reason: `No change: tree clean, HEAD ${verified} already verified` });

  fs.writeFileSync(path.join(dir, 'a.txt'), 'changed');
  assert.equal(checkNoop(dir, verified).skip, false);
  git(dir, 'checkout', '-q', '--', 'a.txt');

  fs.writeFileSync(path.join(dir, 'new.txt'), 'untracked');
  assert.match(checkNoop(dir, verified).reason, /new\.txt/);
  fs.rmSync(path.join(dir, 'new.txt'));

  fs.writeFileSync(path.join(dir, 'b.txt'), 'b');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'feat: b');
  assert.match(checkNoop(dir, verified).reason, /HEAD moved/);

  assert.equal(checkNoop(dir, 'deadbeef').skip, false);
  assert.equal(checkNoop(dir, undefined).skip, false);
  assert.equal(checkNoop(path.join(dir, 'missing'), verified), null);
});


test('assembleChangelog rebuilds the version section from exactly the current picks', () => {
  const changelog = [
    '# App - Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Fixed',
    '- Old fix still unreleased (FB-3).',
    '',
    '## [1.0.0] - 2026-10-01',
    '',
    '### Added',
    '- First release.',
    '',
  ].join('\n');
  const stories = [
    { key: 'FB-10', text: '### Changed\n- Ten changed.\n\n### Added\n- Ten added.\n' },
    { key: 'FB-9', text: '### Added\n- Nine added.\n' },
  ];
  const first = assembleChangelog(changelog, '1.1.0', '2026-10-30', stories);
  assert.equal(first.unreleased, '### Fixed\n- Old fix still unreleased (FB-3).');
  assert.equal(first.text, [
    '# App - Changelog',
    '',
    '## [Unreleased]',
    '',
    '## [1.1.0] - 2026-10-30',
    '',
    '### Added',
    '- Nine added.',
    '- Ten added.',
    '',
    '### Changed',
    '- Ten changed.',
    '',
    '### Fixed',
    '- Old fix still unreleased (FB-3).',
    '',
    '## [1.0.0] - 2026-10-01',
    '',
    '### Added',
    '- First release.',
    '',
  ].join('\n'));

  // A sync: FB-10's fragment was updated, FB-9 was removed, FB-2 (a lower key) was added.
  // The leftover comes back from its file; nothing is duplicated or kept from the old section.
  const synced = assembleChangelog(first.text, '1.1.0', '2026-10-31', [
    { key: 'FB-10', text: '### Added\n- Ten added, corrected.\n' },
    { key: 'FB-2', text: '### Added\n- Two added.\n' },
  ], first.unreleased);
  assert.equal(synced.unreleased, '');
  const section = synced.text.slice(synced.text.indexOf('## [1.1.0]'), synced.text.indexOf('## [1.0.0]'));
  assert.equal(section, '## [1.1.0] - 2026-10-31\n\n### Added\n- Two added.\n- Ten added, corrected.\n\n### Fixed\n- Old fix still unreleased (FB-3).\n\n');
  assert.equal((synced.text.match(/## \[1\.1\.0\]/g) ?? []).length, 1);

  assert.match(assembleChangelog(changelog.replace(/\n/g, '\r\n'), '1.1.0', '2026-10-30', stories).text, /\r\n## \[1\.1\.0\] - 2026-10-30\r\n/);
  assert.throws(() => assembleChangelog(changelog, '1.1.0', '2026-10-30', [{ key: 'FB-1', text: '- no heading\n' }]), /docs\/changes\/FB-1\.md/);
  assert.deepEqual(sortKeys(['FB-10', 'SF-2', 'FB-9']), ['FB-9', 'FB-10', 'SF-2']);
});

test('release-version changelog rebuilds the section, keeps the files and reports missing picks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-changelog-'));
  const run = (...args) => spawnSync('node', [path.resolve(import.meta.dirname, '../plugin/scripts/release-version.mjs'), ...args], { cwd: root, encoding: 'utf8' });
  const changes = (f) => path.join(root, 'docs/changes', f);
  const log = () => fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  fs.mkdirSync(path.join(root, '.claude'));
  fs.mkdirSync(path.join(root, 'docs/changes'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude/factory.json'), JSON.stringify({ boardKey: 'FB' }));
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# C\n\n## [Unreleased]\n\n### Fixed\n- Old (FB-3).\n');
  fs.writeFileSync(changes('FB-1.md'), '### Added\n- One.\n');

  let r = run('changelog', '1.0.0', 'FB-1');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No release\.changelog/);
  assert.match(log(), /## \[Unreleased\]\n\n### Fixed\n- Old \(FB-3\)\.\n$/);

  fs.writeFileSync(path.join(root, '.claude/factory.json'), JSON.stringify({ boardKey: 'FB', release: { changelog: 'CHANGELOG.md' } }));
  r = run('changelog', '1.0.0', 'FB-1', 'FB-2');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^missing FB-2$/m);
  assert.ok(fs.existsSync(changes('FB-1.md')));
  assert.equal(fs.readFileSync(changes('unreleased-v1.0.0.md'), 'utf8'), '### Fixed\n- Old (FB-3).\n');
  assert.match(log(), /## \[Unreleased\]\n\n## \[1\.0\.0\] - \d{4}-\d{2}-\d{2}\n\n### Added\n- One\.\n\n### Fixed\n- Old \(FB-3\)\.\n/);

  // FB-1 dropped from the pick, FB-2 added: the rerun keeps the leftover and nothing of FB-1.
  fs.writeFileSync(changes('FB-2.md'), '### Changed\n- Two.\n');
  r = run('changelog', '1.0.0', 'FB-2');
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(log(), /- One\./);
  assert.match(log(), /## \[1\.0\.0\] - \d{4}-\d{2}-\d{2}\n\n### Changed\n- Two\.\n\n### Fixed\n- Old \(FB-3\)\.\n/);
  assert.equal(fs.readFileSync(changes('unreleased-v1.0.0.md'), 'utf8'), '### Fixed\n- Old (FB-3).\n');
});
