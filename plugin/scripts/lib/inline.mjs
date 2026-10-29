// Makes a client document self-contained: every local font, image or
// stylesheet it references becomes a data: URI, so the file looks the same
// offline and makes no network request. Used by the test-guide and
// release-notes skills before a document goes to the client.

import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.css': 'text/css',
};

const REMOTE = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const SKIP = /^(?:data:|#|javascript:|mailto:|tel:|about:)/i;

// References a document makes: CSS url(...), and src/href attributes.
const REFS = [
  /url\(\s*(['"]?)([^'")]+)\1\s*\)/g,
  /\b(?:src|href)\s*=\s*(["'])([^"']+)\1/g,
];

// Network references left in a document: what the page would load from
// elsewhere when opened. A plain link (<a href>) loads nothing until clicked,
// so it doesn't count.
export function remoteRefs(html) {
  const found = new Set();
  const add = (ref) => REMOTE.test(ref.trim()) && found.add(ref.trim());
  for (const m of html.matchAll(REFS[0])) add(m[2]);
  for (const m of html.matchAll(/<(\w+)\b[^>]*?\b(?:src|href)\s*=\s*(["'])([^"']+)\2/gi)) if (m[1].toLowerCase() !== 'a') add(m[3]);
  for (const m of html.matchAll(/@import\s+(['"])([^'"]+)\1/g)) add(m[2]);
  return [...found];
}

// Replaces each local reference with a data: URI, relative to `baseDir`.
// Returns { html, inlined, missing }: the files embedded, and the ones not found.
export function inlineAssets(html, baseDir) {
  const inlined = new Set();
  const missing = new Set();
  const toData = (ref) => {
    const clean = ref.trim().split(/[?#]/)[0];
    if (!clean || SKIP.test(clean) || REMOTE.test(clean)) return null;
    const type = TYPES[path.extname(clean).toLowerCase()];
    if (!type) return null;
    const file = path.resolve(baseDir, decodeURIComponent(clean));
    if (!fs.existsSync(file)) {
      missing.add(ref.trim());
      return null;
    }
    inlined.add(ref.trim());
    return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
  };
  let out = html.replace(REFS[0], (all, q, ref) => {
    const data = toData(ref);
    return data ? `url("${data}")` : all;
  });
  out = out.replace(REFS[1], (all, q, ref) => {
    const data = toData(ref);
    return data ? all.replace(ref, data) : all;
  });
  return { html: out, inlined: [...inlined], missing: [...missing] };
}

// Shell slots ({{...}}) left in a filled document, each once, outside the
// shell's own header comment.
export function unfilledSlots(html) {
  const body = html.replace(/^<!doctype html>\s*<!--[\s\S]*?-->/i, '');
  return [...new Set(body.match(/\{\{[^{}\n]*\}\}/g) ?? [])];
}
