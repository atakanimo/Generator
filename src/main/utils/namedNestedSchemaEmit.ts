import { extractCustomBlock } from './customBlockMerge.js';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type NamedNestedEmitEntry = {
  nestedTypeName: string;
  nestedSchemaName: string;
};

/**
 * Drop generator-owned named nested blocks when the **complete** pair
 * (interface + `const XxxSchema`) already lives in `// <custom-types>`.
 *
 * AND (not OR): omitting when only one half is present would leave the other
 * half missing while the main schema still references it.
 */
export function filterNamedNestedNotOwnedByCustomTypes<T extends NamedNestedEmitEntry>(
  named: T[],
  existingModelSource: string | undefined | null
): T[] {
  if (named.length === 0 || !existingModelSource) return named;

  const customTypes = extractCustomBlock(existingModelSource, 'custom-types').content ?? '';
  if (!customTypes.trim()) return named;

  return named.filter(entry => {
    const schemaRe = new RegExp(`\\bconst\\s+${escapeRegExp(entry.nestedSchemaName)}\\s*=`);
    const typeRe = new RegExp(`\\b(?:export\\s+)?interface\\s+${escapeRegExp(entry.nestedTypeName)}\\b`);
    const hasSchema = schemaRe.test(customTypes);
    const hasInterface = typeRe.test(customTypes);
    // Only skip emit when the hand-written block owns the full pair.
    return !(hasSchema && hasInterface);
  });
}
