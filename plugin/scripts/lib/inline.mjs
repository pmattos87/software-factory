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

const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
const CSS_IMPORT = /@import\s+(['"])([^'"]+)\1/g;
const TAG = /<([a-z][\w-]*)\b([^>]*)>/gi;
// An attribute that loads something, quoted or not: src="x", src='x', src=x.
const ATTR = /\b(src|href|srcset|poster|data)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
// Links load nothing until clicked.
const LINKS = new Set(['a', 'area']);

// A srcset's candidates, as the HTML spec splits them: a URL is a run of
// non-space characters (so a data: URL keeps its comma), and a candidate ends
// at a comma after its descriptors or at commas closing its URL.
export function srcsetCandidates(value) {
  const out = [];
  let i = 0;
  while (i < value.length) {
    while (i < value.length && /[\s,]/.test(value[i])) i++;
    if (i >= value.length) break;
    let j = i;
    while (j < value.length && !/\s/.test(value[j])) j++;
    let url = value.slice(i, j);
    let descriptor = '';
    if (/,$/.test(url)) {
      url = url.replace(/,+$/, '');
    } else {
      let k = j;
      while (k < value.length && value[k] !== ',') k++;
      descriptor = value.slice(j, k).trim();
      j = k;
    }
    out.push({ url, descriptor });
    i = j;
  }
  return out;
}

const joinSrcset = (candidates) => candidates.map((c) => (c.descriptor ? `${c.url} ${c.descriptor}` : c.url)).join(', ');

// Each URL a tag attribute loads: one for src/href/poster/data, one per
// candidate for srcset ("a.png 1x, b.png 2x").
function attrUrls(name, value) {
  if (name.toLowerCase() !== 'srcset') return [value.trim()];
  return srcsetCandidates(value).map((c) => c.url);
}

// Calls `fn(url)` for every reference that would load when the page opens,
// and replaces it with what `fn` returns (or leaves it when that is null).
function eachRef(html, fn) {
  const swap = (url) => fn(url) ?? url;
  let out = html.replace(CSS_URL, (all, q, ref) => {
    const next = fn(ref.trim());
    return next ? `url("${next}")` : all;
  });
  out = out.replace(CSS_IMPORT, (all, q, ref) => {
    const next = fn(ref.trim());
    return next ? `@import "${next}"` : all;
  });
  return out.replace(TAG, (tag, name, attrs) => {
    if (LINKS.has(name.toLowerCase())) return tag;
    const rewritten = attrs.replace(ATTR, (all, attr, dq, sq, bare) => {
      const value = dq ?? sq ?? bare;
      if (attr.toLowerCase() === 'srcset') {
        const candidates = srcsetCandidates(value);
        const swapped = candidates.map((c) => ({ ...c, url: swap(c.url) }));
        return swapped.some((c, n) => c.url !== candidates[n].url) ? `${attr}="${joinSrcset(swapped)}"` : all;
      }
      const next = swap(value.trim());
      return next === value ? all : `${attr}="${next}"`;
    });
    return `<${name}${rewritten}>`;
  });
}

// Network references left in a document: what the page would load from
// elsewhere when opened. A plain link (<a href>) loads nothing until clicked,
// so it doesn't count.
export function remoteRefs(html) {
  const found = new Set();
  const add = (ref) => REMOTE.test(ref) && found.add(ref);
  for (const m of html.matchAll(CSS_URL)) add(m[2].trim());
  for (const m of html.matchAll(CSS_IMPORT)) add(m[2].trim());
  for (const [, name, attrs] of html.matchAll(TAG)) {
    if (LINKS.has(name.toLowerCase())) continue;
    for (const [, attr, dq, sq, bare] of attrs.matchAll(ATTR)) attrUrls(attr, dq ?? sq ?? bare).forEach(add);
  }
  return [...found];
}

// Replaces each local reference with a data: URI, relative to `baseDir`.
// Returns { html, inlined, missing }: the files embedded, and the ones not found.
export function inlineAssets(html, baseDir) {
  const inlined = new Set();
  const missing = new Set();
  const out = eachRef(html, (ref) => {
    const clean = ref.split(/[?#]/)[0];
    if (!clean || SKIP.test(ref) || REMOTE.test(ref)) return null;
    const type = TYPES[path.extname(clean).toLowerCase()];
    if (!type) return null;
    const file = path.resolve(baseDir, decodeURIComponent(clean));
    if (!fs.existsSync(file)) {
      missing.add(ref);
      return null;
    }
    inlined.add(ref);
    return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
  });
  return { html: out, inlined: [...inlined], missing: [...missing] };
}

// Shell slots ({{...}}) left in a filled document, each once, outside the
// shell's own header comment.
export function unfilledSlots(html) {
  const body = html.replace(/^<!doctype html>\s*<!--[\s\S]*?-->/i, '');
  return [...new Set(body.match(/\{\{[^{}\n]*\}\}/g) ?? [])];
}
