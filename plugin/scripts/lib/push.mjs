// Reads the arguments of a `git push` into what it sends and where.

const OPTS_WITH_VALUE = ['-o', '--push-option', '--repo', '--receive-pack', '--exec'];

export function parsePush(args) {
  const positional = [];
  let all = false;
  let deleting = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (a === '--all' || a === '--mirror' || a === '--branches') all = true;
    else if (a === '-d' || a === '--delete') deleting = true;
    else if (OPTS_WITH_VALUE.includes(a)) i++;
    else if (!a.startsWith('-')) positional.push(a);
  }
  const [remote, ...refspecs] = positional;
  return { remote, all, refspecs: refspecs.map((r) => parseRefspec(r, deleting)) };
}

// `[+]<src>[:<dst>]` -> { src, dst } with refs/heads/ stripped; src null on a delete.
function parseRefspec(spec, deleting) {
  const s = spec.replace(/^\+/, '');
  const colon = s.indexOf(':');
  const src = colon === -1 ? s : s.slice(0, colon);
  const dst = colon === -1 ? s : s.slice(colon + 1);
  const strip = (r) => r.replace(/^refs\/heads\//, '');
  if (deleting) return { src: null, dst: strip(s) };
  return { src: src === '' ? null : strip(src), dst: strip(dst) };
}
