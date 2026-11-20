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
import { releaseSettings, readVersion, checkRelease, assetSets, assetPatterns } from '../plugin/scripts/lib/release.mjs';
import { releaseFolder, projectFolder, userConfigPath, loadUserConfig, checkReleasesRoot, checkDocuments } from '../plugin/scripts/lib/releases.mjs';
import { checkEnvironments, expandPath } from '../plugin/scripts/lib/environments.mjs';
import { bumpKind, nextVersion, setVersion, setLockedVersion } from '../plugin/scripts/lib/version.mjs';
import { findCodex, buildPrompt, codexArgs, readEvents, checkVerdict, SCHEMA } from '../plugin/scripts/lib/review.mjs';
import { mergedBranch, parseLog, unreleasedOverlap, readUnreleased } from '../plugin/scripts/lib/unreleased.mjs';
import { git } from '../plugin/scripts/lib/git.mjs';
import { checkNoop } from '../plugin/scripts/lib/noop.mjs';
import { loadConfig, normalizeGates } from '../plugin/scripts/lib/config.mjs';
import { matchEnvironment, failingTests, rerunCommand } from '../plugin/scripts/lib/environment.mjs';
import { scopeGate, quote, under, changedFiles } from '../plugin/scripts/lib/scope.mjs';
import { treeKey, matchingEvidence, readEvidence, toolchain, fileModes, untrackedMode } from '../plugin/scripts/lib/gate-evidence.mjs';
import { assembleChangelog, sortKeys } from '../plugin/scripts/lib/changelog.mjs';
import { spawnSync } from 'node:child_process';
import { findBrowser, browserCandidates, printArgs, printPdf } from '../plugin/scripts/lib/browser.mjs';
import { inlineAssets, remoteRefs, unfilledSlots, srcsetCandidates } from '../plugin/scripts/lib/inline.mjs';

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
  const check = (raw, opts) => checkRelease(root, releaseSettings(raw), opts && { environments: CLIENT_ENVIRONMENTS, env: TEST_ENV, ...opts });

  assert.deepEqual(check({ versionFiles: ['package.json', 'Cargo.toml'], assets: { build: ['npm run dist'], files: ['dist/*.zip'] } }), []);
  assert.deepEqual(check({}), ['release.versionFiles is empty: name the files that carry the version']);
  assert.deepEqual(check({ versionFiles: ['missing.json'] }), ["missing.json doesn't exist"]);
  assert.deepEqual(check({ versionFiles: ['package.json'], assets: { files: ['x'] } }), ['release.assets.files is set but release.assets.build is empty: nothing would produce them']);

  fs.writeFileSync(path.join(root, 'Cargo.toml'), '[package]\nversion = "1.4.0"\n');
  assert.match(check({ versionFiles: ['package.json', 'Cargo.toml'] })[0], /disagree: package.json 1.5.1, Cargo.toml 1.4.0/);

  assert.deepEqual(check({ versionFiles: ['package.json'], assets: CLIENT_ASSETS }, { client: true }), ['release.notes.client is required on a Client project', 'release.notes.language is required on a Client project']);
  const notes = { client: 'Eduardo & Luli', language: 'pt-BR' };
  const client = { versionFiles: ['package.json'], assets: CLIENT_ASSETS, notes };
  assert.deepEqual(check(client, { client: true }), []);
  // staging moved to environments.release.launch.
  assert.deepEqual(check({ ...client, notes: { ...notes, staging: 'npm run dev:staging' } }, { client: true }), ['release.notes.staging is replaced by environments.release.launch: move it there (screenshots and dry runs run on the release environment)']);
  assert.equal(check(client, { client: true, environments: {} }).length, 2);
  assert.deepEqual(check({ ...client, notes: { ...notes, guide: 'docs/release-notes.md' } }, { client: true }), ["release.notes.guide docs/release-notes.md doesn't exist"]);
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs/release-notes.md'), '# Deck style\n');
  assert.deepEqual(check({ ...client, notes: { ...notes, guide: 'docs/release-notes.md' } }, { client: true }), []);
});

const TEST_ENV = { APPDATA: path.join(os.tmpdir(), 'AppData', 'Roaming') };
const CLIENT_ENVIRONMENTS = {
  integration: { launch: 'npm run dev:integration', data: '%APPDATA%/App/integration' },
  release: { build: ['npm run build:staging'], launch: 'App - Testes.exe', data: '%APPDATA%/App/testes' },
};

const CLIENT_ASSETS = {
  beta: { build: ['npm ci', 'npm run build:staging'], files: ['nsis/App - Testes_<version>_*-setup.exe'] },
  production: { build: ['npm ci', 'npx tauri build'], files: ['nsis/App_<version>_*-setup.exe'] },
};

test('a Client project needs a beta and a production asset set, each with versioned files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-assets-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"version":"1.5.1"}');
  const notes = { client: 'Eduardo & Luli', language: 'pt-BR' };
  const check = (assets, client = true) => checkRelease(root, releaseSettings({ versionFiles: ['package.json'], assets, notes }), { client, environments: CLIENT_ENVIRONMENTS, env: TEST_ENV });
  const { beta, production } = CLIENT_ASSETS;
  const required = (name) => `release.assets.${name} is required on a Client project: betas ship the beta set, the final Release the production set`;

  assert.deepEqual(check({ beta, production }), []);
  assert.deepEqual(check({ production }), [required('beta')]);
  assert.deepEqual(check({ beta }), [required('production')]);
  assert.deepEqual(check({ beta: { ...beta, files: ['nsis/*-setup.exe'] }, production }), ['release.assets.beta.files pattern nsis/*-setup.exe has no <version>: it would match the files of every version built']);
  assert.deepEqual(check({ beta, production: { files: production.files } }), ['release.assets.production.files is set but release.assets.production.build is empty: nothing would produce them']);
  assert.deepEqual(check({ beta: { build: beta.build }, production }), ['release.assets.beta.files is empty on a Client project: name the files it ships']);

  // The old single set on a Client project is only the production set, and unversioned.
  assert.deepEqual(check({ build: ['npx tauri build'], files: ['nsis/*-setup.exe'] }), [
    required('beta'),
    'release.assets.files pattern nsis/*-setup.exe has no <version>: it would match the files of every version built',
  ]);
  // An Internal project keeps the old single set, unversioned, as before.
  assert.deepEqual(check({ build: ['npx tauri build'], files: ['nsis/*-setup.exe'] }, false), []);
});

test('a Client project keeps integration testing and user testing on separate data folders', () => {
  const root = path.resolve(os.tmpdir(), 'repo');
  const env = { APPDATA: 'C:\\Users\\p\\AppData\\Roaming', LocalAppData: 'C:\\Users\\p\\AppData\\Local', USERPROFILE: 'C:\\Users\\p' };
  const check = (environments) => checkEnvironments(environments, root, env);
  const integration = { launch: 'npm run dev:integration', data: '%APPDATA%\\HammerLoc\\integracao' };
  const release = { build: ['npm run build:staging'], launch: 'Hammer Loc - Testes.exe', data: '%APPDATA%\\HammerLoc\\testes' };

  assert.deepEqual(check({ integration, release }), []);
  assert.deepEqual(check({ release }), ["environments.integration is required on a Client project: integration testing and the client's betas never share a data folder"]);
  assert.deepEqual(check({}).length, 2);
  assert.deepEqual(check({ integration: { launch: 'x' }, release }), ['environments.integration.data is required: the folder that holds its database']);
  assert.deepEqual(check({ integration: { data: 'a' }, release }), ['environments.integration.launch is required: the command or URL that starts it']);
  assert.deepEqual(check({ integration: { ...integration, build: 'npm run build' }, release }), ['environments.integration.build must be a list of commands']);

  // The same folder, however it is spelled: case, separators, a trailing slash, an env var.
  const same = 'environments.integration.data and environments.release.data are the same folder';
  assert.match(check({ integration: { ...integration, data: 'C:/Users/P/appdata/roaming/HammerLoc/Testes/' }, release })[0], new RegExp(same));
  assert.match(check({ integration: { ...integration, data: '%appdata%\\HammerLoc\\testes' }, release })[0], new RegExp(same));
  assert.match(check({ integration: { ...integration, data: '~\\AppData\\Roaming\\HammerLoc\\testes' }, release })[0], new RegExp(same));
  // One inside the other.
  assert.match(check({ integration: { ...integration, data: '%APPDATA%\\HammerLoc' }, release })[0], /are nested: one is inside the other/);
  assert.match(check({ integration, release: { ...release, data: '%APPDATA%\\HammerLoc\\integracao\\beta' } })[0], /are nested/);
  // A prefix that isn't a parent folder is apart.
  assert.deepEqual(check({ integration: { ...integration, data: '%APPDATA%\\HammerLoc\\testes-integracao' }, release }), []);
  // Relative folders resolve against the repo root.
  assert.match(check({ integration: { ...integration, data: 'data' }, release: { ...release, data: path.join(root, 'data') } })[0], new RegExp(same));
  assert.deepEqual(check({ integration: { ...integration, data: '%NOPE%\\x' }, release }), ["environments.integration.data %NOPE%\\x uses %NOPE%, which isn't set on this machine"]);

  assert.deepEqual(expandPath('%LOCALAPPDATA%\\x', env), { path: 'C:\\Users\\p\\AppData\\Local\\x' });
  assert.deepEqual(expandPath('~/x', env), { path: 'C:\\Users\\p/x' });
  assert.deepEqual(expandPath('a~b', env), { path: 'a~b' });
});

test('check-release --client refuses environments that share a data folder', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-environments-'));
  fs.mkdirSync(path.join(base, 'Releases'));
  fs.writeFileSync(path.join(base, 'user.json'), JSON.stringify({ releasesRoot: path.join(base, 'Releases') }));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'package.json'), '{"version":"1.6.0"}');
  const write = (environments) => fs.writeFileSync(path.join(repo, '.claude/factory.json'), JSON.stringify({
    boardKey: 'HL',
    environments,
    release: { versionFiles: ['package.json'], assets: CLIENT_ASSETS, notes: { client: 'Eduardo & Luli', language: 'pt-BR' } },
  }));
  const run = () => spawnSync('node', [path.resolve(import.meta.dirname, '../plugin/scripts/check-release.mjs'), '--client'], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, ...TEST_ENV, FACTORY_USER_CONFIG: path.join(base, 'user.json') },
  });

  write(CLIENT_ENVIRONMENTS);
  assert.equal(run().status, 0);
  write({ ...CLIENT_ENVIRONMENTS, integration: { ...CLIENT_ENVIRONMENTS.integration, data: CLIENT_ENVIRONMENTS.release.data } });
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^FAIL environments.integration.data and environments.release.data are the same folder/);
  fs.rmSync(base, { recursive: true, force: true });
});

test('asset sets read the old single shape as production and fill in the version', () => {
  assert.deepEqual(assetSets({ build: ['b'], files: ['f'] }), { single: true, beta: null, production: { build: ['b'], files: ['f'] } });
  assert.deepEqual(assetSets(undefined), { single: true, beta: null, production: { build: [], files: [] } });
  assert.deepEqual(assetSets({ beta: { build: ['s'] }, production: { files: ['p'] } }), { single: false, beta: { build: ['s'], files: [] }, production: { build: [], files: ['p'] } });
  assert.deepEqual(assetPatterns({ files: ['a_<version>_*.exe', 'b/<version>/<version>.zip', 'c.msi'] }, '1.6.0'), ['a_1.6.0_*.exe', 'b/1.6.0/1.6.0.zip', 'c.msi']);
  assert.deepEqual(assetPatterns(null, '1.6.0'), []);
});

test('release-assets lists only the set and version asked for', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-release-assets-'));
  const run = (...args) => spawnSync('node', [path.resolve(import.meta.dirname, '../plugin/scripts/release-assets.mjs'), ...args], { cwd: root, encoding: 'utf8' });
  const nsis = path.join(root, 'bundle', 'nsis');
  fs.mkdirSync(nsis, { recursive: true });
  for (const f of ['App - Testes_1.6.0_x64-setup.exe', 'App - Testes_1.5.0_x64-setup.exe', 'App - Prod_1.6.0_x64-setup.exe']) fs.writeFileSync(path.join(nsis, f), '');
  fs.mkdirSync(path.join(root, '.claude'));
  const write = (assets) => fs.writeFileSync(path.join(root, '.claude/factory.json'), JSON.stringify({ boardKey: 'HL', release: { assets } }));

  write({
    beta: { build: ['x'], files: ['bundle/nsis/App - Testes_<version>_*-setup.exe'] },
    production: { build: ['y'], files: ['bundle/nsis/App - Prod_<version>_*-setup.exe'] },
  });
  let r = run('beta', '1.6.0');
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.stdout, 'bundle/nsis/App - Testes_1.6.0_x64-setup.exe\n');
  assert.equal(run('production', '1.6.0').stdout, 'bundle/nsis/App - Prod_1.6.0_x64-setup.exe\n');
  r = run('production', '1.7.0');
  assert.equal(r.status, 1);
  assert.equal(r.stdout, 'FAIL bundle/nsis/App - Prod_1.7.0_*-setup.exe matches no file\n');

  // An Internal project's old single set is the production set; it has no beta set.
  write({ build: ['y'], files: ['bundle/nsis/*-setup.exe'] });
  r = run('production', '1.6.0');
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim().split('\n').length, 3);
  r = run('beta', '1.6.0');
  assert.equal(r.status, 1);
  assert.equal(r.stdout, 'FAIL release.assets.beta is not set\n');
  assert.equal(run('nightly', '1.6.0').status, 2);
});

test('release documents go under the Releases root, by project, Release and beta', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-releases-'));
  assert.equal(releaseFolder('D:\\Releases', 'Hammer loc - CRM', '1.6.0', 2), path.join('D:\\Releases', 'Hammer loc - CRM', 'Release 1.6.0', 'beta.2'));
  assert.equal(releaseFolder('D:\\Releases', 'Hammer loc - CRM', '1.6.0'), path.join('D:\\Releases', 'Hammer loc - CRM', 'Release 1.6.0'));
  assert.equal(userConfigPath({ FACTORY_USER_CONFIG: 'x.json' }), 'x.json');
  assert.equal(userConfigPath({}), path.join(os.homedir(), '.claude', 'factory.user.json'));
  assert.deepEqual(loadUserConfig(path.join(base, 'none.json')), {});

  // The project folder is the repo folder's name, the main checkout's even from a worktree.
  const repo = path.join(base, 'My Repo');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
  git(repo, 'worktree', 'add', '-q', path.join(base, 'wt'), '-b', 'other');
  assert.equal(projectFolder(repo, {}), 'My Repo');
  assert.equal(projectFolder(path.join(base, 'wt'), {}), 'My Repo');
  assert.equal(projectFolder(path.join(base, 'wt'), { documents: { folder: 'Hammer loc - CRM' } }), 'Hammer loc - CRM');
  assert.deepEqual(checkDocuments({ documents: { folder: 'Hammer loc - CRM' } }), []);
  assert.deepEqual(checkDocuments({ documents: { folder: 'a\\b' } }), ['release.documents.folder "a\\\\b" must be a plain folder name, with no path']);

  const releases = path.join(base, 'Releases');
  assert.deepEqual(checkReleasesRoot({}, repo, 'u.json'), ["releasesRoot is not set in u.json: name the folder that holds every project's Release documents"]);
  assert.deepEqual(checkReleasesRoot({ releasesRoot: 'Releases' }, repo, 'u.json'), ['releasesRoot Releases in u.json must be an absolute path']);
  assert.deepEqual(checkReleasesRoot({ releasesRoot: releases }, repo, 'u.json'), [`releasesRoot ${releases} doesn't exist`]);
  fs.mkdirSync(releases);
  assert.deepEqual(checkReleasesRoot({ releasesRoot: releases }, repo, 'u.json'), []);
  assert.deepEqual(checkReleasesRoot({ releasesRoot: path.join(repo, 'out') }, repo, 'u.json').length, 1);
  fs.rmSync(base, { recursive: true, force: true });
});

test('check-release --client flags a missing Releases root; release-folder prints and creates the folder', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-release-folder-'));
  const repo = path.join(base, 'Hammer loc - CRM');
  fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'package.json'), '{"version":"1.6.0"}');
  fs.writeFileSync(path.join(repo, '.claude/factory.json'), JSON.stringify({
    boardKey: 'HL',
    environments: CLIENT_ENVIRONMENTS,
    release: { versionFiles: ['package.json'], assets: CLIENT_ASSETS, notes: { client: 'Eduardo & Luli', language: 'pt-BR' } },
  }));
  const userFile = path.join(base, 'factory.user.json');
  const env = { ...process.env, ...TEST_ENV, FACTORY_USER_CONFIG: userFile };
  const script = (name, ...args) => spawnSync('node', [path.resolve(import.meta.dirname, `../plugin/scripts/${name}`), ...args], { cwd: repo, encoding: 'utf8', env });

  let r = script('check-release.mjs', '--client');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL releasesRoot is not set in .*factory\.user\.json/);
  assert.equal(script('check-release.mjs').status, 0, 'an Internal check needs no Releases root');
  assert.equal(script('release-folder.mjs', '1.6.0', '1').status, 1);

  const releases = path.join(base, 'Releases');
  fs.writeFileSync(userFile, JSON.stringify({ releasesRoot: releases }));
  r = script('check-release.mjs', '--client');
  assert.equal(r.status, 1);
  assert.equal(r.stdout, `FAIL releasesRoot ${releases} doesn't exist\n`);

  fs.mkdirSync(releases);
  assert.equal(script('check-release.mjs', '--client').status, 0);
  const beta = path.join(releases, 'Hammer loc - CRM', 'Release 1.6.0', 'beta.2');
  r = script('release-folder.mjs', '1.6.0', '2');
  assert.equal(r.stdout, beta + path.sep + '\n');
  assert.equal(fs.existsSync(beta), false, 'prints without --create');
  r = script('release-folder.mjs', '1.6.0', '2', '--create');
  assert.equal(r.status, 0);
  assert.equal(fs.statSync(beta).isDirectory(), true);
  assert.equal(script('release-folder.mjs', '1.6.0').stdout, path.join(releases, 'Hammer loc - CRM', 'Release 1.6.0') + path.sep + '\n');
  assert.equal(script('release-folder.mjs', 'v1.6.0').status, 2);
  assert.equal(script('release-folder.mjs', '1.6.0', '0').status, 2);

  fs.writeFileSync(userFile, '{');
  assert.match(script('check-release.mjs', '--client').stdout, /FAIL .*factory\.user\.json is not valid JSON/);
  fs.rmSync(base, { recursive: true, force: true });
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

test('findBrowser prefers FACTORY_BROWSER, then Edge, then Chrome, and gives up with null', () => {
  const env = { ProgramFiles: 'C:/PF', 'ProgramFiles(x86)': 'C:/PF86' };
  const edge86 = path.join('C:/PF86', 'Microsoft/Edge/Application/msedge.exe');
  const chrome = path.join('C:/PF', 'Google/Chrome/Application/chrome.exe');
  assert.equal(findBrowser(env, (p) => p === edge86 || p === chrome), edge86);
  assert.equal(findBrowser(env, (p) => p === chrome), chrome);
  assert.equal(findBrowser(env, () => false), null);
  assert.equal(findBrowser({ ...env, FACTORY_BROWSER: 'D:/b.exe' }, (p) => p === 'D:/b.exe' || p === edge86), 'D:/b.exe');
  assert.equal(findBrowser({ ...env, FACTORY_BROWSER: 'D:/gone.exe' }, (p) => p === edge86), null);
  assert.ok(browserCandidates({}).includes('/usr/bin/google-chrome'));
});

test('printArgs prints headless, without header or footer, from a file URL with a private profile', () => {
  const args = printArgs('C:/tmp/My deck.html', 'C:/tmp/out.pdf', 'C:/tmp/profile');
  for (const flag of ['--headless=new', '--no-pdf-header-footer', '--virtual-time-budget=8000', '--print-to-pdf=C:/tmp/out.pdf', '--user-data-dir=C:/tmp/profile']) {
    assert.ok(args.includes(flag), flag);
  }
  assert.match(args.at(-1), /^file:\/\/\/?.*My%20deck\.html$/);
});

test('inlineAssets embeds local fonts and images, and remoteRefs finds what would load from elsewhere', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-inline-'));
  fs.mkdirSync(path.join(dir, 'fonts'));
  fs.writeFileSync(path.join(dir, 'fonts/body.woff2'), 'FONT');
  fs.writeFileSync(path.join(dir, 'logo.png'), 'PNG');
  const html = [
    '<style>@font-face { font-family: B; src: url("fonts/body.woff2") format("woff2"); }</style>',
    '<img src="logo.png" alt="">',
    '<img src="gone.png" alt="">',
    '<a href="https://example.com/help">help</a>',
    '<a href="#s02">next</a>',
  ].join('\n');

  const { html: out, inlined, missing } = inlineAssets(html, dir);
  assert.deepEqual(inlined.sort(), ['fonts/body.woff2', 'logo.png']);
  assert.deepEqual(missing, ['gone.png']);
  assert.match(out, /url\("data:font\/woff2;base64,Rk9OVA=="\)/);
  assert.match(out, /src="data:image\/png;base64,UE5H"/);
  assert.match(out, /href="#s02"/);
  assert.deepEqual(remoteRefs(out), []);

  const remote = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X">\n<style>@import "//cdn.example.com/a.css"; .x { background: url(https://x.test/b.png) }</style>\n<script src="http://x.test/c.js"></script>';
  assert.deepEqual(remoteRefs(remote).sort(), ['//cdn.example.com/a.css', 'http://x.test/c.js', 'https://fonts.googleapis.com/css2?family=X', 'https://x.test/b.png']);
});

test('the shipped guide shell loads nothing from the network', () => {
  const shell = fs.readFileSync(path.resolve(import.meta.dirname, '../plugin/skills/test-guide/guide-shell.html'), 'utf8');
  assert.deepEqual(remoteRefs(shell), []);
  assert.match(shell, /key: "\{\{project-key\}\}-test-guide-v\{\{version\}\}\{\{-beta\.n\}\}"/);
  const deck = fs.readFileSync(path.resolve(import.meta.dirname, '../plugin/skills/release-notes/deck-shell.html'), 'utf8');
  assert.deepEqual(remoteRefs(deck), []);
  assert.ok(unfilledSlots(shell).includes('{{fonts/display.woff2}}'));
  assert.deepEqual(unfilledSlots('<!doctype html>\n<!-- fill every {{...}} slot -->\n<p>done</p>'), []);
  assert.deepEqual(unfilledSlots('<p>{{Project}} and {{Project}}</p>'), ['{{Project}}']);
});

test('remoteRefs and inlineAssets handle unquoted attributes, srcset and poster', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-inline-forms-'));
  fs.writeFileSync(path.join(dir, 'a.png'), 'A');
  fs.writeFileSync(path.join(dir, 'b.png'), 'B');
  const remote = '<img src=https://x.test/logo.png alt="">\n<img srcset="local.png 1x, https://x.test/big.png 2x">\n<video poster=\'//cdn.x.test/p.jpg\'></video>\n<a href=https://x.test/help>help</a>';
  assert.deepEqual(remoteRefs(remote).sort(), ['//cdn.x.test/p.jpg', 'https://x.test/big.png', 'https://x.test/logo.png']);

  const { html, inlined } = inlineAssets('<img src=a.png alt="">\n<img srcset="a.png 1x, b.png 2x">', dir);
  assert.deepEqual(inlined.sort(), ['a.png', 'b.png']);
  assert.match(html, /<img src="data:image\/png;base64,QQ==" alt="">/);
  assert.match(html, /srcset="data:image\/png;base64,QQ== 1x, data:image\/png;base64,Qg== 2x"/);
  assert.deepEqual(remoteRefs(html), []);
});

test('printPdf waits for a PDF the browser writes late, and reports a print that never comes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-print-test-'));
  const html = path.join(dir, 'deck #1.html');
  fs.writeFileSync(html, '<p>x</p>');
  let seen;
  const late = (bin, args) => {
    seen = args;
    const out = args.find((a) => a.startsWith('--print-to-pdf=')).slice('--print-to-pdf='.length);
    setTimeout(() => fs.writeFileSync(out, '%PDF-1.7'), 150);
    return { status: 0, stderr: '' };
  };
  const ok = await printPdf({ html, pdf: path.join(dir, 'out.pdf'), browser: 'C:/fake/msedge.exe', spawn: late, waitMs: 3000, pollMs: 50 });
  assert.equal(ok.ok, true, ok.message);
  assert.match(ok.message, /printed with msedge\.exe/);
  assert.match(seen.at(-1), /deck%20%231\.html$/);
  assert.ok(!fs.existsSync(seen.find((a) => a.startsWith('--user-data-dir=')).slice('--user-data-dir='.length)), 'the private profile is removed');

  const never = () => ({ status: 1, stderr: 'line one\nboom' });
  const failed = await printPdf({ html, pdf: path.join(dir, 'none.pdf'), browser: 'C:/fake/chrome.exe', spawn: never, waitMs: 200, pollMs: 50 });
  assert.equal(failed.ok, false);
  assert.match(failed.message, /Print failed \(exit 1\): line one \| boom/);
});

test('inline-assets.mjs exits 0 only for a self-contained, filled document', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-inline-cli-'));
  fs.writeFileSync(path.join(dir, 'f.woff2'), 'F');
  const run = (body) => {
    fs.writeFileSync(path.join(dir, 'in.html'), body);
    return spawnSync('node', [path.resolve(import.meta.dirname, '../plugin/scripts/inline-assets.mjs'), path.join(dir, 'in.html'), path.join(dir, 'out.html')], { encoding: 'utf8' });
  };
  let r = run('<style>@font-face { src: url(f.woff2) }</style><p>ok</p>');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /1 file\(s\) embedded/);
  assert.match(fs.readFileSync(path.join(dir, 'out.html'), 'utf8'), /data:font\/woff2;base64,Rg==/);

  r = run('<img src=https://x.test/a.png>');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^network https:\/\/x\.test\/a\.png$/m);
  r = run('<img src="gone.png">');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^missing gone\.png$/m);
  r = run('<p>{{Project}}</p>');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^unfilled \{\{Project\}\}$/m);
});

const PYTHON = process.env.FACTORY_PYTHON || 'python';
const hasPymupdf = spawnSync(PYTHON, ['-I', '-c', 'import pymupdf'], { encoding: 'utf8' }).status === 0;

test('contact-sheet.py renders every page of a PDF into one image', { skip: !hasPymupdf && 'needs Python with pymupdf (set FACTORY_PYTHON)' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-sheet-'));
  const pdf = path.join(dir, 'deck.pdf');
  const png = path.join(dir, 'sheet.png');
  const make = `import pymupdf, sys\nd = pymupdf.open()\nfor i in range(4):\n    d.new_page(width=1920, height=1080).insert_text((100, 200), f"Slide {i + 1}", fontsize=80)\nd.save(sys.argv[1])`;
  assert.equal(spawnSync(PYTHON, ['-I', '-c', make, pdf]).status, 0);
  const r = spawnSync(PYTHON, ['-I', path.resolve(import.meta.dirname, '../plugin/skills/release-notes/scripts/contact-sheet.py'), pdf, png, '2', '320'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /: 4 pages$/m);
  const head = fs.readFileSync(png).subarray(0, 24);
  assert.equal(head.subarray(1, 4).toString(), 'PNG');
  assert.equal(head.readUInt32BE(16), 2 * 320 + 3 * 24, 'two columns of 320px with 24px gaps');
});

test('srcset candidates keep data URLs whole, and inlining twice changes nothing more', () => {
  const data = 'data:image/png;base64,QQ==';
  assert.deepEqual(srcsetCandidates(`${data} 1x, b.png 2x`), [{ url: data, descriptor: '1x' }, { url: 'b.png', descriptor: '2x' }]);
  assert.deepEqual(srcsetCandidates('a.png, b.png 480w,c.png'), [{ url: 'a.png', descriptor: '' }, { url: 'b.png', descriptor: '480w' }, { url: 'c.png', descriptor: '' }]);
  assert.deepEqual(srcsetCandidates('data:image/svg+xml,%3Csvg%3E,x 2x'), [{ url: 'data:image/svg+xml,%3Csvg%3E,x', descriptor: '2x' }]);
  assert.deepEqual(remoteRefs(`<img srcset="${data} 1x, https://x.test/b.png 2x">`), ['https://x.test/b.png']);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-inline-twice-'));
  fs.writeFileSync(path.join(dir, 'a.png'), 'A');
  const once = inlineAssets('<img srcset="a.png 1x, a.png 2x" src=a.png>', dir).html;
  assert.equal(once, `<img srcset="${data} 1x, ${data} 2x" src="${data}">`);
  assert.equal(inlineAssets(once, dir).html, once);
});

test('the guide shell hides what the empty state hides, whatever display a part sets', () => {
  const shell = fs.readFileSync(path.resolve(import.meta.dirname, '../plugin/skills/test-guide/guide-shell.html'), 'utf8');
  assert.match(shell, /\[hidden\] \{ display: none !important; \}/);
});

test('treeKey ignores doc-only paths and changes for everything else', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-treekey-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src/a.js'), 'a');
  fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
  fs.writeFileSync(path.join(dir, 'docs/guide.md'), 'g');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'dist/\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'init');
  const base = treeKey(dir);
  assert.match(base, /^[0-9a-f]{64}$/);

  fs.writeFileSync(path.join(dir, 'docs/guide.md'), 'changed');
  fs.writeFileSync(path.join(dir, 'NOTES.md'), 'new doc');
  fs.mkdirSync(path.join(dir, 'dist'));
  fs.writeFileSync(path.join(dir, 'dist/out.js'), 'ignored');
  assert.equal(treeKey(dir), base, 'docs, a new .md and ignored files keep the key');

  const changes = [
    () => fs.writeFileSync(path.join(dir, 'src/a.js'), 'a2'),
    () => fs.writeFileSync(path.join(dir, 'src/new.js'), 'untracked'),
    () => fs.rmSync(path.join(dir, 'src/a.js')),
    () => fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"v":2}'),
  ];
  for (const change of changes) {
    git(dir, 'checkout', '-q', '--', '.');
    fs.rmSync(path.join(dir, 'src/new.js'), { force: true });
    assert.equal(treeKey(dir), base);
    change();
    assert.notEqual(treeKey(dir), base, String(change));
  }
  assert.equal(treeKey(path.join(dir, 'missing')), null);
});

test('matchingEvidence needs the same command, key and toolchain', () => {
  const tools = { node: 'v24', rustc: 'rustc 1.90' };
  const evidence = { 'npm test': { key: 'k1', toolchain: tools, by: 'qa', at: 'now' } };
  assert.equal(matchingEvidence(evidence, 'npm test', 'k1', tools).by, 'qa');
  assert.equal(matchingEvidence(evidence, 'npm test', 'k2', tools), null);
  assert.equal(matchingEvidence(evidence, 'npm run test', 'k1', tools), null);
  assert.equal(matchingEvidence(evidence, 'npm test', 'k1', { ...tools, node: 'v25' }), null);
  assert.equal(matchingEvidence(evidence, 'npm test', 'k1', { ...tools, rustc: null }), null);
  assert.equal(matchingEvidence(evidence, 'npm test', null, tools), null);
});

test('run-gates.mjs logs every Gate and records evidence only for passes on an unchanged tree', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-rungates-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  const setGates = (gates) => {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude/factory.json'), JSON.stringify({ boardKey: 'FB', gates }));
  };
  const ok = 'node -e "console.log(\'all good\')"';
  const bad = 'node -e "console.error(\'test x failed\'); process.exit(3)"';
  const rewrite = 'node -e "require(\'fs\').writeFileSync(\'gen.js\', String(Date.now()))"';
  const run = () => spawnSync('node', [path.resolve(import.meta.dirname, '../plugin/scripts/run-gates.mjs'), path.join(dir, '.git/factory/logs/FB-1/qa-1.log')], { cwd: dir, encoding: 'utf8' });
  const evidence = () => readEvidence(dir);

  setGates([ok, bad]);
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'init');
  let r = run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^fail .*\(exit 3\)$/m);
  const log = fs.readFileSync(path.join(dir, '.git/factory/logs/FB-1/qa-1.log'), 'utf8');
  assert.match(log, /all good\n[\s\S]*\[exit 0\]/);
  assert.match(log, /test x failed\n[\s\S]*\[exit 3\]/);
  assert.deepEqual(Object.keys(evidence()), [ok]);
  assert.equal(evidence()[ok].key, treeKey(dir));
  assert.equal(evidence()[ok].by, 'qa');

  setGates([rewrite]);
  fs.rmSync(path.join(dir, '.git/factory/gates'), { recursive: true });
  r = run();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /tree changed while the Gates ran/);
  assert.deepEqual(evidence(), {});
});

test('treeKey covers file modes and refuses repos with submodules', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-treekey-modes-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'run.sh'), 'echo hi\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'init');
  const base = treeKey(dir);
  git(dir, 'update-index', '--chmod=+x', 'run.sh');
  assert.notEqual(treeKey(dir), base, 'an executable bit changes the key');
  git(dir, 'update-index', '--chmod=-x', 'run.sh');
  assert.equal(treeKey(dir), base);

  const sha = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'update-index', '--add', '--cacheinfo', `160000,${sha},vendor/lib`);
  assert.equal(treeKey(dir), null, 'a submodule means no reuse');
  assert.match(toolchain(dir).node, /^v\d+/);
});

test('run-gates.mjs forgets a pass that later fails, and stops recording once a Gate rewrites the tree', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-rungates-forget-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  const flaky = 'node -e "process.exit(require(\'fs\').existsSync(\'.git/FAIL\') ? 1 : 0)"';
  const ok = 'node -e "0"';
  const rewrite = 'node -e "require(\'fs\').writeFileSync(\'gen.js\', String(Date.now()))"';
  const setGates = (gates) => {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude/factory.json'), JSON.stringify({ boardKey: 'FB', gates }));
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'gates');
  };
  const run = () => spawnSync('node', [path.resolve(import.meta.dirname, '../plugin/scripts/run-gates.mjs'), path.join(dir, '.git/factory/logs/FB-1/qa.log')], { cwd: dir, encoding: 'utf8' });

  setGates([flaky]);
  assert.equal(run().status, 0);
  assert.deepEqual(Object.keys(readEvidence(dir)), [flaky]);
  fs.writeFileSync(path.join(dir, '.git/FAIL'), '');
  assert.equal(run().status, 1);
  assert.deepEqual(readEvidence(dir), {}, 'the failure forgets the earlier pass on the same tree');
  fs.rmSync(path.join(dir, '.git/FAIL'));

  setGates([ok, rewrite, ok + ' ']);
  const r = run();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no evidence recorded from then on/);
  assert.deepEqual(Object.keys(readEvidence(dir)), [ok], 'only the Gate before the rewrite counts');
});

test('a verified new file keeps its key through git add and commit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-treekey-stage-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'a.js'), 'a');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'init');
  fs.writeFileSync(path.join(dir, 'new.js'), 'built by the Subtask');
  const verified = treeKey(dir);
  git(dir, 'add', 'new.js');
  assert.equal(treeKey(dir), verified, 'staging keeps the key');
  git(dir, 'commit', '-q', '-m', 'feat: new');
  assert.equal(treeKey(dir), verified, 'committing keeps the key');
});

test('fileModes takes unstaged mode changes over the index, and untrackedMode matches what git add gives', () => {
  const staged = '100644 aaa 0\tsrc/run.sh\x00100644 bbb 0\tsrc/gone.js\x00';
  const raw = ':100644 100755 aaa 0000000 M\x00src/run.sh\x00:100644 000000 bbb 0000000 D\x00src/gone.js\x00';
  const modes = fileModes(staged, raw);
  assert.equal(modes.get('src/run.sh'), '100755');
  assert.equal(modes.get('src/gone.js'), '100644', 'a deletion keeps the index mode');
  assert.equal(fileModes('160000 ccc 0\tvendor/lib\x00', ''), null);

  const stat = (mode, link = false) => ({ mode, isSymbolicLink: () => link });
  assert.equal(untrackedMode(stat(0o100755), true), '100755');
  assert.equal(untrackedMode(stat(0o100755), false), '100644', 'core.fileMode off: git stages 100644');
  assert.equal(untrackedMode(stat(0o100644), true), '100644');
  assert.equal(untrackedMode(stat(0o120777, true), true), '120000');
});

test('toolchain probes node and rustc in the repo the Gates run in', () => {
  const calls = [];
  const spawn = (cmd, args, opts) => {
    calls.push([cmd, opts.cwd]);
    return cmd === 'rustc' ? { status: 1, stdout: '' } : { status: 0, stdout: 'v1.2.3\n' };
  };
  assert.deepEqual(toolchain('D:/repos/B', spawn), { node: 'v1.2.3', rustc: null });
  assert.deepEqual(calls, [['node', 'D:/repos/B'], ['rustc', 'D:/repos/B']]);
});

test('run-gates.mjs records nothing after a failing Gate changed the tree, even if a later one restores it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-rungates-failchange-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  const breakIt = `node -e "require('fs').writeFileSync('gen.js', 'x'); process.exit(1)"`;
  const restore = `node -e "require('fs').rmSync('gen.js', { force: true })"`;
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(path.join(dir, '.claude/factory.json'), JSON.stringify({ boardKey: 'FB', gates: [breakIt, restore] }));
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'gates');
  const before = treeKey(dir);
  const r = spawnSync('node', [path.resolve(import.meta.dirname, '../plugin/scripts/run-gates.mjs'), path.join(dir, '.git/factory/logs/FB-1/qa.log')], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.equal(treeKey(dir), before, 'the second Gate restored the tree');
  assert.deepEqual(readEvidence(dir), {}, 'the restoring Gate ran on a changed tree, so it proves nothing');
});

test('treeKey keys a directory link by its target, so retargeting it changes the key', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-treekey-link-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  for (const v of ['good', 'bad']) {
    fs.mkdirSync(path.join(dir, 'versions', v), { recursive: true });
    // The same file in both: only the link's target tells them apart, as on a
    // system where git doesn't look inside a linked directory.
    fs.writeFileSync(path.join(dir, 'versions', v, 'impl.js'), 'same');
  }
  try {
    fs.symlinkSync(path.join(dir, 'versions/good'), path.join(dir, 'current'), 'junction');
  } catch (e) {
    t.skip(`can't create a directory link here: ${e.code}`);
    return;
  }
  // Tracked as a symlink, as a committed link would be.
  const blob = spawnSync('git', ['hash-object', '-w', '--stdin'], { cwd: dir, input: 'versions/good', encoding: 'utf8' }).stdout.trim();
  git(dir, 'add', 'versions');
  git(dir, 'update-index', '--add', '--cacheinfo', `120000,${blob},current`);
  git(dir, 'commit', '-q', '-m', 'init');
  const good = treeKey(dir);

  fs.rmSync(path.join(dir, 'current'));
  fs.symlinkSync(path.join(dir, 'versions/bad'), path.join(dir, 'current'), 'junction');
  assert.notEqual(treeKey(dir), good, 'pointing current at versions/bad changes the key');
  fs.rmSync(path.join(dir, 'current'));
  fs.symlinkSync(path.join(dir, 'versions/good'), path.join(dir, 'current'), 'junction');
  assert.equal(treeKey(dir), good, 'pointing it back restores the key');
});

test('the deck cover takes the client logo as a data URL, and drops cleanly without one', () => {
  const deck = fs.readFileSync(path.resolve(import.meta.dirname, '../plugin/skills/release-notes/deck-shell.html'), 'utf8');
  const slot = /^.*class="client-logo" src="\{\{client\.logo_data\}\}".*\n/m;
  assert.match(deck, slot);
  assert.ok(unfilledSlots(deck).includes('{{client.logo_data}}'), 'an unfilled client logo is caught before printing');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-cover-'));
  const logo = 'data:image/png;base64,iVBORw0KGgo=';
  const { html, inlined, missing } = inlineAssets(deck.replace('{{client.logo_data}}', logo), dir);
  assert.ok(html.includes(`class="client-logo" src="${logo}"`), 'the data URL is kept as it is');
  assert.ok(!inlined.includes(logo) && !missing.includes(logo));
  assert.deepEqual(remoteRefs(html), []);

  const without = deck.replace(slot, '');
  assert.doesNotMatch(without, /client-logo"|\{\{client\./);
  assert.ok(!unfilledSlots(without).includes('{{client.logo_data}}') && !unfilledSlots(without).includes('{{Client}}'));
});

test('gates: a string stays a full command; an object keeps its scope apart from the command', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-gates-'));
  fs.mkdirSync(path.join(dir, '.claude'));
  const gates = [
    'npx tsc --noEmit',
    { run: 'npx vitest run', related: 'npx vitest related --run {files}' },
    { run: 'cargo test --manifest-path src-tauri/Cargo.toml', paths: ['./src-tauri/', 'crates\\core'] },
  ];
  fs.writeFileSync(path.join(dir, '.claude/factory.json'), JSON.stringify({ boardKey: 'FB', gates }));
  const config = loadConfig(dir);
  assert.deepEqual(config.gates, ['npx tsc --noEmit', 'npx vitest run', 'cargo test --manifest-path src-tauri/Cargo.toml'], 'the PR gate and CI see full commands only');
  assert.deepEqual(config.gateScopes, [
    { run: 'npx tsc --noEmit', paths: null, related: null },
    { run: 'npx vitest run', paths: null, related: 'npx vitest related --run {files}' },
    { run: 'cargo test --manifest-path src-tauri/Cargo.toml', paths: ['src-tauri', 'crates/core'], related: null },
  ]);
  assert.deepEqual(normalizeGates(undefined), []);
});

test('gates: a malformed entry is refused with its index and what is wrong', () => {
  const bad = (gates, re) => assert.throws(() => normalizeGates(gates), re);
  bad('npm test', /gates must be a list/);
  bad([''], /gates\[0\] is an empty command/);
  bad(['ok', 42], /gates\[1\] must be a command string or an object/);
  bad([['npm test']], /gates\[0\] must be a command string/);
  bad([{ paths: ['src/'] }], /gates\[0\] needs "run"/);
  bad([{ run: 'x', path: ['src/'] }], /unknown keys: path/);
  bad([{ run: 'x', paths: 'src/' }], /"paths" must be a non-empty list/);
  bad([{ run: 'x', paths: [] }], /"paths" must be a non-empty list/);
  bad([{ run: 'x', paths: ['../other'] }], /paths inside the repo/);
  bad([{ run: 'x', paths: ['./'] }], /paths inside the repo/);
  bad([{ run: 'x', related: 'npx vitest related' }], /"related" must be a command containing \{files\}/);
});

test('scoped Gates: skip outside paths, related on the changed files, full otherwise', () => {
  const tsc = { run: 'tsc', paths: null, related: null };
  const cargo = { run: 'cargo test', paths: ['src-tauri'], related: null };
  const vitest = { run: 'vitest run', paths: null, related: 'vitest related --run {files}' };
  const both = { run: 'vitest run', paths: ['src'], related: 'vitest related {files} --run' };
  const ts = ['src/a.ts', 'src/b c.ts'];
  const posix = { platform: 'linux' };

  assert.deepEqual(scopeGate(tsc, ts, posix), { action: 'full', cmd: 'tsc' });
  assert.deepEqual(scopeGate(cargo, ts, posix), { action: 'skip', reason: 'no changes under src-tauri/' });
  assert.deepEqual(scopeGate(cargo, ['src-tauri/src/main.rs'], posix), { action: 'full', cmd: 'cargo test' });
  assert.equal(scopeGate(cargo, ['src-tauri-old/x.rs'], posix).action, 'skip', 'a sibling with the same prefix is not under it');
  assert.deepEqual(scopeGate(vitest, ts, posix), { action: 'related', cmd: "vitest related --run 'src/a.ts' 'src/b c.ts'" });
  assert.deepEqual(scopeGate(vitest, ts, { platform: 'win32' }), { action: 'related', cmd: 'vitest related --run "src/a.ts" "src/b c.ts"' });
  assert.deepEqual(scopeGate(both, ['src/a.ts', 'README.md'], posix), { action: 'related', cmd: "vitest related 'src/a.ts' --run" }, 'only the files under its paths');
  assert.equal(scopeGate(both, ['README.md'], posix).action, 'skip');

  // Nothing safe to hand the related form: the full command runs.
  assert.equal(scopeGate(vitest, ['src/gone.ts'], { ...posix, exists: () => false }).cmd, 'vitest run');
  assert.equal(scopeGate(vitest, ['src/100%.ts'], { platform: 'win32' }).cmd, 'vitest run');
  assert.equal(scopeGate(vitest, Array.from({ length: 500 }, (_, i) => `src/some/long/path/file-${i}.ts`), posix).cmd, 'vitest run');
  assert.deepEqual(scopeGate(cargo, null, posix), { action: 'full', cmd: 'cargo test', reason: 'changed files unknown' });
  assert.equal(scopeGate(tsc, [], posix).action, 'full', 'a Gate with no paths always runs');

  assert.equal(quote("it's.ts", 'linux'), `'it'\\''s.ts'`);
  assert.ok(under('src-tauri', ['src-tauri']) && !under('src-tauri2/x', ['src-tauri']));
});

test('changedFiles is the working tree against HEAD plus untracked, ignored files left out', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-changed-'));
  git(dir, 'init', '-q', '-b', 'main');
  assert.equal(changedFiles(dir), null, 'no HEAD yet');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'out/\n');
  fs.writeFileSync(path.join(dir, 'a.ts'), 'a');
  fs.writeFileSync(path.join(dir, 'gone.ts'), 'g');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'chore: init');
  assert.deepEqual(changedFiles(dir), []);
  fs.writeFileSync(path.join(dir, 'a.ts'), 'a2');
  fs.rmSync(path.join(dir, 'gone.ts'));
  fs.writeFileSync(path.join(dir, 'staged.ts'), 's');
  git(dir, 'add', 'staged.ts');
  fs.writeFileSync(path.join(dir, 'new.ts'), 'n');
  fs.mkdirSync(path.join(dir, 'out'));
  fs.writeFileSync(path.join(dir, 'out/built.js'), 'b');
  assert.deepEqual(changedFiles(dir), ['a.ts', 'gone.ts', 'new.ts', 'staged.ts']);
});

test('check-plan.mjs prints the commands run-gates.mjs --scoped runs for the same changes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-checkplan-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  const scripts = (name) => path.resolve(import.meta.dirname, `../plugin/scripts/${name}`);
  const plan = () => spawnSync('node', [scripts('check-plan.mjs')], { cwd: dir, encoding: 'utf8' });
  assert.equal(plan().status, 2, 'no config');

  const gates = [
    'node -e "console.log(1)"',
    { run: 'node -e "console.log(2)"', paths: ['api'] },
    { run: 'node -e "console.log(3)"', paths: ['src'], related: 'node -e "console.log(4)" -- {files}' },
  ];
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, '.claude/factory.json'), JSON.stringify({ boardKey: 'FB', gates }));
  fs.writeFileSync(path.join(dir, 'src/a.ts'), 'a');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'init');
  fs.writeFileSync(path.join(dir, 'src/a.ts'), 'a2');

  const planned = plan();
  assert.equal(planned.status, 0);
  const lines = planned.stdout.trim().split('\n');
  assert.equal(lines[0], 'check plan: changed files 1 file(s)');
  assert.deepEqual(lines.slice(1).map((l) => l.split(' ')[0]), ['full', 'skip', 'related']);
  assert.ok(!lines.join('\n').includes('--lib'));

  // What QA's scoped Verify then runs is the plan: the same commands, the same skip.
  const ran = spawnSync('node', [scripts('run-gates.mjs'), '--scoped', path.join(dir, 'qa.log')], { cwd: dir, encoding: 'utf8' });
  const commands = (out, tag) => out.split('\n').filter((l) => l.startsWith(tag)).map((l) => l.replace(/^\S+\s+/, '').replace(/\s+\(.*\)$/, ''));
  assert.deepEqual(commands(planned.stdout, 'full').concat(commands(planned.stdout, 'related')), commands(ran.stdout, 'pass'));
  assert.deepEqual(commands(planned.stdout, 'skip'), commands(ran.stdout, 'skip').map((c) => c.replace(/\s+\(.*$/, '')));
});

test('environment signatures: each known cause is recognised, a real failure is not', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-envsig-'));
  const sig = (out, action = 'full') => matchEnvironment(out, { root, action })?.name ?? null;
  // FB-323: a fresh worktree with no node_modules.
  assert.equal(sig("Error: Cannot find package 'vitest' imported from C:\\wt\\vitest.config.ts"), 'missing-dependency');
  assert.equal(sig("src/a.ts(1,19): error TS2307: Cannot find module 'react' or its corresponding type declarations."), 'missing-dependency');
  assert.equal(sig("'tsc' is not recognized as an internal or external command,\noperable program or batch file."), 'missing-tool');
  assert.equal(sig('sh: 1: vitest: not found'), 'missing-tool');
  // A relative import that doesn't resolve is the code's fault; so is a package that IS installed.
  assert.equal(sig("error TS2307: Cannot find module './gone' or its corresponding type declarations."), null);
  fs.mkdirSync(path.join(root, 'node_modules/react'), { recursive: true });
  assert.equal(sig("error TS2307: Cannot find module 'react' or its corresponding type declarations."), null);
  // FB-314: a running debug flowboard.exe locked target\debug.
  assert.equal(sig('error: failed to remove file `target\\debug\\flowboard.exe`\nCaused by: Access is denied. (os error 5)'), 'locked-build-artifact');
  // FB-320 round 3: Gates launched from a lowercase c: cwd.
  const lower = " FAIL  src/a.test.ts\nTypeError: Cannot read properties of undefined (reading 'config')\n    at node_modules/vitest/dist/runners.js:12:3\n Test Files  no tests";
  assert.equal(sig(lower), 'test-runner-did-not-start');
  assert.equal(sig("TypeError: Cannot read properties of undefined (reading 'config')\n    at src/app.ts:3"), null, 'the app code reading a config is not the runner');
  assert.equal(sig('Error: failed to find the runner'), 'test-runner-did-not-start');
  assert.equal(sig('Error: [vitest-pool]: Failed to start forks worker'), 'test-runner-did-not-start');
  // 0 tests collected, except in a related run (no test relates to the change: not the machine's fault).
  assert.equal(sig('No test files found, exiting with code 1'), 'no-tests-collected');
  assert.equal(sig('No test files found, exiting with code 1', 'related'), null);
  assert.equal(sig(' FAIL  src/a.test.ts > adds\nAssertionError: expected 1 to be 2'), null);
  assert.equal(sig('\x1b[31mNo test files found\x1b[39m'), 'no-tests-collected', 'colour codes are ignored');
});

test('failingTests and rerunCommand narrow a Gate to the tests that failed', () => {
  const vitest = ' FAIL  src/a.test.ts > list > loads\n FAIL  src/a.test.ts > list > sorts\n FAIL  src/b.spec.tsx [ src/b.spec.tsx ]\n';
  const v = failingTests(vitest);
  assert.deepEqual(v.targets, ['src/a.test.ts', 'src/b.spec.tsx']);
  assert.deepEqual(v.names, ['src/a.test.ts > list > loads', 'src/a.test.ts > list > sorts', 'src/b.spec.tsx']);
  const cargo = failingTests('test db::tests::inserts ... ok\ntest db::tests::rolls_back ... FAILED\ntest api::tests::lists ... FAILED\n');
  assert.deepEqual(cargo.targets, ['db::tests::rolls_back', 'api::tests::lists']);
  assert.equal(failingTests('error: something else'), null);

  const posix = 'linux';
  assert.equal(rerunCommand('npx vitest run', v, posix), "npx vitest run 'src/a.test.ts' 'src/b.spec.tsx'");
  assert.equal(rerunCommand('npm run test:run', v, posix), "npm run test:run -- 'src/a.test.ts' 'src/b.spec.tsx'");
  assert.equal(rerunCommand('cargo test --manifest-path src-tauri/Cargo.toml', cargo, posix), 'cargo test --manifest-path src-tauri/Cargo.toml db::tests::rolls_back api::tests::lists');
  assert.equal(rerunCommand('npx vitest related --run a.ts', v, posix), null, 'a related command is not narrowed by appending');
  assert.equal(rerunCommand('npm run typecheck', null, posix), null);
  assert.equal(rerunCommand('cargo clippy', cargo, posix), null, 'only `cargo test` is narrowed by names');
});

test('run-gates.mjs exits 3 on an environment failure and records no evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-rungates-env-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  const ok = 'node -e "console.log(\'all good\')"';
  const locked = 'node -e "console.error(\'Access is denied. (os error 5)\'); process.exit(1)"';
  const later = 'node -e "console.log(\'never runs\')"';
  const real = 'node -e "console.error(\' FAIL  src/a.test.ts > x\'); process.exit(1)"';
  const setGates = (gates) => {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude/factory.json'), JSON.stringify({ boardKey: 'FB', gates }));
  };
  const logFile = path.join(dir, '.git/factory/logs/FB-1/qa.log');
  const run = () => spawnSync('node', [path.resolve(import.meta.dirname, '../plugin/scripts/run-gates.mjs'), logFile], { cwd: dir, encoding: 'utf8' });
  setGates([ok, locked, later]);
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'init');
  let r = run();
  assert.equal(r.status, 3);
  assert.match(r.stdout, /^environment /m);
  assert.match(r.stdout, /environment failure: locked-build-artifact\. .*close it/);
  assert.ok(!r.stdout.includes('never runs') && !fs.readFileSync(logFile, 'utf8').includes('never runs'), 'the run stops at the environment failure');
  assert.deepEqual(readEvidence(dir), {}, 'an exit 3 records no evidence, not even for the Gate before it');

  // A failure with no signature is a real one: exit 1, unchanged.
  setGates([real]);
  r = run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^fail /m);
});

test('run-gates.mjs reruns failing tests once: a pass on rerun is flaky and records no evidence, a second failure is real', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-rungates-flaky-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  // A stand-in for vitest: the whole suite (no file argument) fails and names a test; handed that
  // file alone it passes, unless ALWAYS_FAIL says the failure is real.
  const runner = path.join(os.tmpdir(), `fake-vitest-${path.basename(dir)}.cjs`);
  fs.writeFileSync(
    runner,
    `const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (files.length === 0 || process.env.ALWAYS_FAIL === '1') { console.log(' FAIL  src/a.test.ts > flaky one'); process.exit(1); }
`,
  );
  // `vitest` must appear in the command for the rerun to be narrowed.
  const cmd = `node "${runner}" --reporter=vitest`;
  const other = 'node -e "console.log(1)"';
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(path.join(dir, '.claude/factory.json'), JSON.stringify({ boardKey: 'FB', gates: [cmd, other] }));
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'init');
  const log = path.join(dir, '.git/factory/logs/FB-1/qa.log');
  const run = (env = {}) => spawnSync('node', [path.resolve(import.meta.dirname, '../plugin/scripts/run-gates.mjs'), log], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });

  let r = run();
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /^flaky .*src\/a\.test\.ts > flaky one/m);
  assert.match(r.stdout, /flaky tests \(failed, then passed alone on rerun\): src\/a\.test\.ts > flaky one/);
  assert.deepEqual(Object.keys(readEvidence(dir)), [other], 'a flaky pass proves nothing about the tree; the other Gate still does');
  assert.match(fs.readFileSync(log, 'utf8'), /rerun the failing tests once/);

  fs.rmSync(path.join(dir, '.git/factory/gates'), { recursive: true });
  r = run({ ALWAYS_FAIL: '1' });
  assert.equal(r.status, 1, 'it failed again on rerun: a real failure');
  assert.match(r.stdout, /^fail /m);
  assert.ok(!r.stdout.includes('flaky tests'));
});

test('prepare-tree.mjs stops without factory.json on the branch and installs when node_modules is missing or stale', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-prepare-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'README.md'), 'x');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'init');
  const prepare = () => spawnSync('node', [path.resolve(import.meta.dirname, '../plugin/scripts/prepare-tree.mjs')], { cwd: dir, encoding: 'utf8' });

  let r = prepare();
  assert.equal(r.status, 2);
  assert.match(r.stdout, /No \.claude\/factory\.json on this branch/);

  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(path.join(dir, '.claude/factory.json'), JSON.stringify({ boardKey: 'FB', gates: [] }));
  r = prepare();
  assert.equal(r.status, 0, 'no package-lock.json: nothing to install');
  assert.match(r.stdout, /^root: /m);
  assert.match(r.stdout, /ready/);

  // A lock file with no node_modules: `npm ci` runs (and fails here, on a lock npm can't use).
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x","version":"1.0.0"}');
  fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"name":"x","version":"1.0.0","lockfileVersion":3,"requires":true,"packages":{"":{"name":"x","version":"1.0.0"}}}');
  r = prepare();
  assert.match(r.stdout, /node_modules is missing: npm ci/);
  assert.equal(r.status, 0, r.stdout);

  // Installed and newer than the lock: left alone. Older than the lock: installed again.
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules/.package-lock.json'), '{}');
  const later = new Date(Date.now() + 60_000);
  fs.utimesSync(path.join(dir, 'node_modules/.package-lock.json'), later, later);
  assert.match(prepare().stdout, /node_modules is current/);
  const earlier = new Date(Date.now() - 60_000);
  fs.utimesSync(path.join(dir, 'node_modules/.package-lock.json'), earlier, earlier);
  assert.match(prepare().stdout, /older than package-lock\.json: npm ci/);
});
