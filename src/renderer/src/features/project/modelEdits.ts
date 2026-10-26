import {
  canonicalField,
  canonicalModel,
  type NormalizedAccess,
  type NormalizedField,
  type NormalizedFilter,
  type NormalizedModel,
  type NormalizedReference,
  type AdminOperation,
  type NormalizedUi,
  type NormalOperation
} from '@shared/normalizedModel';
import { typeTokenOf } from '@shared/fieldTypeToken';

/** Schema designer edit of one field: the given keys of each settings group are replaced. */
export interface FieldPatch {
  reference?: Partial<NormalizedReference>;
  filter?: Partial<NormalizedFilter>;
  access?: Partial<NormalizedAccess>;
  ui?: Partial<NormalizedUi>;
}

export function patchField(field: NormalizedField, patch: FieldPatch): NormalizedField {
  return canonicalField({
    ...field,
    reference: patch.reference ? { ...field.reference, ...patch.reference } : field.reference,
    filter: patch.filter ? { ...field.filter, ...patch.filter } : field.filter,
    access: patch.access ? { ...field.access, ...patch.access } : field.access,
    ui: patch.ui ? { ...field.ui, ...patch.ui } : field.ui
  });
}

/** A model's API settings as the schema designer edits them: `model.api` plus the ownership kind. */
export interface ModelApiSettings {
  normalOperations?: NormalOperation[];
  ownership?: 'field' | 'self';
  requiresAuth?: boolean;
  admin?: boolean;
  /** Admin API operations; absent → all CRUD (`list` always on); `export` only when listed. */
  adminOperations?: AdminOperation[];
}

export function modelApiSettings(model: NormalizedModel): ModelApiSettings {
  return { ...model.api, ownership: model.ownership?.kind };
}

/** Apply an API settings patch; an `ownership` key (even `undefined`) replaces `model.ownership`. */
export function patchModelApi(model: NormalizedModel, patch: ModelApiSettings): NormalizedModel {
  const { ownership, ...api } = patch;
  return canonicalModel({
    ...model,
    api: { ...model.api, ...api },
    ownership: 'ownership' in patch ? (ownership ? { kind: ownership } : undefined) : model.ownership
  });
}

/** Parser type token shown in the designer's "DB type" column (`schema` = ObjectId reference). */
export const fieldTypeLabel = (field: Pick<NormalizedField, 'kind' | 'native'>): string => typeTokenOf(field);

export const isReferenceField = (field: Pick<NormalizedField, 'kind' | 'native'>): boolean =>
  field.kind === 'reference' || typeTokenOf(field) === 'schema';
