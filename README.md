# Generator

Generator is a desktop app (Electron, React, TypeScript) that turns a project's model files into a working product. A model is parsed once into **NormalizedModel v2**. From that same model the app writes backend modules, admin panel config, and the mobile / web client's data layer. All three backend stacks serve the same HTTP contract. Admin screens are not written page by page: the `@atakanimo/ata-admin-base` package renders the config as tables, forms, and filters.

```
Model file → Parser (per stack) → NormalizedModel v2 → .generator/manifest.json
  ├→ Backend emitter        → HTTP API (contract: docs/api-contract.md)
  ├→ Admin config emitter   → ResourceSchema (@atakanimo/ata-admin-base)
  └→ Client data layer      → types, service, RTK thunk, slice (no screens)
```

The model file is the source of types. Labels, filters, relations, access, and API settings live in `.generator/manifest.json` (v3) at the project root. `mergeModel` combines the two; emitters see that merged model.

## What it writes

| Output | Where | Owner |
| --- | --- | --- |
| Backend module | The stack's own layout (routes, service, schema, validation) | **G** files are rewritten on every generate |
| Business rules | Hooks, custom blocks, `*.Custom.cs` / `*Hooks.cs` | **K** files are created once, then belong to the user |
| Core | HTTP envelope, pagination, error codes, auth | Asset: created when missing, never overwritten |
| Admin config | `apps/admin/src/modules/<module>/*.generated.config.ts` | Generator |
| Client data layer | `*.service.generated.ts`, thunk, slice | Generator; no screens or components |

A file without the Generator header belongs to the user and is left untouched. Code written outside a custom block in a generated file is removed on the next generate. Business rules go in a hook or a custom block.

Hosts in use today: SharedFrame, StockExchange, Varlik360, CeyizDefterim. Rules: `src/generator-assets/cursor-rules/` (synced with `scripts/rules-sync.mjs`).

## Stacks

| Stack | Database | Id |
| --- | --- | --- |
| Express + Mongoose | MongoDB | ObjectId |
| Python + FastAPI | MongoDB | ObjectId |
| .NET 10 + EF Core | PostgreSQL, SQL Server, or MongoDB | uuid v7; ObjectId is also available on MongoDB |

A new project is created from the "New … project" action in Electron: solution skeleton, core files, and empty registries. Database and id type are chosen at bootstrap and stay fixed. An admin panel can be installed into an empty folder on its own.

## UI

| Screen | What it does |
| --- | --- |
| Project select | Opens a backend folder, scans the stack, creates a new project or admin panel |
| Schema Designer | Field table (label, table, filter, readonly, relation, UI component) and generate |
| Model editor | Creates or edits the model file |
| API settings | Per-model normal operations, auth, and admin CRUD |

Before generate, the model file hash is checked. If the file changed on disk after it was opened, nothing is written.

The same work runs from the command line, from this repo's root:

```bash
node scripts/host.mjs admin-config <host> [Entity] [--dry-run]
node scripts/host.mjs generate <host> [Entity] [--dry-run]
```

`admin-config` writes admin config. `generate` writes the backend. With no entity, every model in the manifest is included. `--dry-run` prints the paths and writes nothing. Python setup and preview live in `scripts/python-host.mjs`.

## Run

```bash
npm install
npm run dev
```

Vite starts at `http://localhost:5190`, then Electron launches. Renderer only (no IPC, limited): `npm run web:dev`. Package the app: `npm run electron:build`.

To try the admin package against a fake backend, run `npm run playground` inside `packages/admin-base` (`http://localhost:5191`).

## Repository

```
src/main/             Electron main: parsers, emitters, IPC, Handlebars templates
src/preload/          IPC bridge
src/renderer/         React UI (MUI, Redux Toolkit)
src/shared/           NormalizedModel, manifest merge, stack definitions, IPC types
src/generator-assets/ Core files and skeletons copied into a host once
packages/admin-base/  React + MUI package that runs the config
docs/                 Contract, stacks, verification
scripts/              host.mjs, python-host.mjs, scripts/verify/
```

Templates contain no business logic. Decisions are made in helpers and emitters; a template only walks lines that were already prepared.

## Documentation

Index: [docs/README.md](docs/README.md). The docs are in Turkish. Start here:

| Document | Topic |
| --- | --- |
| [docs/normalized-model.md](docs/normalized-model.md) | The single model type, the manifest, field kinds |
| [docs/api-contract.md](docs/api-contract.md) | The HTTP contract shared by every stack |
| [docs/generator-ui.md](docs/generator-ui.md) | Screens and IPC |
| [docs/admin-base-package.md](docs/admin-base-package.md) | Admin package behavior and host setup |
| [docs/verification.md](docs/verification.md) | Verification scripts |
| [docs/coding-rules.md](docs/coding-rules.md) | Coding rules |
