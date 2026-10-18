export { parseNormalizedModel } from '../../src/main/ipc/schemaParser.ts';
export { loadModelDraft } from '../../src/main/ipc/modelCreator.ts';
export { classifyField, emitZodFieldExpr } from '../../src/shared/fieldKind.ts';
export { editorTypeOf, editorSubTypeOf, subReferenceOf } from '../../src/shared/modelDraft.ts';

import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';
import { registerHandlebarsHelpers } from '../../src/main/utils/templateHelpers.ts';
import { buildMongooseModelContext } from '../../src/main/utils/mongooseModelContext.ts';
import type { ModelDraft } from '../../src/shared/modelDraft.ts';
import type { NormalizedField } from '../../src/shared/normalizedModel.ts';
import { filterTokenOf, typeTokenOf } from '../../src/shared/fieldTypeToken.ts';

/** Template-token view of a v2 field (the shape `classifyField` / `emitZodFieldExpr` read). */
export function toTemplateView(f: NormalizedField) {
  return {
    name: f.name,
    type: typeTokenOf(f),
    required: f.required,
    isArray: f.isArray,
    includeRelation: f.reference?.include,
    relationEntityName: f.reference?.target,
    filterType: filterTokenOf(f.filter),
    enumValues: f.enum?.values,
    objectFields: f.object?.fields?.map(sub => ({
      name: sub.name,
      type: typeTokenOf(sub),
      required: sub.required,
      includeRelation: sub.reference?.include,
      relationEntityName: sub.reference?.target
    })),
    nestedTypeName: f.object?.typeName,
    nestedSchemaName: f.object?.schemaName
  };
}

/** Render model.hbs from a model editor draft through the shared v2 context (same builder as modelCreator). */
export function renderModelHbs(draft: ModelDraft): string {
  registerHandlebarsHelpers();
  const src = readFileSync(join(process.cwd(), 'src/main/templates/backend/model.hbs'), 'utf8');
  const tpl = Handlebars.compile(src, { noEscape: true });
  const name = draft.model.entityName;
  return tpl({
    currentDate: 'smoke',
    ...buildMongooseModelContext(draft.model, {
      pascalName: name,
      sourceType: 'nodejs-mongoose',
      timestampsFallback: { createdAt: true, updatedAt: true },
      modelName: name
    })
  });
}
