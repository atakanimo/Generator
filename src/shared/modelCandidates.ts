import type { ScannedModel } from './ipcTypes.js';

/**
 * PascalCase entity name from a scanned model file name, for every stack:
 * `user-profile.model.ts` → `UserProfile`, `Order.cs` → `Order`,
 * `market_pulse/model_generated.py` → `MarketPulse`.
 */
export function entityNameFromFileName(fileName: string): string {
  const clean = fileName
    .replace(/\.(py|cs|ts|js)$/i, '')
    .replace(/\.(model|schema|entity)$/i, '')
    .replace(/[/\\](model|model_generated)$/i, '');
  return clean
    .split(/[-_/\\]/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Unique, sorted model / entity names from scanned project models (ref target options).
 * Prefers `entityName` (manifest or parsed model); otherwise derives it from the file name.
 */
export function modelCandidatesFromScanned(models: ScannedModel[] | undefined | null): string[] {
  if (!models || !Array.isArray(models)) return [];
  const names = new Set<string>();

  for (const m of models) {
    const name = m.entityName?.trim() || (m.fileName ? entityNameFromFileName(m.fileName) : '');
    if (name) names.add(name);
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}
