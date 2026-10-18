import type { RelationFieldConfig } from './fields.js';
import type { ResourceSchema } from './resource.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Populate edilmiş obje veya düz id → id. Tanınmayan değer olduğu gibi döner (BE reddeder). */
export function relationId(value: unknown): unknown {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (isRecord(value) && value.id != null) return String(value.id);
  return value;
}

/** Hücre / seçenek etiketi: populate edilmiş objede `display` alanı, yoksa id. */
export function relationLabel(value: unknown, field: Pick<RelationFieldConfig, 'display'>): string {
  if (value == null) return '';
  if (isRecord(value)) {
    const shown = field.display ? value[field.display] : undefined;
    if (shown != null && typeof shown !== 'object') return String(shown);
    if (isRecord(shown)) return Object.values(shown).filter(v => v != null && v !== '').join(' / ');
    return value.id != null ? String(value.id) : '';
  }
  return String(value);
}

/**
 * Autocomplete'te arama yapılabilir mi (K3): gösterim alanı hedefte string ve `regex` filtreli olmalı.
 * Değilse paket arama yapmadan ilk sayfayı gösterir.
 */
export function canSearchRelation(field: RelationFieldConfig, target: ResourceSchema | undefined): boolean {
  if (!target || !field.display) return false;
  const shown = target.fields.find(f => f.name === field.display);
  return shown !== undefined && shown.kind === 'string' && shown.filter === 'regex';
}
