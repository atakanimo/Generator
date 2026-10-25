/**
 * New-project stacks (plan backend-python-fastapi PY9): one definition per stack for the "Yeni … projesi" buttons,
 * their info popover (folder tree with G / K / asset, technologies, run commands, doc) and the bootstrap dialog.
 *
 * Kept in line with `docs/backend/<stack>.md` (that doc is the long form). `scripts/verify/express-bootstrap.mjs`
 * bootstraps each stack and checks that every tree entry marked `bootstrap` exists in the new host.
 */

import { DATABASE_LABELS, STACK_DATABASES, type BackendStack } from './backendDatabase.js';

export type NewProjectStack = BackendStack;

/** G: Generator rewrites it on every generate · K: created once, then the user's · asset: Generator core file, created when missing. */
export type StackFileOwner = 'G' | 'K' | 'asset';

export interface StackTreeEntry {
  /** Indentation level (0 = host root). A name ending in `/` is a folder; deeper entries below it are its children. */
  depth: number;
  name: string;
  owner?: StackFileOwner;
  note?: string;
  /** Present right after the bootstrap (skeleton, assets, empty registries); otherwise written by generate. */
  bootstrap?: boolean;
}

export interface StackTechnology {
  label: string;
  value: string;
}

export interface StackRunCommand {
  command: string;
  comment?: string;
}

export interface BackendStackInfo {
  stack: NewProjectStack;
  /** Button and dialog title. */
  label: string;
  /** One line under the dialog title. */
  summary: string;
  /** Databases this stack generates for (labels of `STACK_DATABASES`). */
  databases: string[];
  technologies: StackTechnology[];
  tree: StackTreeEntry[];
  /** Placeholders in tree and commands: `<App>` / `<pkg>` (from the app name), `<m>` module, `<Folder>` / `<E>` entity. */
  placeholders: string;
  runCommands: StackRunCommand[];
  /** Generator repo relative path of the stack doc. */
  doc: string;
  appName: { placeholder: string; helper: string };
}

const DATABASE_LABEL = 'Veritabanı';

function withDatabases(info: Omit<BackendStackInfo, 'databases'>): BackendStackInfo {
  const databases = STACK_DATABASES[info.stack].map((e) => DATABASE_LABELS[e.database]);
  const technologies = info.technologies.map((t) => (t.label === DATABASE_LABEL ? { ...t, value: databases.join(' / ') } : t));
  return { ...info, databases, technologies };
}

const DOTNET: BackendStackInfo = withDatabases({
  stack: 'dotnet-ef',
  label: 'Yeni .NET projesi',
  summary: '.NET 10 + EF Core, Clean Architecture: çözüm, 4 proje, test projesi ve core dosyaları. Veritabanı ve id tipi burada seçilir.',
  technologies: [
    { label: 'Dil', value: 'C# / .NET 10 (SDK 10.0.402, global.json)' },
    { label: 'Framework', value: 'ASP.NET Core Minimal API' },
    { label: DATABASE_LABEL, value: '' },
    { label: 'ORM / sürücü', value: 'EF Core 10 + seçilen sağlayıcı (Npgsql / SqlServer: snake_case tablolar; MongoDB.EntityFrameworkCore)' },
    { label: 'Doğrulama', value: 'FluentValidation 12' },
    { label: 'Test', value: 'xUnit 2.9 (tests/<App>.Api.Tests)' },
    { label: 'Paket yöneticisi', value: 'NuGet, merkezi sürümler (Directory.Packages.props); dotnet-ef yerel araç' },
    { label: 'Diğer', value: 'JWT Bearer + Admin policy (role admin), kimlik EntityId (uuid v7; MongoDB\'de ObjectId de)' }
  ],
  tree: [
    { depth: 0, name: '<App>.slnx', owner: 'K', bootstrap: true },
    { depth: 0, name: 'Directory.Build.props', owner: 'K', bootstrap: true },
    { depth: 0, name: 'Directory.Packages.props', owner: 'K', note: 'paket sürümleri', bootstrap: true },
    { depth: 0, name: 'global.json', owner: 'K', bootstrap: true },
    { depth: 0, name: '.config/dotnet-tools.json', owner: 'K', note: 'dotnet-ef (ilişkisel)', bootstrap: true },
    { depth: 0, name: '.env.example', owner: 'K', bootstrap: true },
    { depth: 0, name: '.generator/manifest.json', owner: 'G', note: 'model ayarları (Generator yazar)', bootstrap: true },
    { depth: 0, name: 'src/' },
    { depth: 1, name: '<App>.Domain/' },
    { depth: 2, name: 'Common/', owner: 'asset', bootstrap: true },
    { depth: 2, name: '<Folder>/<E>.cs', owner: 'G', note: 'entity' },
    { depth: 2, name: '<Folder>/<E>.Custom.cs', owner: 'K' },
    { depth: 1, name: '<App>.Application/' },
    { depth: 2, name: 'Common/', owner: 'asset', bootstrap: true },
    { depth: 2, name: 'DependencyInjection.cs', owner: 'K', bootstrap: true },
    { depth: 2, name: 'DependencyInjection.Generated.cs', owner: 'G', bootstrap: true },
    { depth: 2, name: '<Folder>/<E>Dtos · Validators · Filters · Projections · Service · AdminService .cs', owner: 'G' },
    { depth: 2, name: '<Folder>/<E>Hooks.cs · <E>Service.Custom.cs', owner: 'K', note: 'iş kuralı' },
    { depth: 1, name: '<App>.Infrastructure/' },
    { depth: 2, name: 'Common/', owner: 'asset', bootstrap: true },
    { depth: 2, name: 'Persistence/AppDbContext.cs', owner: 'K', bootstrap: true },
    { depth: 2, name: 'Persistence/AppDbContext.Generated.cs', owner: 'G', bootstrap: true },
    { depth: 2, name: 'Persistence/<Folder>/<E>Configuration.cs', owner: 'G', note: '.Custom.cs K' },
    { depth: 1, name: '<App>.Api/' },
    { depth: 2, name: 'Common/', owner: 'asset', bootstrap: true },
    { depth: 2, name: 'Program.cs', owner: 'K', bootstrap: true },
    { depth: 2, name: 'Endpoints/EndpointRegistry.Generated.cs', owner: 'G', bootstrap: true },
    { depth: 2, name: 'Endpoints/<Folder>/<E>Endpoints.cs · <E>AdminEndpoints.cs', owner: 'G', note: '<E>Endpoints.Custom.cs K' },
    { depth: 0, name: 'tests/<App>.Api.Tests/', owner: 'K', bootstrap: true }
  ],
  placeholders: '<App> uygulama adı, <Folder> modül klasörü (çoğul), <E> entity',
  runCommands: [
    { command: 'cp .env.example .env', comment: 'ConnectionStrings__Default, Jwt__Secret (en az 32 karakter)' },
    { command: 'dotnet tool restore' },
    { command: 'dotnet build && dotnet test' },
    { command: 'dotnet ef migrations add Initial -p src/<App>.Infrastructure -s src/<App>.Api', comment: 'PostgreSQL / SQL Server: model ekleyip generate ettikten sonra (MongoDB: yok, index\'ler açılışta)' },
    { command: 'set -a && . ./.env && set +a && dotnet run --project src/<App>.Api', comment: 'http://localhost:5080/api/health' }
  ],
  doc: 'docs/backend/dotnet-efcore.md',
  appName: { placeholder: 'SharedFrame', helper: 'PascalCase; proje adları <Ad>.Api, <Ad>.Domain… olur' }
});

const EXPRESS: BackendStackInfo = withDatabases({
  stack: 'nodejs-mongoose',
  label: 'Yeni Express projesi',
  summary: 'Express + Mongoose + TypeScript: uygulama iskeleti (sunucu, middleware, i18n, auth) ve core dosyaları.',
  technologies: [
    { label: 'Dil', value: 'TypeScript 5.9 (Node.js 22+)' },
    { label: 'Framework', value: 'Express 4' },
    { label: DATABASE_LABEL, value: '' },
    { label: 'ORM / sürücü', value: 'Mongoose 8' },
    { label: 'Doğrulama', value: 'Zod 3' },
    { label: 'Test', value: 'node:test + tsx (iskelet sağlık testi; modül testi üretilmez)' },
    { label: 'Paket yöneticisi', value: 'npm' },
    { label: 'Diğer', value: 'JWT (jsonwebtoken HS256, role admin), i18next (tr / en), pino' }
  ],
  tree: [
    { depth: 0, name: 'package.json', owner: 'K', bootstrap: true },
    { depth: 0, name: 'tsconfig.json', owner: 'K', note: 'yol takma adları (@core, @modules…)', bootstrap: true },
    { depth: 0, name: '.env.example', owner: 'K', bootstrap: true },
    { depth: 0, name: '.generator/manifest.json', owner: 'G', note: 'model ayarları (Generator yazar)', bootstrap: true },
    { depth: 0, name: 'src/' },
    { depth: 1, name: 'index.ts', owner: 'K', note: 'sunucu', bootstrap: true },
    { depth: 1, name: 'app.ts', owner: 'K', note: 'createApp; Generator router\'ları buraya bağlar', bootstrap: true },
    { depth: 1, name: 'config/', owner: 'K', note: 'env, i18n', bootstrap: true },
    { depth: 1, name: 'locales/', owner: 'K', note: 'tr / en, ortak crud.* bloğu', bootstrap: true },
    { depth: 1, name: 'db/connection.ts', owner: 'K', bootstrap: true },
    { depth: 1, name: 'helpers/', owner: 'K', note: 't()', bootstrap: true },
    { depth: 1, name: 'utils/requestContext.ts', owner: 'K', bootstrap: true },
    { depth: 1, name: 'core/' },
    { depth: 2, name: 'index.ts', owner: 'K', bootstrap: true },
    { depth: 2, name: 'middleware/', owner: 'K', note: 'auth, admin, validate, hata', bootstrap: true },
    { depth: 2, name: 'errors/', owner: 'asset', bootstrap: true },
    { depth: 2, name: 'filters/', owner: 'asset', bootstrap: true },
    { depth: 2, name: 'logging/', owner: 'asset', bootstrap: true },
    { depth: 2, name: 'pagination/', owner: 'asset', bootstrap: true },
    { depth: 2, name: 'response/', owner: 'asset', bootstrap: true },
    { depth: 2, name: 'schema/', owner: 'asset', bootstrap: true },
    { depth: 2, name: 'services/', owner: 'asset', bootstrap: true },
    { depth: 2, name: 'types/', owner: 'asset', bootstrap: true },
    { depth: 1, name: 'modules/' },
    { depth: 2, name: 'health/health.routes.ts', owner: 'K', bootstrap: true },
    { depth: 2, name: '<m>/<m>.model.ts', owner: 'G', note: 'editörden yazılır' },
    { depth: 2, name: '<m>/<m>.crud · filters · types · service(.admin) · schema · routes(.admin) .ts', owner: 'G', note: 'custom bloklar korunur' },
    { depth: 2, name: '<m>/<m>.hooks.ts', owner: 'K', note: 'iş kuralı' },
    { depth: 0, name: 'tests/health.test.ts', owner: 'K', bootstrap: true }
  ],
  placeholders: '<m> modül klasörü (kebab-case)',
  runCommands: [
    { command: 'cp .env.example .env', comment: 'JWT_SECRET (en az 32 karakter), MONGODB_URI' },
    { command: 'npm install' },
    { command: 'npm test', comment: 'iskelet testleri (Mongo gerekmez)' },
    { command: 'npm run dev', comment: 'http://localhost:3000/api/health' },
    { command: 'npm run typecheck', comment: 'model generate edildikten sonra' },
    { command: 'npm run build && npm start' }
  ],
  doc: 'docs/backend/express-mongoose.md',
  appName: { placeholder: 'OrdersApi', helper: 'npm paket adı kebab-case olur (OrdersApi → orders-api)' }
});

const PYTHON: BackendStackInfo = withDatabases({
  stack: 'python-fastapi',
  label: 'Yeni Python projesi',
  summary: 'Python + FastAPI + MongoDB: kurulabilir paket (uv), API ve worker giriş noktaları, testler ve core dosyaları.',
  technologies: [
    { label: 'Dil', value: 'Python 3.12+' },
    { label: 'Framework', value: 'FastAPI' },
    { label: DATABASE_LABEL, value: '' },
    { label: 'ORM / sürücü', value: 'Motor (async; hedef PyMongo Async)' },
    { label: 'Doğrulama', value: 'Pydantic v2 + pydantic-settings' },
    { label: 'Test', value: 'pytest + pytest-asyncio + httpx + mongomock-motor (modül testi üretilir)' },
    { label: 'Paket yöneticisi', value: 'uv (uv.lock, hatchling)' },
    { label: 'Diğer', value: 'ruff, import-linter, PyJWT (role admin), structlog, APScheduler' }
  ],
  tree: [
    { depth: 0, name: 'pyproject.toml', owner: 'K', bootstrap: true },
    { depth: 0, name: '.python-version', owner: 'K', bootstrap: true },
    { depth: 0, name: '.env.example', owner: 'K', bootstrap: true },
    { depth: 0, name: '.generator/manifest.json', owner: 'G', note: 'model kaynağı (Generator yazar)', bootstrap: true },
    { depth: 0, name: 'src/<pkg>/' },
    { depth: 1, name: 'core/' },
    { depth: 2, name: 'config.py', owner: 'K', bootstrap: true },
    { depth: 2, name: 'db.py', owner: 'K', note: 'sürücü yalnız burada', bootstrap: true },
    { depth: 2, name: 'crud/', owner: 'asset', bootstrap: true },
    { depth: 2, name: 'http/', owner: 'asset', bootstrap: true },
    { depth: 2, name: 'errors/', owner: 'asset', bootstrap: true },
    { depth: 1, name: 'modules/<m>/' },
    { depth: 2, name: 'model · schemas · repository · service · admin_router _generated.py', owner: 'G' },
    { depth: 2, name: 'model.py · repository.py · hooks.py · service.py', owner: 'K', note: 'iş kuralı' },
    { depth: 1, name: 'api/' },
    { depth: 2, name: 'main.py', owner: 'K', bootstrap: true },
    { depth: 2, name: 'deps.py', owner: 'K', note: 'JWT, AdminDep', bootstrap: true },
    { depth: 2, name: 'routers_generated.py', owner: 'G', bootstrap: true },
    { depth: 2, name: 'indexes_generated.py', owner: 'G', bootstrap: true },
    { depth: 1, name: 'worker/main.py', owner: 'K', bootstrap: true },
    { depth: 0, name: 'tests/' },
    { depth: 1, name: 'conftest.py', owner: 'K', bootstrap: true },
    { depth: 1, name: 'modules/<m>/test_admin_crud.py', owner: 'K', note: 'ilk generate' }
  ],
  placeholders: '<pkg> paket adı (snake_case), <m> modül klasörü (collection)',
  runCommands: [
    { command: 'cp .env.example .env', comment: 'JWT_SECRET (en az 32 karakter), MONGO_URI / MONGO_DB_NAME' },
    { command: 'uv sync' },
    { command: 'uv run pytest -q' },
    { command: 'uv run uvicorn <pkg>.api.main:app --reload', comment: 'http://localhost:8000/api/v1/health' },
    { command: 'uv run python -m <pkg>.worker', comment: 'job\'lar' },
    { command: 'uv run ruff check src tests && uv run lint-imports' }
  ],
  doc: 'docs/backend/python-fastapi.md',
  appName: { placeholder: 'OrdersApi', helper: 'paket adı snake_case olur (OrdersApi → orders_api)' }
});

/** Button order on the Project Location card. */
export const NEW_PROJECT_STACKS: BackendStackInfo[] = [DOTNET, EXPRESS, PYTHON];

export function backendStackInfo(stack: NewProjectStack): BackendStackInfo {
  const info = NEW_PROJECT_STACKS.find((s) => s.stack === stack);
  if (!info) throw new Error(`Unknown stack: ${stack}`);
  return info;
}

/**
 * Host-relative paths of the tree entries (parent folders joined), with `<App>` / `<pkg>` replaced; entries holding
 * other placeholders or several names (`·`) are left out when `bootstrapOnly`.
 */
export function stackTreePaths(info: BackendStackInfo, names: { app: string; pkg: string }, bootstrapOnly = true): string[] {
  const parents: string[] = [];
  const out: string[] = [];
  for (const entry of info.tree) {
    parents.length = entry.depth;
    const path = [...parents, entry.name].join('').split('<App>').join(names.app).split('<pkg>').join(names.pkg);
    parents.push(entry.name.endsWith('/') ? entry.name : `${entry.name}/`);
    if (bootstrapOnly && !entry.bootstrap) continue;
    out.push(path.replace(/\/$/, ''));
  }
  return out;
}
