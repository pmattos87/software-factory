// Where a Client project's release documents live, outside every repo:
//   <releasesRoot>\<project>\Release <version>\            the final Release's notes
//   <releasesRoot>\<project>\Release <version>\beta.<n>\   one beta's documents and sources
// The Releases root is machine-level, in ~/.claude/factory.user.json (the file
// FACTORY_USER_CONFIG names, when set). The project's folder is
// release.documents.folder, or the repo folder's name.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git } from './git.mjs';

export const USER_CONFIG_ENV = 'FACTORY_USER_CONFIG';

export function userConfigPath(env = process.env) {
  return env[USER_CONFIG_ENV] || path.join(os.homedir(), '.claude', 'factory.user.json');
}

// The machine's Factory settings; {} when the file doesn't exist. Throws on invalid JSON.
export function loadUserConfig(file = userConfigPath()) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${file} is not valid JSON: ${e.message}`);
  }
}

// The repo folder's name. In a linked worktree it is the main checkout's, not the worktree's.
export function repoFolderName(root) {
  const common = git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  if (common && path.basename(common) === '.git') return path.basename(path.dirname(common));
  return path.basename(path.resolve(root));
}

export function projectFolder(root, release) {
  return release?.documents?.folder || repoFolderName(root);
}

// A Release's folder, or one beta's inside it when `beta` is given.
export function releaseFolder(releasesRoot, project, version, beta) {
  const folder = path.join(releasesRoot, project, `Release ${version}`);
  return beta ? path.join(folder, `beta.${beta}`) : folder;
}

const inside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// Problems with the Releases root; empty when a Client project can write its documents.
export function checkReleasesRoot(user, root, file = userConfigPath()) {
  const releasesRoot = user?.releasesRoot;
  if (!releasesRoot) return [`releasesRoot is not set in ${file}: name the folder that holds every project's Release documents`];
  if (!path.isAbsolute(releasesRoot)) return [`releasesRoot ${releasesRoot} in ${file} must be an absolute path`];
  if (!fs.existsSync(releasesRoot) || !fs.statSync(releasesRoot).isDirectory()) return [`releasesRoot ${releasesRoot} doesn't exist`];
  if (inside(path.resolve(releasesRoot), path.resolve(root))) return [`releasesRoot ${releasesRoot} is inside the repo: nothing under it is ever committed`];
  return [];
}

// Problems with release.documents; empty when it is unset or a plain folder name.
export function checkDocuments(release) {
  const folder = release?.documents?.folder;
  if (folder === undefined || folder === null) return [];
  if (typeof folder !== 'string' || !folder.trim() || /[\\/]/.test(folder) || folder === '.' || folder === '..') {
    return [`release.documents.folder ${JSON.stringify(folder)} must be a plain folder name, with no path`];
  }
  return [];
}
