/**
 * Mongoose default audit fields (createdAt / updatedAt) merged into generator template field lists.
 * Paths come from Schema `timestamps` option — never duplicated in explicit schema paths.
 */

export function mergeMongoAuditBackendTemplateFields(
  sourceType: string | null | undefined,
  fields: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  if (sourceType !== 'nodejs-mongoose') return fields;

  const names = new Set(fields.map(f => String(f.name ?? '').trim()));
  const out = [...fields];

  const push = (name: string, label: string) => {
    if (names.has(name)) return;
    names.add(name);
    out.push({
      name,
      required: false,
      isArray: false,
      isSearchable: true,
      filterType: 'date-range',
      defaultValue: '',
      isReadonly: true,
      hiddenFromCreate: true,
      hiddenFromUpdate: true,
      showInTable: true,
      label,
      uiComponent: undefined,
      includeRelation: false,
      relationEntityName: undefined,
      relationProperty: undefined,
      relationType: undefined,
      fieldDbType: 'date',
      type: 'date'
    });
  };

  push('createdAt', 'Created At');
  push('updatedAt', 'Updated At');
  return out;
}

/** Schema Designer / Frontend generator shape (`schema.fields`). */
export function mergeMongoAuditFrontendSchemaFields(
  sourceType: string | null | undefined,
  fields: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  if (sourceType !== 'nodejs-mongoose') return fields;

  const names = new Set(fields.map(f => String(f.name ?? '').trim()));
  const out = [...fields];

  const push = (name: string, label: string) => {
    if (names.has(name)) return;
    names.add(name);
    out.push({
      name,
      type: 'date',
      required: false,
      isArray: false,
      label,
      uiComponent: 'DatePicker',
      showInTable: true,
      isSearchable: true,
      filterType: 'date-range',
      defaultValue: '',
      isReadonly: true,
      hiddenFromCreate: true,
      hiddenFromUpdate: true,
      includeRelation: false
    });
  };

  push('createdAt', 'Created At');
  push('updatedAt', 'Updated At');
  return out;
}
