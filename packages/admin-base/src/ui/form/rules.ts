import dayjs from 'dayjs';
import type { FieldConfig } from '../../schema/fields.js';
import { isEmptyValue } from '../format.js';
import type { AdminTextKey } from '../texts.js';

/** Nokta veya virgül ayırıcı kabul edilir; gönderimde noktaya çevrilir (`values.ts`). */
const DECIMAL_PATTERN = /^-?\d+([.,]\d+)?$/;

/**
 * react-hook-form `validate`'i config'ten türetilir (zod yok, karar 16.10.2026).
 * Hata metni anahtarı döner; mesaj alanın altında gösterilir. Son söz BE'de.
 */
export function validateField(field: FieldConfig, value: unknown, mode: 'create' | 'edit' = 'create'): AdminTextKey | true {
  if (isEmptyValue(value)) {
    // Yalnızca yazılan alan (şifre) edit'te boş bırakılabilir: değişmez.
    if (field.writeOnly && mode === 'edit') return true;
    return field.required && field.kind !== 'boolean' ? 'required' : true;
  }
  const values = Array.isArray(value) ? value : [value];
  switch (field.kind) {
    case 'number':
      return values.every(v => Number.isFinite(Number(v))) ? true : 'invalidNumber';
    case 'decimal':
      return values.every(v => DECIMAL_PATTERN.test(String(v).trim())) ? true : 'invalidDecimal';
    case 'datetime':
      return values.every(v => dayjs(v as string).isValid()) ? true : 'invalidDate';
    case 'json':
      try {
        if (typeof value === 'string') JSON.parse(value);
        return true;
      } catch {
        return 'invalidJson';
      }
    default:
      return true;
  }
}
