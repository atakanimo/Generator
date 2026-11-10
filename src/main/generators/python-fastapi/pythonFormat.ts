/**
 * Python source layout for generated files: import blocks in ruff isort order and the line wrapping `ruff format` would
 * produce for the constructs the templates use (imports, class bases, function signatures, calls). G files are kept
 * `ruff check` / `ruff format` clean for the host's line length (skeleton and AlphaTerminal: 110).
 */

export const PY_LINE_LENGTH = 110;

const STDLIB = new Set(['__future__', 'collections', 'datetime', 'decimal', 'enum', 're', 'typing']);
const THIRD_PARTY = new Set(['bson', 'fastapi', 'pydantic', 'pymongo']);

/** ruff isort `order-by-type`: CONSTANTS, then Classes, then names; case-insensitive within a group. */
function memberKey(name: string): [number, string, string] {
  const base = name.split(' as ')[0];
  const type = base.length > 1 && base === base.toUpperCase() && /[A-Z]/.test(base) ? 0 : /^[A-Z]/.test(base) ? 1 : 2;
  return [type, base.toLowerCase(), name];
}

function compareMembers(a: string, b: string): number {
  const [ta, la, na] = memberKey(a);
  const [tb, lb, nb] = memberKey(b);
  return ta - tb || (la < lb ? -1 : la > lb ? 1 : na < nb ? -1 : na > nb ? 1 : 0);
}

function compareModules(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return la < lb ? -1 : la > lb ? 1 : 0;
}

/** `from module import a, b` (one line when it fits, otherwise one name per line). */
export function fromImport(module: string, names: Iterable<string>, indent = ''): string {
  const sorted = [...new Set(names)].sort(compareMembers);
  const line = `${indent}from ${module} import ${sorted.join(', ')}`;
  if (line.length <= PY_LINE_LENGTH) return line;
  return [`${indent}from ${module} import (`, ...sorted.map((n) => `${indent}    ${n},`), `${indent})`].join('\n');
}

/** Collects `from … import …` statements and renders them grouped (future, stdlib, third party, first party). */
export class PyImports {
  private readonly modules = new Map<string, Set<string>>();
  private readonly plain = new Set<string>();

  /** `import module` (listed before the `from` imports of its section, as ruff isort does). */
  module(name: string): this {
    this.plain.add(name);
    return this;
  }

  add(module: string, ...names: string[]): this {
    const set = this.modules.get(module) ?? new Set<string>();
    for (const n of names) set.add(n);
    this.modules.set(module, set);
    return this;
  }


  render(indent = ''): string {
    const sections: string[][] = [[], [], [], []];
    const sectionOf = (module: string) => {
      const top = module.split('.')[0];
      if (top === '__future__') return 0;
      if (STDLIB.has(top)) return 1;
      if (THIRD_PARTY.has(top)) return 2;
      return 3;
    };
    for (const module of [...this.plain].sort(compareModules)) sections[sectionOf(module)].push(`${indent}import ${module}`);
    for (const module of [...this.modules.keys()].sort(compareModules)) {
      sections[sectionOf(module)].push(fromImport(module, this.modules.get(module)!, indent));
    }
    return sections
      .filter((s) => s.length)
      .map((s) => s.join('\n'))
      .join('\n\n');
  }
}

/** `def name(params) -> ret:` wrapped like `ruff format` (all params on one indented line, else one per line). */
export function pyDef(head: string, params: string[], ret: string, indent = '', explode = false): string {
  const one = `${indent}${head}(${params.join(', ')}) -> ${ret}:`;
  if (!explode && one.length <= PY_LINE_LENGTH) return one;
  const inner = `${indent}    ${params.join(', ')}`;
  if (!explode && inner.length <= PY_LINE_LENGTH) return `${indent}${head}(\n${inner}\n${indent}) -> ${ret}:`;
  return [`${indent}${head}(`, ...params.map((p) => `${indent}    ${p},`), `${indent}) -> ${ret}:`].join('\n');
}

/** `class Name(Base[a, b]):` wrapped like `ruff format`. */
export function pyClass(name: string, base: string, typeArgs: string[] = []): string {
  const full = typeArgs.length ? `${base}[${typeArgs.join(', ')}]` : base;
  const one = `class ${name}(${full}):`;
  if (one.length <= PY_LINE_LENGTH) return one;
  if (4 + full.length <= PY_LINE_LENGTH || !typeArgs.length) return `class ${name}(\n    ${full}\n):`;
  const args = `        ${typeArgs.join(', ')}`;
  if (args.length <= PY_LINE_LENGTH) return `class ${name}(\n    ${base}[\n${args}\n    ]\n):`;
  return [`class ${name}(`, `    ${base}[`, ...typeArgs.map((a) => `        ${a},`), '    ]', '):'].join('\n');
}

/** `head(args)` call (decorator, statement), wrapped like `ruff format`. */
export function pyCall(head: string, args: string[], indent = ''): string {
  const one = `${indent}${head}(${args.join(', ')})`;
  if (one.length <= PY_LINE_LENGTH) return one;
  const inner = `${indent}    ${args.join(', ')}`;
  if (inner.length <= PY_LINE_LENGTH) return `${indent}${head}(\n${inner}\n${indent})`;
  return [`${indent}${head}(`, ...args.map((a) => `${indent}    ${a},`), `${indent})`].join('\n');
}

/** `head[args]` (type alias), wrapped like `ruff format`. */
export function pySubscript(head: string, args: string[], indent = ''): string {
  const one = `${indent}${head}[${args.join(', ')}]`;
  if (one.length <= PY_LINE_LENGTH) return one;
  const inner = `${indent}    ${args.join(', ')}`;
  if (inner.length <= PY_LINE_LENGTH) return `${indent}${head}[\n${inner}\n${indent}]`;
  return [`${indent}${head}[`, ...args.map((a) => `${indent}    ${a},`), `${indent}]`].join('\n');
}

/** Python string literal (double quotes, JSON escapes are valid Python escapes). */
export function pyStr(value: string): string {
  return JSON.stringify(value);
}

export function pyNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : '0';
}
