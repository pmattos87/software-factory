// A Consumer project's release settings (the `release` key of .claude/factory.json):
// which files carry its version, how its release assets are built, and, on a
// Client project, what its release notes need. Read by the promote skill.

import fs from 'node:fs';
import path from 'node:path';

const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const NOTES_FIELDS = ['client', 'language', 'stagingUrl'];

// The `release` key with its defaults filled in.
export function releaseSettings(raw = {}) {
  return {
    versionFiles: raw.versionFiles ?? [],
    assets: { build: raw.assets?.build ?? [], files: raw.assets?.files ?? [] },
    notes: raw.notes ?? null,
  };
}

// The version a file carries, or null when it has none where expected.
// JSON files carry it in a top-level "version"; Cargo.toml in its [package] section.
export function readVersion(file, text) {
  if (path.basename(file) === 'Cargo.toml') {
    const pkg = /^\[package\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(text)?.[1] ?? '';
    return /^version\s*=\s*"([^"]+)"/m.exec(pkg)?.[1] ?? null;
  }
  if (file.endsWith('.json')) {
    try {
      const v = JSON.parse(text).version;
      return typeof v === 'string' ? v : null;
    } catch {
      return null;
    }
  }
  return null;
}

// Problems with a project's release settings; empty when promote can use them.
// `client` adds the release-notes settings a Client project's User testing needs.
export function checkRelease(root, settings, { client = false } = {}) {
  const problems = [];
  if (!settings.versionFiles.length) problems.push('release.versionFiles is empty: name the files that carry the version');

  const versions = new Map();
  for (const file of settings.versionFiles) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) {
      problems.push(`${file} doesn't exist`);
      continue;
    }
    if (!file.endsWith('.json') && path.basename(file) !== 'Cargo.toml') {
      problems.push(`${file}: only JSON files and Cargo.toml are supported`);
      continue;
    }
    const version = readVersion(file, fs.readFileSync(full, 'utf8'));
    if (!version || !VERSION.test(version)) problems.push(`${file} has no version like 1.6.0`);
    else versions.set(file, version);
  }
  if (new Set(versions.values()).size > 1) {
    problems.push(`the version files disagree: ${[...versions].map(([f, v]) => `${f} ${v}`).join(', ')}`);
  }

  if (settings.assets.files.length && !settings.assets.build.length) {
    problems.push('release.assets.files is set but release.assets.build is empty: nothing would produce them');
  }

  if (client) {
    for (const field of NOTES_FIELDS) {
      if (!settings.notes?.[field]) problems.push(`release.notes.${field} is required on a Client project`);
    }
  }
  return problems;
}
