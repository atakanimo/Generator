/**
 * Canonical custom block markers: `// <name>` … `// </name>`.
 * Used by BackendGenerator and model saving when merging on update.
 */
export const DEFAULT_CUSTOM_BLOCK_MARKER_NAMES = [
  'custom-imports',
  'custom-types',
  'custom-methods',
  'custom-routes',
  'custom-schema',
  'custom-filter-fields',
  'custom-filter-fields-admin',
  'custom-tojson-transform'
] as const;

export function getDefaultCustomBlockMarkerNames(): string[] {
  return [...DEFAULT_CUSTOM_BLOCK_MARKER_NAMES];
}

/** Markers that actually appear in `source` (both open and close). Used so merge does not validate markers the template no longer emits. */
export function getCustomBlockMarkersPresentInSource(
  source: string,
  markerNames: string[] = getDefaultCustomBlockMarkerNames()
): string[] {
  return markerNames.filter((name) => {
    const open = `// <${name}>`;
    const close = `// </${name}>`;
    return source.includes(open) && source.includes(close);
  });
}
