// Test helper: load a game module as a data URL with its import specifiers
// rewritten, so 'three' can point at the real engine or at a stub, and
// relative imports resolve to rewritten data URLs too. Results are cached
// per (url, engine) pair.
import { readFile } from 'node:fs/promises';

const cache = new Map();
const realEngine = new URL('../game/vendor/three/three.module.min.js', import.meta.url).href;

export async function moduleURL(url, engine = realEngine) {
  const key = String(url) + '|' + engine;
  if (cache.has(key)) return cache.get(key);
  let code = await readFile(new URL(url), 'utf8');
  const specs = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  for (const spec of new Set(specs)) {
    if (spec === 'three') {
      code = code.replaceAll(`'three'`, JSON.stringify(engine));
    } else if (spec.startsWith('.')) {
      const target = await moduleURL(new URL(spec, url), engine);
      code = code.replaceAll(`'${spec}'`, JSON.stringify(target));
    }
  }
  const out = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  cache.set(key, out);
  return out;
}

export async function loadModule(name, engine) {
  return import(await moduleURL(new URL('../game/' + name, import.meta.url), engine));
}
