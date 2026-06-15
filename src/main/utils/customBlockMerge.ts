/**
 * Shared merge helpers for generated files with // <marker> ... // </marker> regions.
 * Marker names: see `customBlockMarkers.ts` (`DEFAULT_CUSTOM_BLOCK_MARKER_NAMES`).
 * Used by BackendGenerator and FrontendGenerator on update (same marker set).
 */

export type CustomBlockMergeResult = { merged: string } | { merged: null; error: string };

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function validateMarkerStructure(content: string, markerName: string): { valid: boolean; error?: string } {
  const startMarker = `// <${markerName}>`;
  const endMarker = `// </${markerName}>`;

  const startMatches = content.match(new RegExp(escapeRegex(startMarker), 'g')) || [];
  const endMatches = content.match(new RegExp(escapeRegex(endMarker), 'g')) || [];

  if (startMatches.length === 0 && endMatches.length === 0) {
    return { valid: true };
  }

  if (startMatches.length !== 1 || endMatches.length !== 1) {
    return {
      valid: false,
      error: `Malformed marker state for <${markerName}>: expected exactly one opening and one closing marker`
    };
  }

  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return {
      valid: false,
      error: `Missing or malformed markers for <${markerName}>`
    };
  }

  return { valid: true };
}

export function extractCustomBlock(content: string, markerName: string): { content?: string; error?: string } {
  const startMarker = `// <${markerName}>`;
  const endMarker = `// </${markerName}>`;
  const markerValidation = validateMarkerStructure(content, markerName);
  if (!markerValidation.valid) {
    return {
      error: markerValidation.error
    };
  }

  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex === -1 && endIndex === -1) {
    return {};
  }

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return { error: `Missing or malformed markers for <${markerName}>` };
  }

  const blockStart = startIndex + startMarker.length;
  return {
    content: content.slice(blockStart, endIndex)
  };
}

export function mergeCustomBlock(content: string, markerName: string, customContent: string): { success: boolean; content?: string; error?: string } {
  const startMarker = `// <${markerName}>`;
  const endMarker = `// </${markerName}>`;
  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return { success: false, error: `Rendered template is missing markers for <${markerName}>` };
  }

  const before = content.slice(0, startIndex + startMarker.length);
  const after = content.slice(endIndex);

  return {
    success: true,
    content: `${before}${customContent}${after}`
  };
}

export interface ApplyCustomBlockMergeParams {
  existingContent: string;
  renderedContent: string;
  markerNames: string[];
  /**
   * @deprecated Prefix replacement removed — custom-imports body merges like other markers
   * so rendered standard imports above the marker are kept on update.
   */
  customImportsPrecedence?: boolean;
}

/**
 * Merge extracted custom blocks from existing file into freshly rendered content.
 * Returns `merged: null` when extraction/merge fails (caller should abort write).
 */
export function applyCustomBlockMerge(params: ApplyCustomBlockMergeParams): CustomBlockMergeResult {
  const { existingContent, renderedContent, markerNames } = params;

  const extractedBlocks: Record<string, string> = {};

  for (const markerName of markerNames) {
    const extraction = extractCustomBlock(existingContent, markerName);
    if (extraction.error) {
      return { merged: null, error: extraction.error };
    }
    if (extraction.content !== undefined) {
      extractedBlocks[markerName] = extraction.content;
    }
  }

  let mergedContent = renderedContent;

  for (const [markerName, customContent] of Object.entries(extractedBlocks)) {
    const mergeResult = mergeCustomBlock(mergedContent, markerName, customContent);
    if (!mergeResult.success || !mergeResult.content) {
      return {
        merged: null,
        error: mergeResult.error || `Failed to merge marker ${markerName}`
      };
    }
    mergedContent = mergeResult.content;
  }

  return { merged: mergedContent };
}
