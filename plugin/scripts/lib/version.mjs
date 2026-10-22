// Semver for a Release: the next version proposed from its commits, and the
// version rewritten in each file that carries it (release.versionFiles).

import path from 'node:path';
import { readVersion } from './release.mjs';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The bump a set of commit messages asks for: a breaking change is major, a feat
// minor, anything else patch. `messages` are full messages (subject and body).
export function bumpKind(messages) {
  if (messages.some((m) => /^\w+(\([^)]*\))?!:/.test(m) || /^BREAKING[ -]CHANGE:/m.test(m))) return 'major';
  if (messages.some((m) => /^feat(\([^)]*\))?:/.test(m))) return 'minor';
  return 'patch';
}

export function nextVersion(current, kind) {
  const [major, minor, patch] = current.split('-')[0].split('.').map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// The file's text with its version set to `version`; throws when it carries none.
// Edits the text in place (no reformatting): JSON files at their top-level
// "version" (and package-lock.json's root package entry), Cargo.toml in [package].
export function setVersion(file, text, version) {
  const old = readVersion(file, text);
  if (!old) throw new Error(`${file} carries no version`);
  const name = path.basename(file);

  if (name === 'Cargo.toml') {
    return text.replace(/^(\[package\]\s*$[\s\S]*?^version\s*=\s*")[^"]+(")/m, `$1${version}$2`);
  }

  const occurrences = name === 'package-lock.json' ? 2 : 1;
  let n = 0;
  const out = text.replace(new RegExp(`("version"\\s*:\\s*")${esc(old)}(")`, 'g'), (m, a, b) => (n++ < occurrences ? `${a}${version}${b}` : m));
  const want = JSON.parse(text);
  want.version = version;
  if (name === 'package-lock.json' && want.packages?.['']) want.packages[''].version = version;
  if (JSON.stringify(JSON.parse(out)) !== JSON.stringify(want)) {
    throw new Error(`${file}: couldn't set the version without touching other fields; edit it by hand`);
  }
  return out;
}

// Cargo.lock with the version of package `pkg` set; unchanged when it isn't listed.
export function setLockedVersion(text, pkg, version) {
  return text.replace(new RegExp(`(\\[\\[package\\]\\]\\r?\\nname = "${esc(pkg)}"\\r?\\nversion = ")[^"]+(")`), `$1${version}$2`);
}
