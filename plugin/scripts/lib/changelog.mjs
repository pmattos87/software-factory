// A Release's CHANGELOG section, assembled from one file per Story
// (docs/changes/<KEY>.md) so Stories integrated side by side never edit the
// same lines. Each file holds Keep a Changelog subsections:
//
//   ### Added
//   - The thing (FB-12).
//
// Read by `release-version.mjs changelog`, which promote runs on the Release branch.

export const CHANGES_DIR = 'docs/changes';

const ORDER = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

// Sorts Story keys by board key, then number: FB-9 before FB-10.
export function sortKeys(keys) {
  const parts = (k) => /^(.*?)-(\d+)$/.exec(k) ?? [k, k, '0'];
  return [...keys].sort((a, b) => {
    const [, pa, na] = parts(a);
    const [, pb, nb] = parts(b);
    return pa === pb ? Number(na) - Number(nb) : pa < pb ? -1 : 1;
  });
}

// Subsections of a block of `### Name` headings, as [name, lines] in file order.
// Throws when text other than blank lines comes before the first heading.
export function parseSections(text, where) {
  const sections = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = heading[1];
      if (!sections.has(current)) sections.set(current, []);
    } else if (current) {
      sections.get(current).push(line);
    } else if (line.trim()) {
      throw new Error(`${where}: text before the first ### heading`);
    }
  }
  for (const [name, lines] of sections) sections.set(name, trimBlank(lines));
  return sections;
}

// Builds the changelog with a `## [<version>] - <date>` section holding, in
// Keep a Changelog order, what was left under [Unreleased], what an earlier run
// already wrote for this version, then each Story's entries in key order.
// `stories` is [{ key, text }]. [Unreleased] stays, empty, above the new section.
export function assembleChangelog(changelog, version, date, stories) {
  const crlf = changelog.includes('\r\n');
  const lines = changelog.replace(/\r\n/g, '\n').split('\n');
  const isH2 = (l) => /^##\s/.test(l);
  const find = (re) => lines.findIndex((l) => re.test(l));
  const end = (start) => {
    const next = lines.findIndex((l, i) => i > start && isH2(l));
    return next === -1 ? lines.length : next;
  };
  const escaped = version.replace(/[.]/g, '\\.');

  const merged = new Map();
  const add = (sections) => {
    for (const [name, entries] of sections) {
      if (!entries.length) continue;
      if (!merged.has(name)) merged.set(name, []);
      merged.get(name).push(...entries);
    }
  };

  // Cut the [Unreleased] body and any earlier section for this version out of the file.
  let at = -1;
  for (const re of [/^##\s+\[Unreleased\]/i, new RegExp(`^##\\s+\\[?${escaped}\\]?(\\s|$)`)]) {
    const start = find(re);
    if (start === -1) continue;
    const stop = end(start);
    add(parseSections(lines.slice(start + 1, stop).join('\n'), lines[start].trim()));
    lines.splice(start, stop - start);
    if (at === -1 || start < at) at = start;
  }
  for (const { key, text } of sortKeys(stories.map((s) => s.key)).map((k) => stories.find((s) => s.key === k))) {
    add(parseSections(text.replace(/\r\n/g, '\n'), `${CHANGES_DIR}/${key}.md`));
  }

  if (at === -1) {
    at = lines.findIndex(isH2);
    if (at === -1) at = lines.length;
  }
  const names = [...ORDER.filter((n) => merged.has(n)), ...[...merged.keys()].filter((n) => !ORDER.includes(n))];
  const section = ['## [Unreleased]', '', `## [${version}] - ${date}`, ''];
  for (const name of names) section.push(`### ${name}`, ...merged.get(name), '');
  lines.splice(at, 0, ...section);

  const out = lines.join('\n');
  return crlf ? out.replace(/\n/g, '\r\n') : out;
}

function trimBlank(lines) {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
}
