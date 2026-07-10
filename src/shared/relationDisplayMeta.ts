export type RelationPropertyObjectSubField = {
  name: string;
  type?: string;
  required?: boolean;
  trim?: boolean;
};

export type RelationEnrichableField = {
  includeRelation?: boolean;
  relationEntityName?: string;
  relationProperty?: string;
  relationPropertyObjectFields?: RelationPropertyObjectSubField[];
};

export type ManifestModelLike = {
  entityName: string;
  fields: Array<{
    name: string;
    type: string;
    objectFields?: RelationPropertyObjectSubField[];
  }>;
};

function findManifestModel(
  models: ManifestModelLike[],
  relationEntityName: string
): ManifestModelLike | undefined {
  const target = relationEntityName.trim().toLowerCase();
  if (!target) return undefined;
  return models.find(m => {
    const name = m.entityName.trim().toLowerCase();
    if (name === target) return true;
    if (!name.endsWith('s') && `${name}s` === target) return true;
    if (name.endsWith('s') && name.slice(0, -1) === target) return true;
    return false;
  });
}

/** Resolve object sub-fields for a relation display property from manifest models at codegen time. */
export function enrichRelationPropertyObjectFields<T extends RelationEnrichableField>(
  fields: T[],
  manifestModels: ManifestModelLike[] | undefined | null
): T[] {
  if (!Array.isArray(fields) || !manifestModels?.length) return fields;

  return fields.map(field => {
    if (field.includeRelation !== true || !field.relationEntityName || !field.relationProperty) {
      return field;
    }
    if (field.relationPropertyObjectFields?.length) {
      return field;
    }

    const relModel = findManifestModel(manifestModels, field.relationEntityName);
    if (!relModel) return field;

    const propField = relModel.fields.find(f => f.name === field.relationProperty);
    if (!propField || String(propField.type).toLowerCase() !== 'object') return field;
    if (!propField.objectFields?.length) return field;

    return {
      ...field,
      relationPropertyObjectFields: propField.objectFields.map(sub => ({
        name: sub.name,
        type: sub.type,
        required: sub.required,
        trim: sub.trim,
      })),
    };
  });
}
