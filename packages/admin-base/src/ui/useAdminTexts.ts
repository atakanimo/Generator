import { useMemo } from 'react';
import { useAtaAdmin } from '../react/context.js';
import type { FieldConfig } from '../schema/fields.js';
import type { ResourceSchema } from '../schema/resource.js';
import { adminBaseTexts, humanize, type AdminTextKey } from './texts.js';

/**
 * Tüm metinler host `t`'sinden geçer (karar 16.10.2026). Anahtar düzeni:
 * - paket: `ataAdmin.<key>`
 * - resource başlığı: `admin.<resource>.title`
 * - alan: `admin.<resource>.fields.<alan>` (nested alt alan: `<üst>_<alt>`)
 * - enum değeri: `admin.<resource>.enums.<alan>.<değer>`
 */
export function useAdminTexts() {
  const { t } = useAtaAdmin();
  return useMemo(() => {
    const text = (key: AdminTextKey, vars?: Record<string, unknown>) =>
      t(`ataAdmin.${key}`, { defaultValue: adminBaseTexts.ataAdmin[key], ...vars });

    const resourceTitle = (resource: ResourceSchema) =>
      t(`admin.${resource.name}.title`, { defaultValue: resource.label ?? humanize(resource.name) });

    /** `labelKey` verilmezse `admin.<resource>.fields.<path>`. */
    const fieldLabel = (labelKey: string, field: FieldConfig) =>
      t(labelKey, { defaultValue: field.label ?? humanize(field.name) });

    const enumLabel = (resource: ResourceSchema, fieldName: string, value: string) =>
      t(`admin.${resource.name}.enums.${fieldName}.${value}`, { defaultValue: value });

    /** Elle yazılan metinler (action label vb.): anahtar da olabilir düz metin de. */
    const literal = (value: string) => t(value, { defaultValue: value });

    return { t, text, resourceTitle, fieldLabel, enumLabel, literal };
  }, [t]);
}

export type AdminTexts = ReturnType<typeof useAdminTexts>;

export function fieldLabelKey(resource: ResourceSchema, path: readonly string[]): string {
  return `admin.${resource.name}.fields.${path.join('_')}`;
}
