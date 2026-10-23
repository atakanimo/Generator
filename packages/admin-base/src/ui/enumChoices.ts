import type { FieldConfig } from '../schema/fields.js';

/** Bir enum seçeneği: gönderilen / saklanan değer ve gösterilecek etiketin anahtarı. */
export interface EnumChoice {
  value: string | number;
  label: string;
}

/**
 * Filtre, form ve hücrenin ortak seçenek listesi. Sayısal enum'da (`numbers`) değer `numbers[i]`, etiket `options[i]`;
 * diğerlerinde ikisi aynı string. `loaded` (`loadOptions` sonucu) her zaman string değerdir.
 */
export function enumChoices(field: FieldConfig, loaded?: readonly string[]): EnumChoice[] {
  if (!loaded && field.kind === 'enum' && field.numbers) {
    const numbers = field.numbers;
    return field.options.map((label, i) => ({ value: numbers[i] ?? i, label }));
  }
  const options = loaded ?? (field.kind === 'enum' ? field.options : []);
  return options.map(option => ({ value: option, label: option }));
}

/** Saklanan değerin etiketi (sayısal enum'da `numbers` içindeki yerine göre); bulunamazsa değerin kendisi. */
export function enumLabelOf(field: FieldConfig, value: unknown): string {
  if (field.kind === 'enum' && field.numbers) {
    const index = field.numbers.indexOf(Number(value));
    return index >= 0 ? field.options[index] ?? String(value) : String(value);
  }
  return String(value);
}

/** Select'in döndürdüğü ham değeri alanın tipine çevirir (sayısal enum → number). */
export function enumValueFromInput(field: FieldConfig, raw: unknown): unknown {
  if (raw === '' || raw == null) return raw;
  return field.kind === 'enum' && field.numbers ? Number(raw) : raw;
}
