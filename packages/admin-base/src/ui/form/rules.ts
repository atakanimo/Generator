import dayjs from 'dayjs';
import type { FieldConfig } from '../../schema/fields.js';
import { isEmptyValue } from '../format.js';
import { DATE_ONLY_PATTERN, EMAIL_PATTERN } from '../patterns.js';
import type { AdminTextKey } from '../texts.js';

/** Nokta veya virgül ayırıcı kabul edilir; gönderimde noktaya çevrilir (`values.ts`). */
const DECIMAL_PATTERN = /^-?\d+([.,]\d+)?$/;

function matchesPattern(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}

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
      if (!values.every(v => Number.isFinite(Number(v)))) return 'invalidNumber';
      if (field.numberFormat === 'int' && !values.every(v => Number.isInteger(Number(v)))) return 'invalidInteger';
      break;
    case 'decimal':
      if (!values.every(v => DECIMAL_PATTERN.test(String(v).trim()))) return 'invalidDecimal';
      break;
    case 'datetime':
      if (field.dateFormat === 'date') {
        if (!values.every(v => DATE_ONLY_PATTERN.test(String(v).trim()) && dayjs(String(v)).isValid())) return 'invalidDate';
      } else if (!values.every(v => dayjs(v as string).isValid())) return 'invalidDate';
      break;
    case 'json':
      try {
        if (typeof value === 'string') JSON.parse(value);
        return true;
      } catch {
        return 'invalidJson';
      }
    default:
      break;
  }
  return checkLimits(field, value);
}

/** Tekil alanların sınırları ve e-posta biçimi; dizi alanlarında sınır yok (BE ile aynı kural). */
function checkLimits(field: FieldConfig, value: unknown): AdminTextKey | true {
  if (field.isArray) return true;
  const c = field.constraints;
  if (typeof value === 'string') {
    if (field.format === 'email' && !EMAIL_PATTERN.test(value.trim())) return 'invalidEmail';
    if (c?.minLength != null && value.length < c.minLength) return 'tooShort';
    if (c?.maxLength != null && value.length > c.maxLength) return 'tooLong';
    if (c?.pattern && !matchesPattern(c.pattern, value)) return 'invalidPattern';
  }
  if (field.kind === 'number' || field.kind === 'decimal') {
    const n = Number(String(value).trim().replace(',', '.'));
    if (c?.min != null && n < c.min) return 'tooSmall';
    if (c?.max != null && n > c.max) return 'tooLarge';
  }
  return true;
}
