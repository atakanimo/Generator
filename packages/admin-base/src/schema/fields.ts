import type { DateRangeFilterValue, Id, PopulatedRef, RangeFilterValue } from '../contract/api.js';

export type FieldKind =
  | 'string'
  | 'number'
  | 'decimal'
  | 'boolean'
  | 'datetime'
  | 'enum'
  | 'relation'
  | 'object'
  | 'map'
  /** Serbest JSON değer (ör. Mongoose `Mixed`): tabloda kısaltılmış JSON, formda JSON metni. */
  | 'json'
  /** Yüklenecek dosya (`File`). Yalnızca action `input`'unda; varsa action multipart gönderilir. */
  | 'file';

/** Form açıldığında hesaplanan create başlangıç değeri. `currentUserId`: `AtaAdminProvider.getCurrentUserId`. */
export interface DynamicDefault {
  dynamic: 'now' | 'uuid' | 'currentUserId';
}

export type FilterType = 'eq' | 'regex' | 'range' | 'date-range' | 'boolean' | 'enum' | 'relation';

interface FieldCommon {
  name: string;
  label?: string;
  isArray?: boolean;
  required?: boolean;
  nullable?: boolean;
  readonly?: boolean;
  hideOnCreate?: boolean;
  hideOnUpdate?: boolean;
  /**
   * Cevapta hiç gelmez, yalnızca yazılır (ör. şifre): tabloda ve filtrede yok; formda gizli giriş (`string`'de
   * `type=password`), edit'te boş başlar ve boş bırakılırsa gönderilmez; `required` yalnızca create'te geçerli.
   */
  writeOnly?: boolean;
  /** Tabloda kolon olarak gösterilir. */
  list?: boolean;
  /**
   * Kolonda sunucu sıralaması. `false` → kapalı (BE bu alana göre sıralamıyorsa). Varsayılan: skaler, dizi olmayan
   * alanlarda açık; `true` ilişki / obje / dizi alanını sıralanabilir yapmaz.
   */
  sortable?: boolean;
  filter?: FilterType;
  /** Create formunun başlangıç değeri: sabit ya da form açılınca hesaplanan (`DynamicDefault`). */
  default?: string | number | boolean | null | DynamicDefault;
  /**
   * Form / hücre bileşeni ipucu (yalnızca `string`): `textarea` → çok satırlı metin,
   * `image` → URL girişi + önizleme, tabloda küçük resim.
   */
  component?: 'textarea' | 'image';
  /** `string`: e-posta. */
  format?: 'email';
  /** `number`: tam sayı. Yoksa ondalık serbest. */
  numberFormat?: 'int' | 'float';
  /** `datetime`: yalnızca takvim günü (`YYYY-MM-DD`). Yoksa tarih + saat. */
  dateFormat?: 'date' | 'datetime';
  /** İstek sınırları (Generator modelindeki `constraints`); yalnızca tekil alanlarda. */
  constraints?: FieldConstraints;
}

/** Metin uzunluğu ve deseni (`string`), alt / üst sınır (`number`, `decimal`). Dizi alanlarında kullanılmaz. */
export interface FieldConstraints {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
}

export interface ScalarFieldConfig extends FieldCommon {
  /** `decimal` ve `datetime` JSON'da string'dir (K5). */
  kind: 'string' | 'number' | 'decimal' | 'boolean' | 'datetime';
}

export interface EnumFieldConfig extends FieldCommon {
  kind: 'enum';
  options: readonly string[];
  /** Sayısal enum: `options[i]` etiketi, `numbers[i]` gönderilen / saklanan değer. */
  numbers?: readonly number[];
}

export interface RelationFieldConfig extends FieldCommon {
  kind: 'relation';
  /** Hedef resource'un `name`'i (registry anahtarı). */
  ref: string;
  /** Ekranda gösterilen alan (Generator: `relationProperty`). */
  display?: string;
  /** BE'nin objeye eklediği alanlar (Generator: `relationPopulateFields`). */
  populate?: readonly string[];
}

export interface ObjectFieldConfig extends FieldCommon {
  kind: 'object';
  fields: readonly FieldConfig[];
  /** Named nested tip (ör. `ISubscriptionLimits`); yoksa inline. */
  typeName?: string;
}

export interface MapFieldConfig extends FieldCommon {
  kind: 'map';
  valueKind: 'string' | 'number' | 'decimal' | 'boolean';
}

export interface JsonFieldConfig extends FieldCommon {
  kind: 'json';
}

export interface FileFieldConfig extends FieldCommon {
  kind: 'file';
  /** `<input accept>`: ör. `image/*,video/*`. */
  accept?: string;
}

export type FieldConfig =
  | ScalarFieldConfig
  | EnumFieldConfig
  | RelationFieldConfig
  | ObjectFieldConfig
  | MapFieldConfig
  | JsonFieldConfig
  | FileFieldConfig;

// ---------------------------------------------------------------------------
// Tip seviyesinde satır çıkarımı: `defineResourceSchema` ile tanımlanan alanlardan
// `row.status` gibi erişimler tipli olur.
// ---------------------------------------------------------------------------

type ScalarValue<K> = K extends 'number' ? number : K extends 'boolean' ? boolean : string;

type BaseValue<F> = F extends { kind: 'enum'; numbers: readonly (infer N)[] }
  ? N
  : F extends { kind: 'enum'; options: readonly (infer O)[] }
  ? O
  : F extends { kind: 'relation'; populate: readonly (infer P extends string)[] }
    ? Id | PopulatedRef<P>
    : F extends { kind: 'relation' }
      ? Id | PopulatedRef
      : F extends { kind: 'object'; fields: infer Sub extends readonly FieldConfig[] }
        ? InferFields<Sub>
        : F extends { kind: 'map'; valueKind: infer V }
          ? Record<string, ScalarValue<V>>
          : F extends { kind: 'json' }
            ? unknown
            : F extends { kind: 'file' }
            ? File
            : F extends { kind: infer K }
            ? ScalarValue<K>
            : never;

type WithArray<F, V> = F extends { isArray: true } ? V[] : V;
type WithNull<F, V> = F extends { nullable: true } ? V | null : V;

export type FieldValue<F> = WithNull<F, WithArray<F, BaseValue<F>>>;

type RequiredFields<Fs extends readonly FieldConfig[]> = Extract<Fs[number], { required: true }>;
type OptionalFields<Fs extends readonly FieldConfig[]> = Exclude<Fs[number], { required: true }>;

export type InferFields<Fs extends readonly FieldConfig[]> = {
  [F in RequiredFields<Fs> as F['name']]: FieldValue<F>;
} & {
  [F in OptionalFields<Fs> as F['name']]?: FieldValue<F>;
};

type FilterValueOf<F> = F extends { filter: 'regex' }
  ? string
  : F extends { filter: 'range' }
    ? RangeFilterValue | number
    : F extends { filter: 'date-range' }
      ? DateRangeFilterValue | string
      : F extends { filter: 'boolean' }
        ? boolean
        : F extends { filter: 'relation' }
          ? Id
          : F extends { filter: 'enum' }
            ? BaseValue<F> | BaseValue<F>[]
            : BaseValue<F>;

/** `ListBody.filters` için tipli şekil: yalnızca `filter` tanımlı alanlar + `id`. */
export type InferFilters<Fs extends readonly FieldConfig[]> = { id?: Id } & {
  [F in Extract<Fs[number], { filter: FilterType }> as F['name']]?: FilterValueOf<F>;
};
