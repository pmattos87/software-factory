// A Release's version, from the project's repo root (settings: release.versionFiles):
//   node release-version.mjs propose     the version the commits since the last release ask for
//   node release-version.mjs bump 1.6.0  set that version in every version file (and Cargo.lock)
//   node release-version.mjs changelog 1.6.0 FB-12 FB-14
//                                        rebuild the version's changelog section (release.changelog)
//                                        from exactly these Stories' docs/changes/<KEY>.md files, and
//                                        print `missing <KEY>` for a pick with none. Run it again after
//                                        every sync; the files stay.
// The last release is the tag v<current version>, or the production branch when there is no tag.

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, CONFIG_PATH } from './lib/config.mjs';
import { git } from './lib/git.mjs';
import { readVersion } from './lib/release.mjs';
import { assembleChangelog, CHANGES_DIR, leftoverFile } from './lib/changelog.mjs';
import { bumpKind, nextVersion, setVersion, setLockedVersion } from './lib/version.mjs';

const root = process.cwd();
const config = loadConfig(root);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const [cmd, version, ...keys] = process.argv.slice(2);
const isVersion = /^\d+\.\d+\.\d+$/.test(version ?? '');
const files = config?.release.versionFiles ?? [];
// The changelog needs no version files; propose and bump read the current version.
const current = cmd === 'changelog' ? null : readCurrent();

if (cmd === 'changelog' && isVersion && keys.length) changelog(version, keys);
else if (cmd === 'propose') propose();
else if (cmd === 'bump' && isVersion) bump(version);
else fail('Usage: release-version.mjs propose | bump <x.y.z> | changelog <x.y.z> <KEY...>');

function readCurrent() {
  if (!files.length) fail(`${CONFIG_PATH} has no release.versionFiles; run check-release.mjs.`);
  return readVersion(files[0], read(files[0]));
}

function propose() {
  const tag = `v${current}`;
  const from = git(root, 'rev-parse', '--verify', '--quiet', `refs/tags/${tag}`) ? tag : `origin/${config.branches.production}`;
  const log = git(root, 'log', '--no-merges', '--format=%B%x00', `${from}..HEAD`) ?? '';
  const messages = log.split('\0').map((m) => m.trim()).filter(Boolean);
  const kind = bumpKind(messages);
  console.log(`current  ${current} (commits since ${from}: ${messages.length})`);
  console.log(`bump     ${kind}`);
  console.log(`proposed ${nextVersion(current, kind)}`);
}

function bump(to) {
  for (const file of files) {
    fs.writeFileSync(path.join(root, file), setVersion(file, read(file), to));
    console.log(`${file}: ${current} -> ${to}`);
    if (path.basename(file) === 'Cargo.toml') bumpLock(file, to);
  }
}

// Cargo.lock sits next to Cargo.toml, or at a workspace root above it.
function bumpLock(manifest, to) {
  const pkg = /^\[package\]\s*$[\s\S]*?^name\s*=\s*"([^"]+)"/m.exec(read(manifest))?.[1];
  for (let dir = path.dirname(manifest); ; dir = path.dirname(dir)) {
    const lock = path.join(dir, 'Cargo.lock');
    if (fs.existsSync(path.join(root, lock))) {
      const text = read(lock);
      const out = setLockedVersion(text, pkg, to);
      if (out !== text) {
        fs.writeFileSync(path.join(root, lock), out);
        console.log(`${lock.split(path.sep).join('/')}: ${pkg} -> ${to}`);
      }
      return;
    }
    if (dir === '.' || dir === path.dirname(dir)) return;
  }
}

function changelog(to, picks) {
  const file = config?.release.changelog;
  if (!file) {
    console.log(`No release.changelog in ${CONFIG_PATH}: no changelog to assemble.`);
    return;
  }
  const found = picks.filter((key) => fs.existsSync(path.join(root, CHANGES_DIR, `${key}.md`)));
  const stories = found.map((key) => ({ key, text: read(`${CHANGES_DIR}/${key}.md`) }));
  const date = new Date().toISOString().slice(0, 10);
  const leftoverPath = `${CHANGES_DIR}/${leftoverFile(to)}`;
  const leftover = fs.existsSync(path.join(root, leftoverPath)) ? read(leftoverPath) : '';
  let out;
  try {
    out = assembleChangelog(read(file), to, date, stories, leftover);
  } catch (e) {
    fail(e.message);
  }
  // Entries cut from [Unreleased] join the leftover file, so the next run rebuilds with them.
  if (out.unreleased) {
    fs.mkdirSync(path.join(root, CHANGES_DIR), { recursive: true });
    fs.writeFileSync(path.join(root, leftoverPath), `${leftover.trimEnd()}${leftover.trim() ? '\n\n' : ''}${out.unreleased}\n`);
    console.log(`${leftoverPath}: the entries that were under [Unreleased]`);
  }
  fs.writeFileSync(path.join(root, file), out.text);
  console.log(`${file}: ${to} rebuilt from ${found.length ? found.join(', ') : 'no Story files'}`);
  for (const key of picks.filter((k) => !found.includes(k))) console.log(`missing ${key}`);
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
