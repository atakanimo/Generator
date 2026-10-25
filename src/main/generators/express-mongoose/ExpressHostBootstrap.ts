/**
 * PY9: lays down an Express + Mongoose + TypeScript host (docs/backend/express-mongoose.md "Yeni proje").
 *
 * - Skeleton (`_skeleton/`, K: created once, never overwritten): `package.json`, `tsconfig*.json`, `.env.example`,
 *   `src/index.ts` (server), `src/app.ts` (`createApp`: middlewares + router mounts; the generator mounts generated
 *   routers here), `src/config` (env, i18n), `src/locales` (tr / en, shared `crud.*` block), `src/db`, `src/helpers`
 *   (`t`), `src/utils/requestContext.ts`, `src/core/middleware` (auth, admin, validate, errors…), `src/core/index.ts`,
 *   health module and a test. Tokens: `__app__` = npm package name (kebab-case), `__App__` = the app name as given.
 * - Core assets (`src/core/{errors,logging,…}`): the generator's create-only bootstrap list (`ensureExpressCoreAssets`).
 */
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { getGeneratorAssetsDir } from '../../utils/templateHelpers.js';
import { kebabCase } from '../../utils/namingUtils.js';
import { WrittenFile, listFiles, writeOnce } from '../dotnet-efcore/dotnetFiles.js';
import { ensureExpressCoreAssets } from './expressCoreAssets.js';

export const EXPRESS_APP_TOKEN = '__App__';
export const EXPRESS_PKG_TOKEN = '__app__';

/** `OrdersApi` → `orders-api` (npm package name); `null` when the name cannot be one. */
export function toExpressPackageName(app: string): string | null {
  const name = kebabCase(app.trim()).replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return /^[a-z][a-z0-9-]*$/.test(name) ? name : null;
}

function applyTokens(text: string, app: string, pkg: string): string {
  return text.split(EXPRESS_APP_TOKEN).join(app).split(EXPRESS_PKG_TOKEN).join(pkg);
}

export function expressSkeletonDir(): string {
  return join(getGeneratorAssetsDir('express-mongoose'), '_skeleton');
}

/** Skeleton (create-only) + core assets (create-only). */
export function bootstrapExpressHost(root: string, app: string, pkg: string): { files: WrittenFile[] } {
  const skeleton = expressSkeletonDir();
  const files = listFiles(skeleton).map((file) =>
    writeOnce(join(root, applyTokens(relative(skeleton, file), app, pkg)), applyTokens(readFileSync(file, 'utf8'), app, pkg))
  );
  const assets = ensureExpressCoreAssets(root).map<WrittenFile>((f) => ({
    path: f.path,
    action: f.action === 'created' ? 'created' : 'skipped-exists'
  }));
  return { files: [...files, ...assets] };
}
