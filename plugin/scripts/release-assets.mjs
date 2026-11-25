// Lists the files one asset set ships for one version, from the project's repo root,
// after its build commands ran:
//   node release-assets.mjs beta <version>         a Client beta's installer
//   node release-assets.mjs production <version>   the final Release's assets
// <version> in each files pattern is replaced by the version. Prints one matching file
// per line; exits 1, naming the pattern, when a pattern matches nothing or the set
// isn't configured. The old single release.assets is the production set. A project
// with no release.assets at all ships no files: it prints nothing and exits 0 (SF-152).

import fs from 'node:fs';
import { loadConfig, CONFIG_PATH } from './lib/config.mjs';
import { ASSET_SETS, assetKey, assetPatterns } from './lib/release.mjs';

const [name, version] = process.argv.slice(2);
if (!ASSET_SETS.includes(name) || !version) {
  console.log('usage: node release-assets.mjs <beta|production> <version>');
  process.exit(2);
}
const config = loadConfig(process.cwd());
if (!config) {
  console.log(`FAIL no ${CONFIG_PATH} in ${process.cwd()}`);
  process.exit(1);
}
const { assets } = config.release;
if (assets.none) process.exit(0);
const set = assets[name];
if (!set || !set.files.length) {
  console.log(set ? `FAIL ${assetKey(assets, name)}.files is empty` : `FAIL release.assets.${name} is not set`);
  process.exit(1);
}
let failed = false;
for (const pattern of assetPatterns(set, version)) {
  const found = fs.globSync(pattern).filter((file) => fs.statSync(file).isFile());
  if (!found.length) {
    console.log(`FAIL ${pattern} matches no file`);
    failed = true;
  }
  for (const file of found) console.log(file.replaceAll('\\', '/'));
}
process.exit(failed ? 1 : 0);
