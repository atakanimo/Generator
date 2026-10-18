/**
 * Core bootstrap assets are only created when missing; an existing host file is kept as is. A new asset may
 * import a name its sibling asset exports but the host's older copy of that sibling does not — creating it
 * would break the host's `tsc` (Varlik360: `pino-stdout-file-tee.ts` → `getDailySystemLogFilePathFor`).
 * This finds those names so the asset is skipped instead (plan 6 §7).
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

/** Named value imports from relative modules: `import { a, b as c, type T } from './x'` → `./x` → [a, b]. */
export function relativeNamedImports(source: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"](\.{1,2}\/[^'"]+)['"]/g;
  for (const m of source.matchAll(re)) {
    if (m[1]) continue; // `import type { … }`: erased, cannot break the build at runtime but still checked by tsc
    const names = m[2]
      .split(',')
      .map(part => part.trim())
      .filter(part => part && !part.startsWith('type '))
      .map(part => part.split(/\s+as\s+/)[0].trim());
    if (names.length) out.set(m[3], [...(out.get(m[3]) ?? []), ...names]);
  }
  return out;
}

function resolveModuleFile(fromFile: string, spec: string): string | null {
  const base = join(dirname(fromFile), spec);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}.js`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function exportsName(source: string, name: string): boolean {
  const n = name.replace(/[$]/g, '\\$');
  if (new RegExp(`export\\s+(?:async\\s+)?(?:function\\*?|const|let|var|class|enum|type|interface)\\s+${n}\\b`).test(source)) return true;
  if (/export\s*\*\s*from/.test(source)) return true; // re-export barrel: cannot tell cheaply, assume present
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    const names = m[1].split(',').map(part => part.trim().split(/\s+as\s+/).pop()?.trim());
    if (names.includes(name)) return true;
  }
  return false;
}

/**
 * `import { name } from './x'` entries of `assetSource` (to be written at `targetPath`) that the host's existing
 * `./x` does not export. A sibling that does not exist yet (it is created from its own asset) is not checked.
 */
export function missingHostExports(assetSource: string, targetPath: string): string[] {
  const missing: string[] = [];
  for (const [spec, names] of relativeNamedImports(assetSource)) {
    const file = resolveModuleFile(targetPath, spec);
    if (!file) continue;
    const content = readFileSync(file, 'utf8');
    for (const name of names) if (!exportsName(content, name)) missing.push(`${spec}#${name}`);
  }
  return missing;
}
