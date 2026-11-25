// A Consumer project's release settings (the `release` key of .claude/factory.json):
// which files carry its version, how its release assets are built (a beta set and a
// production set), where its changelog is, and, on a Client project, what its release
// notes need. Read by the promote skill.

import fs from 'node:fs';
import path from 'node:path';
import { checkDocuments } from './releases.mjs';
import { checkEnvironments } from './environments.mjs';

const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const NOTES_FIELDS = ['client', 'language'];
export const ASSET_SETS = ['beta', 'production'];

const assetSet = (raw) => (raw ? { build: raw.build ?? [], files: raw.files ?? [] } : null);

// The asset sets: `release.assets.beta` and `release.assets.production`, each
// { build, files }. The old single `release.assets` { build, files } is the
// production set, with no beta set (`single` is then true). No `release.assets` at
// all means the project ships no files (a web app, say): `none` is then true, and
// promote publishes its GitHub Release with nothing attached (SF-152).
export function assetSets(raw) {
  if (raw && (raw.beta || raw.production)) return { single: false, none: false, beta: assetSet(raw.beta), production: assetSet(raw.production) };
  return { single: true, none: raw == null, beta: null, production: assetSet(raw ?? {}) };
}

// A set's file patterns for one version: every `<version>` replaced by it.
export function assetPatterns(set, version) {
  return (set?.files ?? []).map((pattern) => pattern.replaceAll('<version>', version));
}

// The settings key a set lives under, for messages.
export const assetKey = (assets, name) => (assets.single ? 'release.assets' : `release.assets.${name}`);

// The `release` key with its defaults filled in.
export function releaseSettings(raw = {}) {
  return {
    versionFiles: raw.versionFiles ?? [],
    assets: assetSets(raw.assets),
    notes: raw.notes ?? null,
    documents: raw.documents ?? null,
    changelog: raw.changelog ?? null,
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
// `client` adds what a Client project's User testing needs: both asset sets, the
// release-notes settings and the two data environments (`environments`, the
// top-level key of factory.json).
export function checkRelease(root, settings, { client = false, environments = {}, env = process.env } = {}) {
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

  const { assets } = settings;
  for (const name of ASSET_SETS) {
    const set = assets[name];
    const key = assetKey(assets, name);
    if (!set) {
      if (client) problems.push(`release.assets.${name} is required on a Client project: betas ship the beta set, the final Release the production set`);
      continue;
    }
    if (set.files.length && !set.build.length) problems.push(`${key}.files is set but ${key}.build is empty: nothing would produce them`);
    if (!client) continue;
    if (!set.files.length) problems.push(`${key}.files is empty on a Client project: name the files it ships`);
    for (const pattern of set.files) {
      if (!pattern.includes('<version>')) problems.push(`${key}.files pattern ${pattern} has no <version>: it would match the files of every version built`);
    }
  }

  if (client) {
    for (const field of NOTES_FIELDS) {
      if (!settings.notes?.[field]) problems.push(`release.notes.${field} is required on a Client project`);
    }
    problems.push(...checkEnvironments(environments, root, env));
  }
  if (settings.notes?.staging) problems.push('release.notes.staging is replaced by environments.release.launch: move it there (screenshots and dry runs run on the release environment)');
  problems.push(...checkDocuments(settings));
  const guide = settings.notes?.guide;
  if (guide && !fs.existsSync(path.join(root, guide))) problems.push(`release.notes.guide ${guide} doesn't exist`);
  if (settings.changelog && !fs.existsSync(path.join(root, settings.changelog))) problems.push(`release.changelog ${settings.changelog} doesn't exist`);
  return problems;
}
