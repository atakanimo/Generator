/**
 * Extra-field report (plan backend-python-fastapi PY7): generated document and sub-object classes are
 * `extra="forbid"`, and the admin row requires every required field and both timestamps. A legacy collection whose
 * documents carry other keys, miss a required key or hold another type gives 500 on read. Before an import the
 * collection is sampled (read-only: `estimated_document_count`, `find` / `$sample`) and each problem is listed with the
 * number of documents it affects, so the user can add the field to the model or clean the data with a migration.
 *
 * The connection comes from the host's own settings (`.env`, then `config.env`, then the process environment). Only
 * local servers are contacted unless `allowRemote` is set; the URI never leaves the main process (only host / db).
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { NormalizedField, NormalizedModel, NormalizedObjectSubField } from '../../../shared/normalizedModel.js';
import type { CollectionReport, CollectionReportIssue } from '../../../shared/ipcTypes.js';
import { MONGO_REPORT_SCRIPT } from './pythonScripts.js';
import { runPythonScript } from './pythonRunner.js';

/** Shapes shared with the renderer (`ipcTypes.ts`); semantics: `breaksAdminRead` = the admin-crud read
 * (`CrudService.to_row`) fails with 500 (top-level extra keys do not: the row model is `extra="ignore"`, but code that
 * validates with the document model does); `soft` = readable but date filters / sort / reference checks miss it. */
export type { CollectionReport, CollectionReportIssue as ReportIssue };

interface MongoConfig {
  uri: string;
  db: string;
  source: string;
  server: string;
}

function readDotenv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(raw);
    if (!m || raw.trim().startsWith('#')) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    out[m[1]] = value;
  }
  return out;
}

const URI_KEYS = ['MONGO_URI', 'MONGODB_URI', 'MONGO_URL', 'MONGODB_URL'];
const DB_KEYS = ['MONGO_DB_NAME', 'MONGO_DB', 'MONGODB_DB', 'MONGODB_DATABASE', 'DB_NAME'];

/** `mongodb://user:pass@host:port,host2/db?x` → `{ hosts, db }` without credentials. */
function parseMongoUri(uri: string): { hosts: string[]; db?: string } | null {
  const m = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)(?:\/([^?]*))?/.exec(uri);
  if (!m) return null;
  return { hosts: m[1].split(','), db: m[2] ? decodeURIComponent(m[2]) : undefined };
}

export function resolveMongoConfig(root: string): MongoConfig | null {
  const sources: Array<[string, Record<string, string>]> = [
    ['.env', readDotenv(join(root, '.env'))],
    ['config.env', readDotenv(join(root, 'config.env'))],
    ['env', process.env as Record<string, string>]
  ];
  for (const [source, vars] of sources) {
    const uri = URI_KEYS.map((k) => vars[k]).find((v) => v && /^mongodb(\+srv)?:\/\//.test(v));
    if (!uri) continue;
    const parsed = parseMongoUri(uri);
    const db = DB_KEYS.map((k) => vars[k]).find(Boolean) ?? parsed?.db;
    if (!db || !parsed) continue;
    return { uri, db, source, server: parsed.hosts.join(',') };
  }
  return null;
}

function isLocal(server: string, uri: string): boolean {
  if (uri.startsWith('mongodb+srv://')) return false;
  return server
    .split(',')
    .map((h) => h.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase())
    .every((h) => h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost') || h === 'host.docker.internal');
}

interface ShapeField {
  kind: string;
  isArray?: boolean;
  required?: boolean;
  int?: boolean;
  values?: Array<string | number>;
  object?: Shape;
}

interface Shape {
  fields: Record<string, ShapeField>;
  allowed?: string[];
}

function subShape(sub: NormalizedObjectSubField): ShapeField {
  return {
    kind: sub.kind === 'enum' ? 'string' : sub.kind,
    required: sub.required && sub.nullable !== true,
    ...(sub.numberFormat === 'int' ? { int: true } : {})
  };
}

function fieldShape(field: NormalizedField): ShapeField {
  const out: ShapeField = {
    kind: field.kind,
    isArray: field.isArray,
    // The admin row requires `required && !nullable` scalars / objects; arrays default to `[]`.
    required: field.required === true && field.nullable !== true && !field.isArray && field.access?.hidden !== true
  };
  if (field.kind === 'number' && field.numberFormat === 'int') out.int = true;
  if (field.kind === 'enum') out.values = field.enum?.numbers?.length ? field.enum.numbers : (field.enum?.values ?? []);
  if (field.kind === 'object' && field.object?.fields?.length) {
    out.object = { fields: Object.fromEntries(field.object.fields.map((s) => [s.name, subShape(s)])) };
  }
  return out;
}

/** What the generated document model and admin row accept (`_id`, timestamps, model fields). */
export function reportShape(model: NormalizedModel): Shape {
  const fields: Record<string, ShapeField> = {};
  for (const f of model.fields) {
    if (f.name === 'id' || f.name === '_id' || f.name === 'createdAt' || f.name === 'updatedAt') continue;
    fields[f.name] = fieldShape(f);
  }
  // `CrudService` writes both timestamps; the admin row requires them (`UtcDateTime`).
  fields.createdAt = { kind: 'date', required: true };
  fields.updatedAt = { kind: 'date', required: true };
  return { fields, allowed: ['_id'] };
}

const mask = (text: string) => text.replace(/(mongodb(?:\+srv)?:\/\/)[^@\s/]*@/g, '$1***@');

/**
 * Samples the module's collection (`collection` = snake_case entity, K21) and compares it with `model`.
 * Never throws: a missing configuration, driver or server comes back as `ok: false` with `reason`.
 */
export function collectionReport(
  root: string,
  model: NormalizedModel,
  options: { collection: string; sample?: number; allowRemote?: boolean; timeoutMs?: number; config?: { uri: string; db: string } }
): CollectionReport {
  const empty = { collection: options.collection, extra: [], missing: [], mismatched: [], soft: [] };
  const config: MongoConfig | null = options.config
    ? { ...options.config, source: 'parametre', server: parseMongoUri(options.config.uri)?.hosts.join(',') ?? '?' }
    : resolveMongoConfig(root);
  if (!config) {
    return { ok: false, reason: 'no-config', error: "Mongo ayarı bulunamadı (.env / config.env'de MONGO_URI + MONGO_DB_NAME).", ...empty };
  }
  const where = { source: config.source, server: config.server, database: config.db };
  if (!options.allowRemote && !isLocal(config.server, config.uri)) {
    return { ok: false, reason: 'remote-skipped', error: `${config.server} yerel değil; uzak sunucuya bağlanmak için ayrıca izin gerekir.`, ...where, ...empty };
  }
  const spec = { db: config.db, collection: options.collection, sample: options.sample ?? 1000, timeoutMs: options.timeoutMs ?? 3000, shape: reportShape(model) };
  const run = runPythonScript(MONGO_REPORT_SCRIPT, [], { root, input: JSON.stringify(spec), env: { GEN_MONGO_URI: config.uri }, timeoutMs: 60_000 });
  if (!run.ok) {
    const lastLine = run.stderr.trim().split('\n').slice(-1)[0] ?? '';
    return { ok: false, reason: 'error', error: mask(lastLine || 'rapor betiği çalışmadı'), ...where, ...empty };
  }
  const out = JSON.parse(run.stdout) as Partial<CollectionReport> & { reason?: string };
  if (out.ok !== true) {
    return { ok: false, reason: (out.reason as CollectionReport['reason']) ?? 'error', error: mask(out.error ?? ''), ...where, ...empty };
  }
  const mark = (rows: CollectionReportIssue[] | undefined, breaks: (i: CollectionReportIssue) => boolean) => (rows ?? []).map((i) => ({ ...i, breaksAdminRead: breaks(i) }));
  return {
    ...empty,
    ...out,
    ok: true,
    ...where,
    extra: mark(out.extra, (i) => /[.[]/.test(i.path)),
    missing: mark(out.missing, () => true),
    mismatched: mark(out.mismatched, () => true),
    soft: mark(out.soft, () => false)
  } as CollectionReport;
}

/** One-line Turkish summary of a report (notes, logs). */
export function summarizeReport(r: CollectionReport): string {
  if (!r.ok) return `Fazladan alan raporu yok: ${r.error ?? r.reason}`;
  if (!r.exists) return `${r.database}.${r.collection} collection'ı yok (boş başlar).`;
  const topExtra = r.extra.filter((i) => !i.breaksAdminRead);
  const parts = [
    r.extra.length ? `modelde olmayan ${r.extra.length} alan (${r.extra.map((i) => `${i.path} ×${i.docs}`).join(', ')})` : '',
    r.missing.length ? `eksik zorunlu ${r.missing.length} alan (${r.missing.map((i) => `${i.path} ×${i.docs}`).join(', ')})` : '',
    r.mismatched.length ? `tipi uymayan ${r.mismatched.length} alan (${r.mismatched.map((i) => `${i.path} ×${i.docs}`).join(', ')})` : ''
  ].filter(Boolean);
  const soft = r.soft.length ? ` Okunur ama filtre / sıralama / ilişki dışı kalır: ${r.soft.map((i) => `${i.path} (${i.types.join('/')}) ×${i.docs}`).join(', ')}.` : '';
  const scope = `${r.database}.${r.collection}: ${r.scanned}/${r.total} doküman${r.sampled ? ' (örneklem)' : ''}`;
  return parts.length
    ? `${scope}; ${parts.join('; ')}. ${
        r.extra.length + r.missing.length + r.mismatched.length > topExtra.length
          ? 'Admin okuması 500 verir'
          : 'Admin satırı üst seviyedeki fazladan alanı yok sayar, doküman modeliyle (extra="forbid") doğrulayan kod 500 verir'
      }: alanı modele ekleyin ya da migration ile temizleyin.${soft}`
    : `${scope}; okumayı bozan sorun yok.${soft}`;
}
