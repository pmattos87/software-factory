// Embeds a client document's local fonts and images and checks it makes no
// network request:
//   node inline-assets.mjs <in.html> <out.html>
// Paths resolve from the input file's folder. Exits 0 when the output is
// self-contained; 1 when a referenced file is missing, a network reference is
// left, or a shell slot ({{...}}) is unfilled (each one printed). The output
// is written either way, for a look.

import fs from 'node:fs';
import path from 'node:path';
import { inlineAssets, remoteRefs, unfilledSlots } from './lib/inline.mjs';

const ascii = (s) => s.replace(/[^\x20-\x7e]/g, '?');

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.log('Usage: inline-assets.mjs <in.html> <out.html>');
  process.exit(1);
}
const { html, inlined, missing } = inlineAssets(fs.readFileSync(input, 'utf8'), path.dirname(path.resolve(input)));
fs.writeFileSync(output, html);
const remote = remoteRefs(html);
const unfilled = unfilledSlots(html);

console.log(ascii(`${output}: ${inlined.length} file(s) embedded, ${Math.round(Buffer.byteLength(html) / 1024)} KB`));
for (const ref of missing) console.log(ascii(`missing ${ref}`));
for (const ref of remote) console.log(ascii(`network ${ref}`));
for (const slot of unfilled) console.log(ascii(`unfilled ${slot}`));
process.exit(missing.length || remote.length || unfilled.length ? 1 : 0);
