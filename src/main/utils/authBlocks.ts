/**
 * Auth asset files carry their module conditions as comment lines, so each file stays valid source in its own
 * language (TS / C# `//`, Python `#`):
 *
 *   // @auth-file google|apple        first line: the whole file is written only when one of the modules is on
 *   // @if register|password-reset    lines up to the matching `@endif` are kept only when one of them is on
 *   // @else                          optional, kept when none of them is on
 *   // @endif
 *
 * Marker lines never reach the host. Blocks nest.
 */
import type { AuthModule } from '../../shared/authModules.js';

const MARKER = /^\s*(?:\/\/|#)\s*@(auth-file|if|else|endif)\b\s*(.*)$/;

function anyOn(expr: string, modules: readonly AuthModule[]): boolean {
  return expr
    .split('|')
    .map((m) => m.trim())
    .filter(Boolean)
    .some((m) => modules.includes(m as AuthModule));
}

/** `null` → the file is not written for these modules (`@auth-file` condition false). */
export function applyAuthBlocks(text: string, modules: readonly AuthModule[]): string | null {
  const lines = text.split('\n');
  const first = MARKER.exec(lines[0] ?? '');
  if (first?.[1] === 'auth-file') {
    if (!anyOn(first[2], modules)) return null;
    lines.shift();
  }
  const out: string[] = [];
  /** One entry per open `@if`: is this branch kept, and was the parent kept. */
  const stack: Array<{ keep: boolean; parent: boolean; cond: boolean }> = [];
  const keeping = () => (stack.length === 0 ? true : stack[stack.length - 1].keep);
  for (const line of lines) {
    const m = MARKER.exec(line);
    if (!m || m[1] === 'auth-file') {
      if (keeping()) out.push(line);
      continue;
    }
    if (m[1] === 'if') {
      const parent = keeping();
      const cond = anyOn(m[2], modules);
      stack.push({ keep: parent && cond, parent, cond });
    } else if (m[1] === 'else') {
      const top = stack[stack.length - 1];
      if (!top) throw new Error('auth block: @else without @if');
      top.keep = top.parent && !top.cond;
    } else {
      if (!stack.pop()) throw new Error('auth block: @endif without @if');
    }
  }
  if (stack.length) throw new Error('auth block: @if without @endif');
  return out.join('\n');
}
