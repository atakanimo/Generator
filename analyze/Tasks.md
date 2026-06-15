Tasks

Task 1

[x] Freeze Contracts and Baseline
- Define baseline behavior from current flow (`SchemaDesignPage -> thunk -> preload -> IPC -> BackendGenerator`).
- Snapshot current generated output set and update behavior (overwrite vs merge).
- Document what is intentionally unchanged during Phase-1.

Task 2

[x] Backend Result Type Alignment
- Align backend generation result types across:
  - main (`src/main/ipc/backendGenerator.ts`)
  - preload (`src/preload/index.ts`)
  - renderer (`src/renderer/src/types/IPCInterfaces.ts`, thunk usage)
- Ensure admin artifacts are represented consistently.

Task 3

[x] Generation Manifest and Ordering Core
- Introduce a declarative generation manifest/queue for backend artifacts.
- Encode dependency order:
  1. model
  2. crud
  3. filters
  4. types
  5. service
  6. admin.service
  7. schema
  8. routes
  9. routes.admin
- Keep execution sequential and explicit.

Task 4

[x] Template/Output Mapping Layer
- Centralize template path + output path mapping per artifact.
- Prepare stack-aware layout (`backend/express-mongoose/...`) while keeping backward compatibility.
- Validate missing template definitions early with clear errors.

Task 5

[x] NormalizedModel Expansion
- Expand parser -> `NormalizedModel` shape for ownership/filter/relation metadata.
- Guarantee templates consume only normalized context (no raw model pass-through).

Task 6

[x] Safe Update Infrastructure
- Add reusable update pipeline:
  1. read existing file
  2. extract custom blocks
  3. render template
  4. merge custom blocks
  5. write file
- Keep non-update mode behavior unchanged.

Task 7

[x] Custom Block Extractor/Validator
- Implement marker parser for:
  - `<custom-imports>`
  - `<custom-types>`
  - `<custom-methods>`
  - `<custom-routes>`
  - `<custom-schema>`
- Add strict validation:
  - missing closing marker -> stop operation
  - malformed marker state -> warning/error logs

Task 8

[x] Merge Engine and Conflict Policy
- Merge extracted blocks into freshly rendered output.
- Define deterministic behavior for missing placeholder in new template.
- Ensure generated areas remain updatable while custom blocks remain preserved.

Task 9

[x] Artifact Rollout I: Model + Crud + Filters + Types
- Add first artifact group generation in manifest order.
- Verify dependency links:
  - crud depends on model
  - filters depends on types

Task 10

[x] Artifact Rollout II: Service + Admin Service
- Add service generation with ownership/objectId handling rules.
- Add admin service variant and `Include Admin API` toggles.

Task 11

[x] Artifact Rollout III: Schema + Routes + Admin Routes
- Add schema generation and route files using finalized ordering.
- Keep route/index injection idempotent and aligned with artifact names.

Task 12

[x] Logging Standardization
- Upgrade backend generation logs to structured context-based logs:
  - flow steps
  - file create/update/merge events
  - marker extraction/merge outcomes
  - error context (`step`, `file`, `reason`)

Task 13

[x] UI/Settings Wiring for BE Options
- Ensure backend settings map to new manifest artifacts and ordering.
- Update labels/flags (`Include Admin API`, selected file set, update mode semantics).

Task 14

[x] Verification and Regression Suite
- Verification kapsamı tamamlandı:
  - generation order assertions
  - update-preserves-custom-blocks
  - admin/non-admin output matrix
  - type contract roundtrip (renderer <-> preload <-> main)
- Manual smoke doğrulaması:
  - representative module üzerinde generate/update akışı kontrol edildi
  - custom block merge davranışı ve artifact sırası doğrulandı

Task 15

[x] Stack-Scoped Core Bootstrap Guard (Create-If-Missing)
- Enforce backend stack scope before bootstrap:
  - only run for `Express + Mongoose + TypeScript`
  - skip for non-target stacks (.NET/TypeORM/Prisma) with explicit log
- Add bootstrap check in generation flow for canonical core files:
  - `src/core/errors/error-codes.ts`
  - `src/core/errors/error.helper.ts`
  - `src/core/logging/logger.ts`
  - `src/core/pagination/pagination.helper.ts`
  - `src/core/response/response.helper.ts`
  - `src/core/types/api-contract.ts`
- If files exist: do not modify.
- If files are missing: copy from static generator assets.
- Add structured logs for check/create/skip/fail stages.
- Covered in this task:
  - pagination helper standardization (`src/core/pagination/pagination.helper.ts`) via static asset + create-if-missing + lifecycle logging
- Legacy cleanup (same task scope):
  - identify unused/obsolete backend core files and old template artifacts (`.hbs`) after stack-scoped asset mapping is active
  - remove files that are no longer referenced by manifest/template resolution/bootstrap mapping
  - current pass result: no safe removal candidate detected yet (no deletion applied in this step)
  - keep removal list explicit in PR/commit notes to avoid accidental deletion

Task 16

[x] Canonical Response Helper Integration
- Add canonical `response.helper.ts` as static core asset (non-template, no Handlebars render).
- Enforce route import standard:
  - `AtaResponse` from `@core/response/response.helper`
- Enforce service import standard:
  - `SuccessResponse`, `InternalServerErrorResponse`, `ErrorResponse` from same helper.
- Include dependency imports:
  - `@core/types/api-contract`, `@helpers`, `@utils/requestContext`,
  - `@core/logging/logger`, `@core/errors/error.helper`, `@core/errors/error-codes`.
- Completed integration updates:
  - route templates now import `AtaResponse`/`ErrorResponse` from `@core/response/response.helper`
  - service templates now import `SuccessResponse`/`InternalServerErrorResponse`/`ErrorResponse` from same helper

Task 17

[x] Response Model Legacy Cleanup (General)
- Remove legacy response-model generation path now that canonical core helper is bootstrapped:
  - deprecate/remove `responseModel` option usage across renderer <-> preload <-> ipc <-> generator contract
  - remove `generateResponseModel()` invocation flow from backend generation
  - remove template-based response artifact usage (`src/main/templates/backend/response.hbs`) after call sites are cleaned
- Keep generation backward-safe:
  - ensure no remaining `renderTemplate('response', ...)` path
  - ensure backend generation still succeeds with current selectedFiles payloads
- Cleanup outputs and docs:
  - remove stale references to `responses.model.ts` where no longer valid
  - update task/docs notes to reflect static core response helper as the single source
- Verification:
  - no runtime/template-resolution errors after removal
  - response layer import standard remains `@core/response/response.helper`
- Completed cleanup updates:
  - removed `responseModel` option usage from renderer <-> preload <-> ipc <-> backend generator contract
  - removed `generateResponseModel()` flow and all `renderTemplate('response', ...)` usage
  - removed legacy response template file: `src/main/templates/backend/response.hbs`

Task 18

[x] Service Template Pagination Integration
- Update backend service/admin service templates:
  - import `extractListPagination`, `resolveListSort`
  - use extracted pagination data in getAll
  - pass `sort` with fallback `{ createdAt: -1, _id: -1 }`
- Ensure filter payload and pagination keys are separated correctly.
- Completed integration updates:
  - service and admin service templates now parse `filters/limit/page/sortBy/sortOrder` via `extractListPagination`
  - getAll sorting now uses `resolveListSort(..., { createdAt: -1, _id: -1 })`
  - pagination keys are separated from filter payload before query build

Task 19

[x] Route/Service Import Canonicalization
- Replace legacy imports with canonical alias-based imports where required.
- Keep schema/model imports separately for domain access.
- Validate generated imports align with aliases used in target project structure.
- Enforce route/service conventions:
  - routes import `AtaResponse` from `@core/response/response.helper`
  - services import pagination helpers from `@core/pagination/pagination.helper`
- Completed canonicalization updates:
  - route templates use `@core/response/response.helper` for response-layer imports
  - service templates use `@core/response/response.helper` and `@core/pagination/pagination.helper`
  - domain model/type/schema imports remain relative to module paths for direct data access

Task 20

[x] Response Layer Logging Contract
- Standardize response helper log events:
  - response success/failure event payload
  - error response event payload
  - requestId/userId/duration/statusCode mapping
- Ensure generator emits explicit logs when helper behavior deviates from canonical template.
- Completed contract updates:
  - canonical response helper events validated (`http.response`, `http.errorResponse`) with request context and status mapping fields
  - generator now emits explicit warning when existing core helper content deviates from canonical asset while preserving user file (no overwrite)

Task 21

[x] Error Layer Canonicalization
- Add/verify canonical error layer files in core bootstrap set:
  - `src/core/errors/error-codes.ts`
  - `src/core/errors/error.helper.ts`
- Enforce behavior contract:
  - `error-codes.ts` is single source for HTTP/domain code mapping
  - `error.helper.ts` normalizes service-layer failures into `IApiResponse`
  - include normalization for validation/cast/duplicate/jwt/rate-limit/timeout/db-unavailable errors
- Ensure service error logs include request context fields.
- Completed canonicalization checks:
  - core bootstrap mapping already includes `error-codes.ts` and `error.helper.ts` as create-if-missing static assets
  - `error-codes.ts` is the canonical code map source (`ErrorCodes`, `ErrorCodeKey`)
  - `error.helper.ts` normalizes service errors into `IApiResponse` and covers validation/cast/duplicate/jwt/rate-limit/timeout/db-unavailable branches
  - service error logging includes request context fields (`requestId`, `userId`) via `getRequestContext()`

Task 22

[x] Core Helper Verification Checklist
- Add verification steps (manual + test scaffold):
  - core bootstrap files are created only when missing
  - bootstrap runs only for Express-Mongoose stack
  - get-all endpoints include pagination/sort behavior
  - route/service imports use response helper standard
  - fallback sort applied when sort input absent
- Verification completed:
  - bootstrap create-if-missing mapping is present for core helpers in `BackendGenerator`
  - stack guard is enforced via Express-Mongoose check before bootstrap
  - service/admin service templates use `extractListPagination` + `resolveListSort`
  - fallback sort `{ createdAt: -1, _id: -1 }` is applied in both service templates
  - route/service templates use canonical response helper imports (`@core/response/response.helper`)

Task 23

[x] Remove Technology Stack Dropdown

New Flow

Project Root Selected
↓
Project Scan
↓
Auto Detect Stack
↓
Display Detected Technologies
↓
Model Discovery

Project Path Rule

User must select project root.

Correct:

/Users/atakanatabey/Projects/Varlik360

Wrong:

/Users/atakanatabey/Projects/Varlik360/src/modules/transactions

Generator needs access to:
- package.json
- tsconfig.json
- core folder
- src/modules
- aliases
- generator configs

Auto Detect

Supported stacks:
- Node.js / Express / Mongoose
- C# / ASP.NET Core / Entity Framework

Detection sources:
- package.json
- *.csproj
- Program.cs
- tsconfig.json

Logging

All detection steps must be logged.

Example:

[Generator] Project root selected
[Generator] package.json found
[Generator] Mongoose detected
[Generator] Model discovery started
[Generator] 12 models found

Error example:

[Generator][Failed]
step: auto-detect
reason: package.json not found

Success Criteria
- Technology Stack dropdown removed
- Root project selection enforced
- Stack auto detection works
- Detected technologies displayed
- Model discovery works
- Logging added
- Completed updates:
  - manual stack selection dropdown removed from project selection UI
  - project scan now supports auto-detect when source type is not provided
  - detected stack and detected technologies are displayed in UI
  - scan flow runs with project-root based detection and model discovery
  - detection/log events added for project-root selected, package detection, stack detection, discovery start/result, and auto-detect failure
  - Node/Mongoose model discovery strategy updated to `src/modules/**` (`*.model.ts`/`*.model.js`) only; `src/models` path is no longer used
  - UI info message now shows scan strategy from detected stack (`discoveryInfo`) instead of fixed `src/models` text

Task 24

[x] Backend Generation Settings UI

When Generation Mode is Backend Only or Full Stack, show Backend Settings.

Fields:
- Update existing files
- Include Admin API
- Select files to generate

File options:
- Model
- Types
- Schema
- Filters
- Crud
- Service
- Routes

If Include Admin API is enabled, also show:
- Admin Service
- Admin Routes

Rules:
- Rename isAdminUser to Include Admin API
- Hide Base API URL when mode is Backend Only
- Backend module default should select the standard 9 generated files
- Admin files are only visible when Include Admin API is enabled
- Safe update mode must preserve custom blocks
- Generated files must follow dependency generation order
- Completed UI updates:
  - backend settings are shown only in Backend Only / Full Stack modes
  - Base API URL field is hidden in Backend Only mode
  - Include Admin API labeling is consistent in settings sections
  - backend selected file defaults and admin-file visibility follow current 9-artifact generation flow

Task 25

[x] Improve Model Detail Field Configuration UI
- Increase main container width to 1280px or 1440px
- Field configuration table must support horizontal scroll
- Add Sortable column
- Add Filterable column
- Add Filter Type column
- Add Default Value column
- Add Readonly column
- Add Hidden From Create column
- Add Hidden From Update column
- Relation fields must support:
  - target model selection
  - relation property selection
  - relation type selection
- Relation fields should automatically suggest:
  - Select
  - Autocomplete
  - AsyncSelect
- Array fields should support:
  - multi select
  - chips
  - tag input
- _id should be readonly and hidden from form by default
- createdAt should be readonly and hidden from form by default
- ownership fields like userId should be hidden from normal user form
- ownership fields may be visible in admin form
- Readonly fields should automatically disable create/update editing
- Hidden From Create fields should not appear in create schemas/forms
- Hidden From Update fields should not appear in update schemas/forms
- Default Value should support:
  - static values
  - currentDate
  - currentUserId
  - uuid
- Filter Type should support:
  - regex
  - exact
  - objectId
  - range
  - boolean
  - date-range
- Sortable fields should automatically generate backend sort support
- Filter settings should automatically affect:
  - filters.ts
  - schema.ts
  - frontend filter UI
- Every field configuration option must explicitly affect generated output
- Progress update (implemented in this pass):
  - main container widened to 1440px and field table min width increased for better horizontal workspace
  - added columns/controls: Sortable, Filter Type, Default Value, Readonly, Hidden From Create, Hidden From Update
  - relation configuration now supports target model + relation property + relation type
  - UI component options expanded with relation/array friendly options (`Autocomplete`, `AsyncSelect`, `Chips`, `TagInput`)
  - default field behaviors improved (`_id`/`createdAt`/`updatedAt` readonly-hidden; `userId` hidden from normal form)
- Remaining for full completion:
  - ensure every new field option is consumed end-to-end by backend/frontend generation templates
  - wire explicit schema/create/update omissions based on `hiddenFromCreate` / `hiddenFromUpdate` (base integration done; full coverage pending)
  - wire readonly/hidden/defaultValue behaviors across all templates (frontend + backend)
  - complete `filterType` coverage in all generated layers (filters/types wired; schema/frontend filter UI linkage pending)

Task 26

[x] Naming Helper Enforcement in Backend Generator
- Eliminate ad-hoc string concatenation for module/entity names in backend generation flow.
- Route all naming transforms through shared helpers:
  - `camelCase`
  - `pascalCase`
  - `kebabCase`
  - `pluralize`
  - `singularize`
- Add regression assertions for representative entity names (`userWatchList`, pluralization edge cases).

Task 27

[x] Generator Logging Checklist Completion Gate
- Add a verification gate that each critical generation step emits success/fail logs:
  - stack detection
  - model discovery
  - model parse
  - normalized model build
  - relation/objectId resolution
  - ownership resolution
  - queue creation
  - template render
  - safe write / custom block merge
  - core bootstrap check
- Ensure fail path logs include `step`, `module`, `file`, `reason` context.

Task 28

[x] Backend Module-Centric Output Layout (Single Folder Per Model)
- This is an architectural generation task (not a bug fix).
- Change backend artifact output layout from scattered folders (`models/`, `services/`, `routes/`, `schemas/`, `types/`) to a module-centric structure:
  - `src/modules/<module-name>/`
- For each generated backend module, place all artifacts in the same module folder:
  - `<module>.model.ts`
  - `<module>.crud.ts`
  - `<module>.filters.ts`
  - `<module>.types.ts`
  - `<module>.service.ts`
  - `<module>.service.admin.ts` (if enabled)
  - `<module>.schema.ts`
  - `<module>.routes.ts`
  - `<module>.routes.admin.ts` (if enabled)
- Update template import paths to be module-local and consistent with the new co-located layout.
- Keep generation order and safe-update/custom-block merge behavior unchanged.
- Align scanner/discovery assumptions with this layout (`src/modules/**` remains the single source).
- Verification:
  - generating `transactions` produces files under `src/modules/transactions/*` only
  - no new files are produced under legacy scattered folders
  - generated services/routes compile with correct relative imports in module folder
  - admin on/off matrix still works with co-located file layout

Task 29

[x] Middleware Import + Auth/Admin Enforcement in Routes
- Fix route middleware import standard:
  - prefer `import { authMiddleware, adminAuthMiddleware } from '@middlewares';`
  - avoid relative `../middlewares` usage in generated module routes
- Middleware behavior rules:
  - if **Requires Authentication** is enabled → `router.use(authMiddleware);`
  - if **Requires Authentication** + **Include Admin API** are both enabled → in admin routes:
    - `router.use(authMiddleware);`
    - `router.use(adminAuthMiddleware);`
- Apply to:
  - `src/main/templates/backend/route.hbs`
  - `src/main/templates/backend/route.admin.hbs`
- Add request validation (params/body):
  - Required imports:
    - `import { validate } from '@core';`
    - `import * as TSchema from './<module>.schema';`
  - Standardize usage of a `validate(...)` middleware for routes
  - `GET /:id` must validate params:
    - example: `router.get('/:id', validate({ params: TSchema.<Entity>MongoIdParamSchema }), ...)`
  - `POST /create` and `POST /update/:id` must validate body using generated schemas (or equivalent shared schema contract)
  - `POST /get-all` must validate body using `TSchema.<Entity>GetAllBodySchema`
  - Ensure both normal and admin route templates apply the same validation rules
- Verification:
  - protected normal routes include only `authMiddleware`
  - protected admin routes include `adminAuthMiddleware` then `authMiddleware`
  - unprotected routes include no auth middleware
  - `GET /:id` routes include params validation middleware
  - create/update routes include body validation middleware
  - `validate` and `TSchema` imports exist in generated routes

Task 30

[x] Backend Schema Standard: GetAll Filter + Pagination Merge
- Update `schema.hbs` to match backend standard:
  - `ListPaginationBodySchema` import from `@core/schema/list-pagination.schema`
  - `<Entity>GetAllFilterSchema` (strict; uses searchable fields)
  - `<Entity>GetAllBodySchema = <Entity>GetAllFilterSchema.merge(ListPaginationBodySchema)`
  - `<Entity>MongoIdParamSchema` with `id: z.string().min(1)`
  - keep `<Entity>CreateBodySchema` and `<Entity>UpdateBodySchema`
- Extend `zodField` helper to support `filter` mode:
  - emits only searchable fields
  - always optional
  - avoids business logic in templates
- Verification:
  - `GetAllBodySchema` exists and merges pagination schema
  - routes can reference `TSchema.<Entity>MongoIdParamSchema` and `TSchema.<Entity>GetAllBodySchema`

Task 31

[x] Backend Service Standard: Use BaseCrudService + Filters + Types
- Align `service.hbs` / `service.admin.hbs` generated output with the target standard (example: `@modules/symbol-types`):
  - import list/pagination helpers:
    - `extractListPagination`, `resolveListSort` from `@core/pagination/pagination.helper`
  - import module-local types:
    - `Get<Entity>Filters`, `I<Entity>Input`, `<Entity>ListBody` from `./<module>.types`
  - import module-local model type for FilterQuery:
    - `type I<Entity>Model` from `./<module>.model`
  - import filter builder:
    - `build<Entity>FilterQuery` from `./<module>.filters`
  - import CRUD instance:
    - `<camel>Crud` from `./<module>.crud`
  - service functions must delegate to `BaseCrudService` methods (no direct `Model.find/create/update/delete`):
    - `getAll` → `<camel>Crud.getAllPaginated(...)`
    - `getById` → `<camel>Crud.getById(id)`
    - `create` → `<camel>Crud.create(...)`
    - `update` → `<camel>Crud.updateById(id, ..., {})`
    - `delete` → `<camel>Crud.deleteById(id)`
- Remove legacy service concerns from templates:
  - no `SuccessResponse` / `InternalServerErrorResponse` / `ErrorResponse` in service layer when `BaseCrudService` handles response contract
  - no inline “CreateFilters” builder inside `service.hbs` (must use `*.filters.ts`)
- Verification:
  - service/admin service compile with module-local imports only
  - `getAll` returns result from `<camel>Crud.getAllPaginated(...)` with `resolveListSort(..., { createdAt: -1, _id: -1 })`
  - no direct `Model.find*` calls remain in generated services

Task 32

[x] Backend Admin Service Standard: Mirror Public Service Contract
- Align `service.admin.hbs` generated output with the same BaseCrudService-driven contract as public service.
- Admin service should look like the provided reference:
  - imports:
    - `extractListPagination`, `resolveListSort` from `@core/pagination/pagination.helper`
    - `Get<Entity>Filters`, `I<Entity>Input`, `<Entity>ListBody` from `./<module>.types`
    - `type I<Entity>Model` from `./<module>.model` and `FilterQuery` from `mongoose`
    - `build<Entity>FilterQuery` from `./<module>.filters`
    - CRUD instance from `./<module>.crud`
  - exports:
    - `getAll`, `getById`, `create`, `update`, `delete<Entity>` delegating to CRUD methods
- No response-helper usage inside services (BaseCrudService handles response contract).
- Verification:
  - admin service compiles and has no direct `Model.find*` calls
  - getAll uses `build<Entity>FilterQuery` + `extractListPagination` + `resolveListSort`

Task 33

[x] CRUD Scope Defaults: User scoped by default, Admin explicit
- Update CRUD template output:
  - Always generate admin CRUD when `Include Admin API` is enabled:
    - `export const <camel>AdminCrud = new <Entity>Crud(false);`
  - Public/user CRUD is scoped by default only when module is protected and has `userId`:
    - `export const <camel>Crud = new <Entity>Crud(true);`
- Rules:
  - Public services must use the user-scoped CRUD by default (requireAuthUserIdScope = true).
  - Admin services must use the admin CRUD instance explicitly (scope OFF).
- Verification:
  - `Include Admin API` enabled modules generate `<camel>AdminCrud`
  - generated public service imports `<camel>Crud`; admin service imports `<camel>AdminCrud`

Task 34

[x] Backend Types Standard: Filters + Pagination Body
- Update `types.hbs` to match module backend standard:
  - import `ListPaginationBody` from `@core/pagination/pagination.helper`
  - generate `Get<Entity>Filters` (searchable fields only)
  - generate `<Entity>ListBody = Get<Entity>Filters & ListPaginationBody`
  - keep backward-compatible alias: `Get<Entity>Query = Get<Entity>Filters`
- Verification:
  - service templates can import `Get<Entity>Filters` and `<Entity>ListBody`
  - existing references to `Get<Entity>Query` still compile

Task 35

[x] Frontend Template Business-Logic Cleanup (Helper/Mapper Refactor)
- Enforce `beAnalyze` rule: templates must not contain business logic (type/flag branching).
- Kapsam — `templates/frontend/` altındaki **tüm** şablonlar (9 dosya); önceki task maddesi eksikti:
  - `modal.hbs` — form alanları, create/edit kuralları, tip/flag dallanması
  - `core.modal.hbs` — ortak modal iskeleti / wrapper; varsa koşullu davranış helper’a taşınır
  - `page.hbs` — liste sayfası; kolon/thunk bağları ve koşullu UI
  - `table.hbs` — tablo yapısı, sıralama/filtre ile ilgili şablon mantığı
  - `table-cell.hbs` — hücre render, ilişki gösterimi, formatlayıcılar
  - `slice.hbs` — Redux state/reducer tarafında şablona gömülü iş kuralları varsa sadeleştirme
  - `thunk.hbs` — API çağrıları, payload/query oluşturma dalları
  - `service.hbs` — public API katmanı DTO ve koşullu tip/metot gövdesi
  - `service.admin.hbs` — admin API katmanı (aynı standard)
- Implement new Handlebars helpers for frontend templates where needed (in `templateHelpers.ts`), e.g.:
  - `shouldRenderField(field, mode)` — create/edit görünürlüğü (`modal.hbs`)
  - `feBool` — readonly bayrakları
  - `feEntityPropLine` / `feInputPropLine` / `feAdminInputPropLine` / `feFilterQueryPropLine` / `feEntitySyntheticIds` — service şemaları
  - `feTableCellExpr` / `feTableFilterFieldAttrs` — tablo
  - `feModalCreateDefaultInits` / `feModalBooleanNormalizeLines` / `feRelationIdAssign` / `feModalDeletePrimaryKeyLine` — modal submit & defaults
  - `fePrimaryIdMember` — page primary key
  - `feSliceUpdateFulfilledBody` / `feSliceDeleteFulfilledBody` — slice extraReducers
  - `thunk.hbs`: yalnızca `hasSearchableFields` ile sınırlı; ek `eq type` yoktu
  - `core.modal.hbs`: iş mantığı yok; değişiklik gerekmedi
- Verification:
  - templates contain only minimal presentational conditions
  - no `{{#if (eq type ...)}}` / `eq sourceType` style logic remains in frontend templates
  - generated frontend code behavior stays consistent with current UI-config flags

Task 36

[x] Mongoose _id Handling: UI shows, model schema omits
- Goal:
  - Field Configuration UI must always include `_id` for Mongoose models (filter/sort config is possible).
  - Generated Mongoose `*.model.ts` must NOT explicitly define `_id` in schema (default ObjectId behavior), unless a future explicit “custom _id type” feature exists.
- Implementation:
  - Renderer `mergeSchema(...)` injects a synthetic `_id` field for `nodejs-mongoose` if missing from parsed schema.
  - Backend generator skips `_id` / `id` when building `modelFields` for `model.hbs` so schema doesn't include them.
- Verification:
  - Field Configuration table includes `_id` on Mongoose models even when not declared in model file.
  - Generated `<module>.model.ts` does not include `_id: { ... }` in schema fields by default.

Task 37

[x] Frontend Service Template: Include Admin API → `service.admin` Only Else `service`
- Goal:
  - Schema Designer’da **Include Admin API** (`isAdminUser`) işaretliyken frontend’de yalnızca `templates/frontend/service.admin.hbs` → `src/.../services/<camel>.service.admin.ts` üretilsin.
  - İşaretli değilken yalnızca `service.hbs` → `<camel>.service.ts` üretilsin (aynı anda iki service dosyası üretilmez).
  - `thunk` / `slice` / `page` / `table` / `modal` import’ları `{{#if isAdminUser}}.admin{{/if}}` ile seçilen dosyayla uyumlu kalsın.
- Implementation (mevcut):
  - `SchemaDesignPage` → `generateFrontend({ ..., isAdminUser })`
  - `projectSlice` → IPC `generateFrontend(..., isAdminUser)`
  - `ipc/frontendGenerator.ts` → `FrontendGenerateOptions.isAdminUser`
  - `FrontendGenerator.generateFrontendFiles`: `isAdminUser` ? `service.admin` + `.service.admin.ts` : `service` + `.service.ts`
- Verification:
  - Include Admin API **açık**: çıktıda `*.service.admin.ts`; import path’ler `@/services/foo.service.admin`
  - **kapalı**: çıktıda `*.service.ts`; import path’ler `@/services/foo.service`

Task 38

[x] Frontend Modal: JSON Tabanlı Create / Update (Admin + Non-Admin aynı akış)
- Goal:
  - Frontend’de create ve update işlemleri için modal içinde alan bazlı form (`TextField`, ilişki seçimi vb.) yerine **doğrudan bir JSON düzenleyici** gösterilsin.
  - **Admin ve non-admin akışı aynı olacak**: aynı modal bileşeni JSON editör ile çalışacak; service import’u `isAdminUser` seçimine göre (`*.service` vs `*.service.admin`) zaten ayrışır.
  - Kullanıcı JSON’u doldurup kaydedebilsin; payload ilgili service (`create` / `update`) ile gönderilsin.
  - Böylece relation / objectId gibi alanlarda UI input karmaşıklığı ortadan kalkar; kullanıcı ID string’leri ile çalışır.
- Scope (taslak — yarın genişletilecek):
  - `templates/frontend/modal.hbs`: JSON UI (syntax validation + submit engeli).
  - Başlangıç değeri:
    - create: default value’lar ile oluşturulmuş şablon JSON
    - edit: mevcut item’ın JSON hali (relation objeleri id’ye indirgenir; ana id alanı payload’dan çıkarılır)
  - Normal (protected) akış: beAnalyze ownership standardı korunur (örn. `userId` body’den alınmaz → payload’dan silinir).
  - İlişkiler: ObjectId / nested objeler JSON içinde string veya ham obje olarak — backend contract ile uyum (detay sonra).
- Verification (taslak):
  - Add / Edit açıldığında JSON editör görünür; geçersiz JSON’da submit olmaz.
  - Admin/non-admin aynı UI akışıyla doğru service endpoint’lerine gider.

Task 39

[x] Frontend Table Pagination Entegrasyonu (generator çıktısı)
- Goal:
  - Backend `get-all` artık pagination destekli (`ListPaginationBody` / `GetAllBodySchema`), frontend tablo/list ekranına pagination UI entegre edilsin.
  - Üretilen sayfa + tablo bileşenleri: sayfa değişimi, limit değişimi ve total/hasMore gibi state’ler ile listeyi tekrar fetch edebilsin.
- Scope (taslak — detay sonra):
  - `templates/frontend/service*.hbs`: `getAll` imzası pagination body ile uyumlu hale getirilecek (filters + pagination birleşimi).
  - `templates/frontend/thunk.hbs`: `fetchList` thunk payload'ı `filters + pagination` alacak.
  - `templates/frontend/slice.hbs`: `items` yanında pagination state (page, limit, total?) tutulacak.
  - `templates/frontend/page.hbs` + `templates/frontend/table.hbs`: MUI TablePagination veya benzeri UI ile sayfa/limit kontrolü.
  - Admin/non-admin akışı: `isAdminUser` seçimine göre doğru service import’u ile çalışmalı.
- Verification (taslak):
  - İlk yüklemede sayfa=1 ile fetch olur; pagination UI ile page/limit değişince doğru request atılır.
  - Arama/filtre ile pagination birlikte çalışır (filter değişince page reset).

Task 40

[x] Frontend Table Layout + GetAll Response Shape Uyum (pagination öncesi)
- Goal:
  - Üretilen tablo bileşenleri her ekranda **%100 genişlik**te (container/table layout) düzgün render olsun.
  - Backend `get-all` response şekli değiştiyse (ör. `{ items, total, ... }`), frontend state bunu doğru parse edip `items` listesini ekrana bassın.
  - Bu düzeltme **Task 40 pagination** entegrasyonundan önce yapılacak (pagination state geldiğinde zaten bu altyapıya dayanacak).
- Scope (taslak):
  - `templates/frontend/table.hbs`: `TableContainer`/`Table` genişlikleri `width: '100%'` / `minWidth` stratejisi; taşma varsa yatay scroll ama container hep %100.
  - `templates/frontend/page.hbs`: tabloya verilen prop’lar (`items`) artık response’dan gelen `items` ile beslenecek.
  - `templates/frontend/slice.hbs`: `fetchList.fulfilled` reducer’ı yeni response shape’e göre `state.items = payload.data.items` (veya benzeri) ataması yapacak; eski “data doğrudan array” varsayımı kaldırılacak.
  - `templates/frontend/thunk.hbs` + `templates/frontend/service*.hbs`: `getAll` dönüş tipi / `LocalResponse<T>` generic’i yeni shape’e göre düzeltilecek (ör. `LocalResponse<{ items: I{{entityName}}[]; total?: number; ... }>`).
  - Admin/non-admin: aynı değişiklik `service.admin` ve import kullanan thunks/pages için de geçerli.
- Verification (taslak):
  - Table alanı her ekranda container’ı tam kaplar; “dar tablo” problemi olmaz.
  - GetAll sonucu `items` içinde dönüyorsa, liste ekranda görünür (boş kalma problemi çözülür).

Task 41

[x] Frontend Modal Template Render Hatası: Missing helper `and` → modal dosyası üretilmiyor
- Problem:
  - `modal.hbs` içinde `{{#if (and ...)}}` kullanımı var ama helper register edilmediği için generation sırasında:
    - `Failed to render template modal: Missing helper: "and"`
  - Modal dosyası üretilmediği halde `page` template’i `import ...Modal` yazdığı için build/runtime kırılıyor.
- Fix:
  - `src/main/utils/templateHelpers.ts` içine `and` (ve tamamlayıcı olarak `or`, `not`) helper’ları eklendi.
- Verification:
  - Frontend generation log’larında `frontend:modal` render hatası kaybolur.
  - `...Modal.tsx` dosyası üretilir ve `page` import’u boşa düşmez.

Task 42

[x] Frontend Module-Centric UI Output (Apps yapılarına uygun)
- Context:
  - FE monorepo yapısı: `apps/admin` (Vite+React) ve `apps/mobile` (RN).
  - Generator tarafında mobile/admin ayrımı yok; **tek standart** uygulanacak ve **UI çıktıları sadece admin web app** için hedeflenecek (mobile UI üretilmeyecek).
  - Şu an generator FE çıktısını `src/services`, `src/store`, `src/pages`, `src/components` gibi flat klasörlere yazıyor.
- Goal:
  - **`services/` ve `store/` mevcut yapıda kalsın** (dokunma).
  - UI/feature çıktıları (page + components) **modül merkezli** üretilsin:
    - `src/modules/<module>/components/TransactionsTable.tsx`
    - `src/modules/<module>/components/TransactionsModal.tsx`
    - (opsiyonel) `src/modules/<module>/components/TransactionsForm.tsx`
    - `src/modules/<module>/pages/TransactionsPage.tsx`
  - Hedef path admin app altıdır: `apps/admin/src/modules/<module>/...`.
- Scope (taslak — implementasyon sonra):
  - `FrontendGenerator` path mapping: `components` + `pages` hedef klasörleri `src/modules/<module>/...` olacak.
  - HBS import güncellemesi: `page.hbs` artık `@/modules/<module>/components/...` import eder.
  - Route integration: mevcut `routes/` yapısına entegrasyon şekli netleşecek (auto-inject mi manuel mi).
  - Naming: `<module>` segmenti (kebab/camel) standardı netleşecek ve `BackendGenerator` ile tutarlı olacak.
- Verification (taslak):
  - Generate sonrası `apps/admin/src/modules/<module>/...` altında page+components oluşur; `services` ve `store` aynı yerde kalır.

Task 43

[x] Frontend JSON Modal: Create template keys + Search sadece butonla fetch
- Problem:
  - JSON modal create ekranında `{}` boş geliyor; kullanıcı hangi property’leri göndereceğini göremiyor.
  - Search filter input’ları değiştikçe `useEffect` dependency yüzünden her karakterde request atılıyor.
- Fix:
  - `modal.hbs`: create mode’da `initialData` için field bazlı key skeleton üretilir (defaults + placeholder’lar). (Helper: `feModalEnsureJsonKeys`)
  - `page.hbs`: `draftFilters` vs `appliedFilters` ayrıldı; sadece Search/Reset applied’ı değiştirir, fetch effect yalnız `appliedFilters`’a bağlı.
- Verification:
  - Create modal JSON editöründe payload anahtarları şablon olarak görünür.
  - Filtre input’larında yazarken request atılmaz; yalnız Search (ve Reset) ile fetch olur.

Task 44

[x] Backend Schema: Ownership varsa normal/admin ayrışması + admin route admin schema kullanımı
- Goal:
  - Tek `*.schema.ts` içinde hem normal hem admin şemaları üret (Include Admin API açıksa).
  - Ownership field (örn. `userId`) varsa:
    - Normal (protected) endpoint’ler body + filter’da ownership kabul etmesin.
    - Admin endpoint’ler body + filter’da ownership kabul edebilsin.
  - `route.admin` template’i validate middleware’de admin şemalarını kullansın.
- Implementation:
  - `templateHelpers.ts`: `zodFieldScoped` helper eklendi (ownership field include/omit kontrolü).
  - `schema.hbs`: normal şemalar ownership’i omit edecek şekilde üretildi; admin varyantları (`*AdminSchema`) eklendi.
  - `route.admin.hbs`: ownership varsa `GetAllBodyAdminSchema`, `CreateBodyAdminSchema`, `UpdateBodyAdminSchema` kullanır.

Task 45

[x] Frontend Generation Defaults: Base API URL sabit `/api` + default Frontend Project Path
- Goal:
  - `SchemaDesignPage` içinde **Base API URL UI alanı kaldırılır**; fiili değer **sabit `/api`** olur.
  - **Frontend Project Path** default değeri şimdilik sabit olsun:
    - `/Users/atakanatabey/Projects/Varlik360/apps/admin`
- Scope:
  - `SchemaDesignPage.tsx`: baseUrl sabit `/api` + UI input kaldırılır; generate payload’ı sabit `/api` kullanır.
  - `projectSlice` initialState veya UI state: frontendPath için default path set edilecek (Browse yine çalışabilir).
- Verification:
  - Uygulama açılışında Base API URL alanı yoktur; generate sırasında `/api` gider.
  - Frontend path alanı açılışta `.../apps/admin` ile dolu gelir.

Task 46

[x] Backend Core Bootstrap: `BaseCrudService` static asset olarak copy-if-missing
- Goal:
  - Backend generator `crud.hbs` ve service layer standartları `@core/services/base-crud.service` import’una güveniyor.
  - Hedef projede bu dosya yoksa build kırılıyor; bu yüzden `BaseCrudService` dosyası da core bootstrap setine eklenmeli.
- Implementation plan:
  - Generator asset olarak şu dosya eklenecek:
    - `src/generator-assets/core/services/base-crud.service.ts`
  - `BackendGenerator.ensureCoreBootstrapFiles()` listesine eklenecek:
    - source: `src/generator-assets/core/services/base-crud.service.ts`
    - target: `src/core/services/base-crud.service.ts`
  - Copy-if-missing kuralı korunur (varsa overwrite edilmez; canonical deviation warn edilir).
- Verification:
  - Yeni bir target backend projede `src/core/services/base-crud.service.ts` yoksa generation sırasında otomatik oluşur.
  - `*.crud.ts` dosyalarındaki `import { BaseCrudService } from '@core/services/base-crud.service'` çalışır.

Task 47

[x] Backend Service Populate: Relation alanları için otomatik `populate` desteği
- Goal:
  - Service layer’da (`service.hbs` / `service.admin.hbs`) relation (populate edilebilir) alanlar varsa:
    - `getAll` çağrısında `crud.getAllPaginated(..., { populate: ... })` eklensin
    - `getById` çağrısında `crud.getById(..., { populate: ... })` eklensin
  - Böylece UI tarafında relation objesi (ör. `userId` → `{ email, name, ... }`) doğrudan dönebilir.
- Input:
  - Relation alanları: `FieldConfig.includeRelation=true` + `relationEntityName` (ve tercihen `relationProperty`/select listesi).
  - Select listesi başlangıçta sabit bir varsayılan olabilir; ileride UI’dan “select fields” konfigürü eklenebilir.
- Scope (taslak):
  - `BackendGenerator` template context’ine “populateConfig” gibi bir map eklemek (hangi field → hangi select).
  - `service.hbs` ve `service.admin.hbs` içinde `populate` parametresi basmak (yalnız relation alanları varsa).
  - Ownership standardı korunur (normal servis userId body’den almaz; populate sadece output içindir).
- Verification (taslak):
  - `includeRelation` işaretli bir alan varsa üretilen service dosyasında `populate: { path: '<field>', select: '...' }` görünür.
  - Relation yoksa populate parametresi hiç basılmaz (gereksiz code yok).

Task 48

[x] Frontend Relation Filter (ID vs Label) Problemi: relation alanlarda yanlış payload
- Problem:
  - Relation alanı (örn. `userId`) tabloda populate ile “User Name” gibi **display** değerle gösterilebiliyor (bu kısım doğru).
  - Ama filtre input’u serbest text olunca kullanıcı “Atakan” yazdığında payload’a `userId: "Atakan"` gidiyor.
  - Backend filtre builder `userId` için **ObjectId/id** beklediği için bu arama semantik olarak yanlış (populate sadece output içindir).
- Goal:
  - Relation alan filtresi, payload’ta **id** göndermeli (örn. `userId: "<mongoId>"`), label/display metin göndermemeli.
- Ne yapmalıyız (öneri):
  - Minimum (Phase 1):
    - Relation filter input’u “User Id” gibi açık etiketle (ya da placeholder ile) id beklediğini belirt.
    - Girilen değer MongoId formatında değilse bu alan payload’a **hiç eklenmesin** (yanlış query göndermeyelim).
  - İyi UX (Phase 2):
    - Relation filter için autocomplete/select üret:
      - Kullanıcı name/email ile arar → listeden seçer → state’e seçilen kaydın `_id`’si yazılır → payload `userId: "<id>"` gider.
      - Bu noktada frontend generator relation service import’larını kullanarak options çekebilir (örn. `usersService.getAll`).
      - Requirement: autocomplete input’una **tıklanınca / focus olunca** options fetch edilmeli (ilk açılışta öneriler gelsin).
        - Fetch stratejisi: (a) ilk focus’ta `limit=10` boş filtreyle, (b) kullanıcı yazdıkça debounce ile aramayı daralt.
        - Not: Bu fetch, ana “Search” butonundan bağımsız küçük bir “options” isteğidir; “Search” butonu yine sadece ana `get-all` isteğini tetikler.
- Scope:
  - Frontend filtre UI üretimi: `templates/frontend/table.hbs` + ilgili helper’lar (`templateHelpers.ts`)
  - (Gerekirse) `schemaUtils` / `schema` modelinden `includeRelation` alanların tespiti ve filtre türü üretimi.
  - FieldConfig’te seçilen **Filter Type** mutlaka input davranışına yansıtılmalı:
    - `filterType=objectId`: sadece valid MongoId kabul et (değilse payload’a ekleme).
    - `filterType=regex`: string kabul et; boş/trim-empty ise payload’a ekleme.
    - `filterType=exact` (number/string): tipine göre normalize et; boşsa payload’a ekleme.
    - (varsa) `filterType=minmax` (number/date): iki alan (min/max) üret; ikisi de boşsa payload’a ekleme.
    - (varsa) `filterType=contains`/`startsWith`: string kabul et; boşsa payload’a ekleme.
- Verification:
  - Relation alan için filtre ile istek atıldığında payload’ta `userId` değeri **id** olur.
  - Serbest “Atakan” yazıldığında `userId` payload’a gitmez (Phase 1) veya autocomplete üzerinden seçilmeden gidemez (Phase 2).

Task 49

[x] UI Config Cleanup + Mongo _id filter defaults + Relation Autocomplete UX netleştirme
- Goal:
  - FieldConfig ekranındaki “Hidden Create / Hidden Update” alanlarının gerçek kullanımı netleştirilip gereksizse kaldırılması.
  - Mongo stack’te `_id` için filterType default’unun `objectId` olduğunun garanti edilmesi.
  - Relation alanlarda Autocomplete davranışının “otomatik mi / kullanıcı seçmeli mi” olarak standardize edilmesi.
- Scope:
  - Hidden Create / Hidden Update:
    - UI’da “Table Features” zaten create/update/delete aksiyonlarını kontrol ediyor (global).
    - Field bazlı `hiddenFromCreate` / `hiddenFromUpdate` gerçekten gerekli mi?
      - Eğer “Create/Update body schema” üretiminde ve modal JSON skeleton’ında aktif kullanılmıyorsa UI’dan kaldır + FieldConfig modelinden çıkar.
      - Eğer gerekli ise: UI copy/label netleştir (global feature değil, alan bazlı body schema kontrolü).
  - `_id` filter type (Mongo):
    - `schemaUtils.enrichFieldWithUIConfig` içinde `_id` / `id` için `filterType: 'objectId'` default’u.
    - UI’da `_id` gösterimi + searchable ise payload validate Phase 1 ile uyumlu.
  - Relation Autocomplete standardı:
    - Relation + searchable ise table filter’da Autocomplete **otomatik** gelsin (UI Component seçimine bağlı olmasın).
    - “In Form / modal” tarafı ayrı: orada Autocomplete gereksinimi varsa ayrıca tanımlanır.
- Verification:
  - FieldConfig ekranında Hidden Create/Update kaldırıldı (veya anlamı net, doğru yere taşındı).
  - Mongo `_id` için filterType varsayılanı objectId; yanlış değer payload’a girmez.
  - Relation filter alanı için Autocomplete kendiliğinden çıkar (includeRelation + searchable).

Task 50

[x] Frontend Relation Autocomplete uygulanmıyor / filter payload regression
- Problem:
  - Generator güncel olmasına rağmen bazı projelerde relation filtre alanı hâlâ TextField gibi davranıyor ve payload’ta `userId: "ata"` gibi string gidiyor.
  - Bu, Phase 2’nin beklenen davranışıyla çelişiyor (relation filter → Autocomplete → seçilen option `_id`).
- Olası root-cause’lar (analiz):
  - Frontend generation, schema’daki `includeRelation` / `relationEntityName` değerlerini template context’e aktarmıyor (veya merge sırasında kayboluyor).
  - `updateExistingFiles=false` ya da “varolan dosyaları güncelle” kapalı olduğu için eski üretilmiş table dosyası overwrite olmuyor.
  - UI’da relation işaretli değil / `isSearchable` kapalı / field.type `schema` değil → template branch’e girmiyor.
- Goal:
  - Relation + searchable alanlarda table filter otomatik Autocomplete üretildiği doğrulanacak.
  - Autocomplete yoksa: generation pipeline’da kaybolan alan(lar) tespit edilip düzeltilir.
- Verification:
  - Generate sonrası ilgili `*Table.tsx` içinde relation alan için `Autocomplete` görünür.
  - Network payload’ta `userId` değeri yalnızca MongoId formatında gider (string name gidemez).

Task 51

[x] Frontend Create Modal JSON skeleton eksik alanlar (örn. userId gelmiyor)
- Problem:
  - Create modal JSON skeleton bazen sadece `"watchValue": ""` gibi tek alanla geliyor.
  - Beklenen: Create body’de gönderilmesi gereken tüm alanlar skeleton’da yer almalı.
  - Özellikle `userId` gibi ownership/relation alanlarının hangi modda (admin vs normal protected) skeleton’a dahil edileceği net değil.
- Analiz noktaları:
  - `modal.hbs` create branch’inde skeleton’ı üreten helper (`feModalEnsureJsonKeys`) hangi field set’ini kullanıyor?
  - `I<Entity>Input` / `feInputPropLine` (normal) ve `feAdminInputPropLine` (admin) userId’yi nasıl omit ediyor?
  - `isProtectedRoute` + `isAdminUser` kombinasyonlarında skeleton kuralları:
    - Normal protected: ownership standardına göre `userId` body’den alınmaz → skeleton’da olmamalı.
    - Admin: `userId` body’de olmalı → skeleton’da görünmeli (relation id string olarak).
- Goal:
  - Create modal skeleton, seçili moda göre doğru alanları üretir:
    - Normal protected: `userId` yok
    - Admin: `userId` var
    - Relation alanları id string olarak yer alır
- Verification:
  - UserWatchList (Admin UI) create modal JSON skeleton’ında `userId` + `watchValue` görünür.
  - Normal protected create skeleton’da `userId` görünmez.

Task 52

[x] Mongo `_id` model tipi: String yerine varsayılan ObjectId
- Problem:
  - Schema Designer'da `_id` satırında tip string görünüyordu; üretilen `*.model` içinde `_id: { type: String, trim: true }` oluşabiliyordu.
  - Mongoose için `_id` `Schema.Types.ObjectId` ile modellenmeli (implicit default ile uyumlu).
- Köken:
  - `schemaParser` otomatik eklenen `_id` için `type: 'string'` kullanılıyordu.
  - `mapMongooseTypeToGeneric('ObjectId')` yanlışlıkla `'string`'e gidiyordu.
- Implementation:
  - `schemaParser.ts`: injector `_id` → `schema`; `ObjectId` / path içindeki `Types.ObjectId` → `schema`; parse edilmiş `_id: String` → `schema`; TS kaynaklı `_id` alanı coerce.
  - `BackendGenerator.ts`: `nodejs-mongoose` + `_id` için her zaman mongoose `Schema.Types.ObjectId`, `trim` yok.
- Verification:
  - Backend generate sonrası `*.model` içinde `_id` → `Schema.Types.ObjectId`.

Task 53

[x] FE: Create/Update sonrası modal kapanışı ve liste yenileme (getAll / fetchList)
- Problem:
  - Create/update başarılı olsa bile modal kapanmıyor veya liste güncellenmiyor gibi davranışlar (thunk `unwrap` + `LocalResponse.isSuccess` uyumsuzluğu).
  - `page.hbs` içinde arama/filtre gövdesinde tanımsız `filters` kullanımı (`appliedFilters` olmalı) — runtime’da refresh kırılabilir.
- Goal:
  - Create/update **sadece `isSuccess === true` iken** liste `fetch*List` ile yenilensin; `onSave` başarısızlıkta **reject/throw** etsin ki modal `onClose` çağırmasın.
  - **Delete** sonrası da aynı liste isteği (`page` / `limit` / `appliedFilters`) ile tablo yenilensin.
  - API hataları modal içinde gösterilmez; genel katman (`api.ts` / interceptor / toast) halleder.
- Implementation:
  - `page.hbs`: `assertLocalSuccess`; `buildListRequestBody` + `refreshEntityList()` — create/update/delete başarısından sonra ortak refresh.
  - `modal.hbs`: yalnızca geçersiz JSON gibi **client-side** doğrulama için `jsonError` (API hatalarında `setJsonError` yok); `catch` sadece log.
- Verification:
  - Başarılı create/update: modal kapanır, tablo güncel veriyi gösterir.
  - Başarılı delete: dialog kapanır, tablo güncellenir.
  - API hata: genel `api.ts` akışı; modal’da API mesajı yok.

Task 54

[x] Schema Designer: Backend / Frontend blok düzeni (FullStack + tipografi)
- Problem:
  - Full Stack modunda backend seçenekleri ile frontend seçenekleri (`Frontend Project Path` dahil) sıralama olarak karışık görünüyordu.
  - `Backend Settings` başlığı ile `Generation Mode:` etiketi boyutları iyileştirilmeli.
- Goal:
  - `Backend Settings` biraz **küçült**; `Generation Mode:` etiketini **biraz büyüt**.
  - **FullStack** iken: `Frontend Project Path` **üstünde** tüm backend ile ilgili seçimler; **altında** frontend ile ilgili kısımlar.
  - Backend ve frontend blokları arasında **ince Divider**.
  - Table Features altındaki uzun açıklama metni kaldırıldı (UI sadeleştirme).
- Implementation:
  - `SchemaDesignPage.tsx`: blok sırası + koşullu `Divider`; Typography variant ayarları.
- Verification:
  - Full Stack: sıra — Auth → backend dosya seçimleri → Divider → Frontend Path → frontend dosya + Table Features.
  - Frontend-only / Backend-only: gereksiz Divider yok; path/bloklar doğru görünür.

Task 55

[x] FE Modal: JSON mode açıklamasını kaldır; Edit modal JSON skeleton create ile hizalı
- Problem:
  - Modal içinde "JSON Mode: …" açıklama metni istenmiyor.
  - Create’te tüm alanlar skeleton’da görünürken Edit’te `JSON.stringify` + eksik `item` alanları (`undefined`) yüzünden sadece bir–iki key (örn. `read`) kalabiliyor.
- Goal:
  - Açıklama Typography kaldırılsın; gereksiz import temizlensin.
  - Edit: önce create ile aynı `initialData` skeleton (`feModalCreateDefaultInits` + `feModalEnsureJsonKeys`), sonra `toPlainJsonValue(item)` ile **yalnızca tanımlı** (`!== undefined`) değerler üstüne yazılsın; primary key / ownership silme kuralları aynı kalsın.
- Implementation:
  - `modal.hbs`, gerekirse `templateHelpers` yok (davranış tamamen şablonda).
- Verification:
  - Notifications admin: Create ve Edit JSON’da `userId`, `title`, `body`, `read` tutarlı görünür (edit’te ID vb. kaldırılmış).

Task 56

[x] Frontend Templates Audit: Business Logic Sıfır Tolerans (beAnalyze 979-989)
- Goal:
  - `templates/frontend/**.hbs` dosyalarında `beAnalyze` kuralı (Template içine business logic yazılmaz) **tam uygulanacak**.
  - Tip/flag/stack/role branching template'lerden kaldırılacak; tamamı helper/mapper katmanına taşınacak.
- Scope:
  - `templates/frontend/*.hbs` tamamı taranır ve **tek tek** kapatılır:
    - [x] `templates/frontend/core.modal.hbs` — **Audit (adım 1):** Şablonda yalnızca `{{currentDate}}`; `eq type` / `sourceType` / ownership / stack dallanması yok. Üretilen bileşen saf UI sarmalayıcı (`Dialog`); `onSave && …` ve `loading ? 'Saving…' : saveLabel` **presentational** kabul edilir, generator iş kuralı değil. `templateHelpers.ts` içinde CoreModal’a özel helper yok ve **gerek yok** (`feModal*` ailesi entity `modal.hbs` için).
    - [x] `templates/frontend/modal.hbs` — **Audit (adım 2):** `{{#if (and …)}}` userId strip + servis import `{{#if isAdminUser}}` kaldırıldı; `feModalDeleteScopedUserIdFromVar` + paylaşılan `feServiceImportSuffix` (`handlebars-fe-frontend.ts`). Üretilen TSX’te `mode === 'create'` yalnızca başlık/kaydet etiketi (presentational).
    - [x] `templates/frontend/page.hbs` — **Audit (adım 3):** `hasSearchableFields`, `isAdminUser`, `updatable`, `deletable` için tüm `{{#if …}}` kaldırıldı; kararlar `fePage*` helper’larında (`handlebars-fe-frontend.ts`). Üretilen TSX’te `modalMode === 'create'` vb. sayfa içi akış presentational olarak kaldı.
    - [x] `templates/frontend/service.admin.hbs` — **Audit (adım 4):** `hasSearchableFields`, `baseUrl`, ilişki import `isAdminUser` dalları kaldırıldı; `feJoinedApiUrl`, `feServiceGetQueryInterfaceExport`, `feServiceGetQueryListBodyTypeLine`, `{{feServiceImportSuffix true}}` (`handlebars-fe-service-client.ts` + mevcut paylaşılan suffix). İlişki import `#each` yapısı şema listesi için presentational olarak kaldı.
    - [x] `templates/frontend/service.hbs` — **Audit (adım 5):** `hasSearchableFields`, `baseUrl`, ilişki import `isAdminUser` kaldırıldı; `feJoinedApiUrl`, `feServiceGetQueryInterfaceExport` (`isProtectedRoute` + `"withDoc"` JSDoc), `feServiceGetQueryListBodyTypeLine`, `feServiceImportSuffix`.
    - [x] `templates/frontend/thunk.hbs` — **Audit:** `isAdminUser` / `hasSearchableFields` import dalları kaldırıldı; `feServiceImportSuffix`, `feThunkOptionalGetQueryImport` (`handlebars-fe-service-client.ts`).
    - [x] `templates/frontend/slice.hbs` — **Audit:** servis import `{{#if isAdminUser}}` → `feServiceImportSuffix`; update/delete fulfilled gövdesi zaten `feSliceUpdateFulfilledBody` / `feSliceDeleteFulfilledBody` (`sourceType`).
    - [x] `templates/frontend/table-cell.hbs` — **Audit:** Yalnızca `{{feTableCellExpr this}}`; hücre ifadesi tamamen `templateHelpers.ts` içindeki `feTableCellExpr` (tip/relation/uiComponent dalları burada).
    - [x] `templates/frontend/table.hbs` — **Audit:** `hasSearchableFields`, `isAdminUser`, `feTableNeedsAvatar`, `eq filterType`, relation `and` dalları kaldırıldı; `handlebars-fe-table.ts` (`feTableMuiAvatarImportLine`, `feTableTypesImportLine`, `feTablePropsSearchableOptionalLines`, `feTableDestructuringSearchableParams`, `feTableSearchableLogicBlock`, `feTableSearchFiltersSection`). Kolon `#each` yapısı şema listesi için presentational.
  - Bulunan business-logic örnekleri için helper'lar `templateHelpers.ts`, `handlebars-fe-frontend.ts`, `handlebars-fe-service-client.ts`, `handlebars-fe-table.ts` içine eklenir; template'ler sadeleştirilir.
  - **Refactor (Task 56):** `handlebars-fe-frontend.ts` — `fePage*` + `feServiceImportSuffix`; `handlebars-fe-service-client.ts` — servis/thunk URL ve query export; `handlebars-fe-table.ts` — tablo import/props/filtre UI (`registerFeTableTemplateFragments()`, `feTable*` kayıtlarından sonra). `registerHandlebarsHelpers()` sonunda `registerFeTableTemplateFragments()` çağrısı.
  - **Not:** Bu dört dosya + devasa `templateHelpers.ts` birlikte bakım maliyeti yaratıyor; ortak/FE ayrımı, çift kaynakların tekilleştirilmesi ve dosya yapısı için **Task 59**.
- Verification:
  - Frontend template'lerinde `eq type`, `eq sourceType`, ownership/role branching gibi kararlar kalmaz (yalnız minimal presentational koşullar).

Task 57

[x] Mongo (`nodejs-mongoose`): varsayılan timestamps + audit alanları immutable
- Kural: `timestamps` şema seçeneği varsayılan açık; `createdAt`/`updatedAt` explicit path değil; istemci create/update gövdesinde yok; şema meta: readonly + hiddenFromCreate + hiddenFromUpdate; liste/filtre için generator’a eklenir.
- Yapılanlar:
  - `mongoAuditFields.ts`: backend template field listesi + FE `schema.fields` birleştirme.
  - `BackendGenerator`: `mergeMongoAuditBackendTemplateFields`, modelde `hasTimestamps` + `modelFields`’tan `_id`/`createdAt`/`updatedAt` explicit path filtresi.
  - `FrontendGenerator`: `mergeMongoAuditFrontendSchemaFields`; `hasSearchableFields`/`hasSchemaFields` merged `fields` üzerinden.
  - `model.hbs`: interface’de opsiyonel audit satırları; `toJSON` içinde audit silme kaldırıldı (`lean()` ile tutarlı okuma).
  - `types.hbs`: `I*Input` içinde `hiddenFromCreate && hiddenFromUpdate` alanlar yok.
  - `templateHelpers` `feModalEnsureJsonKeys`: `mode` ile create/edit için hidden kuralları.
  - `modal.hbs`: `feModalEnsureJsonKeys`…`mode` geçirilir.
  - `schemaParser`: import edilen timestamp alanlarına aynı bayraklar + `SchemaField` genişletmesi.
  - `base-crud.service.ts`: create/update öncesi `createdAt`/`updatedAt` strip.

Task 58

[x] Admin get-all: audit tarih alanları (`createdAt` / `updatedAt`, date-range) filtresi + admin liste boş durumu UX + tabloda başlangıç/bitiş tarih input’ları
- Uygulandı: `filters.hbs` (UTC gün aralığı, `$gte` / `$lt` exclusive); `filterValueGuard` date-range; `zodFieldScoped` filter + date-range union; `feFilterFieldTsType` / `feTableFilterNormalizeFunction`; `feTableShowInTableColumnCount`; `table.hbs` çift tarih input + boş tablo satırı; `page.hbs` tablo her zaman görünür.

### A) `createdAt` / `updatedAt` ile istek — gözlem ve kök neden

- **Gözlem:** `POST .../admin/get-all` gövdesinde `"createdAt":"2026-04-08"` veya `"updatedAt":"2026-04-08"` gibi düz tarih string’i varken liste boş dönüyor; **aynı alan gönderilmeden** endpoint veriyi döndürüyor (kayıtların o tarihte olduğu doğrulanabiliyor). Davranış **her iki audit alanı için aynıdır**: ikisi de `filterType === "date-range"` ile aynı `filters.hbs` dalından üretilir.
- **Kök neden (üretilen backend):** `src/main/templates/backend/filters.hbs` içinde `filterType === "date-range"` için değer `{ from, to }` objesi **değilse** else dalında şu üretiliyor: `query.<alan> = new Date(filters.<alan>)`. Mongo tarafında bu, ilgili alanda **tek bir an ile tam eşitlik** (örn. `createdAt` veya `updatedAt`: `ISODate('…')`) demek. Kayıtların timestamp’leri gün içinde milisaniye hassasiyetinde olduğu için **neredeyse hiçbir kayıt bu eşitliği sağlamaz**; sonuç doğal olarak boş liste.
- **`{ from, to }` ile aynı gün:** Şablonda `to` için `new Date(dateFilter.to)` kullanılıyor; `"2026-04-08"` için bu genelde **o günün UTC başlangıcı**. `$lte` bu olunca **aynı günün ilerleyen saatleri** aralığın dışında kalabilir; tek günlük filtre bile güvenilir olmayabilir (UTC/lokal gün sınırı politikası netleştirilmeli). Bu da **`createdAt` ve `updatedAt` için ortak**.

**Geçici / hedef istek sözleşmesi (davranış düzeltilene kadar):** Backend şu an ürettiği sorguya göre düz `"YYYY-MM-DD"` string ile (`createdAt` veya `updatedAt` fark etmez) “o güne ait tüm kayıtlar” beklenmemeli. İstenen davranış **takvim günü aralığı** ise gövdede açık aralık kullanılmalı (ör. `from` gün başı, `to` gün sonu — generator düzeltmesinde bunun otomatik yapılması hedeflenir).

**Değişecek dosyalar (Generator repo) — A)**

| Dosya | Ne yapılacak |
| --- | --- |
| `src/main/templates/backend/filters.hbs` | `filterType === "date-range"` bloğunda: **primitive** (string / `YYYY-MM-DD` / date-only ISO) geldiğinde `query.<alan> = new Date(...)` **tek nokta eşitliği** yerine `$gte` + `$lte` veya `$gte` + `$lt` (ertesi gün 00:00) ile **takvim günü** kapsaması. **`{ from, to }`** dalında `to` için `new Date(to)` ile gün başına sıkışmayı gider: `to`’yu **inclusive end-of-day** yap veya politikayı dokümante et (UTC vs local). Bu şablon **tüm `date-range` searchable alanlar** için geçerli (`createdAt`, `updatedAt`, şema tarih alanları). |
| `src/main/utils/templateHelpers.ts` (`zodFieldScoped`) | **İsteğe bağlı / sözleşme netliği:** `mode === 'filter'` ve `filterType === 'date-range'` iken şu an `type === 'date'` → yalnızca `z.union([z.string(), z.date()])`. İstemci `{ from?, to? }` gönderecekse GetAll filter şemasına **obje union** eklenmeli; aksi halde runtime’da şema ile gerçek gövde uyumsuz kalır. |
| `src/main/utils/templateHelpers.ts` (`feTableFilterNormalizeFunction`) | **İsteğe bağlı:** Tablodan gelen `type="date"` tek string, backend düzeltmesi **gün normalize** edecek şekilde yapılırsa çoğu senaryoda dokunulmayabilir. İstemciyi `{ from, to }` göndermeye zorlamak veya trim/format tutarlılığı gerekiyorsa burada `filterType === 'date-range'` için **case** eklenir. |
| `src/main/templates/frontend/table.hbs` | Tek tarih input’u yerine veya yanında **C)** ile çift input (start/end); ayrıntı **C)** tablosunda. |
| `src/main/templates/backend/service.hbs` / `service.admin.hbs` | Genelde **değişmez**: `build*FilterQuery(req.body)` zaten üretilen filtreyi kullanır; mantık `filters.hbs` içinde. |
| Hedef uygulama projesi | Generator düzeltmesinden sonra ilgili entity için **yeniden generate** (veya `filters.ts` el ile senkron) — yoksa üretilmiş projede eski `build*FilterQuery` kalır. |

### B) Boş liste UX — gözlem ve kök neden

- **Gözlem:** Kayıt yokken tam sayfa metin: “No {{entityName}} found. Create one to get started.” Tablo, kolon başlıkları, filtre toolbar veya pagination görünmüyor; kullanıcı **tablo çerçevesi içinde** “veri yok” bekliyor.
- **Kök neden:** `src/main/templates/frontend/page.hbs` içinde `!entity || items.length === 0` iken yalnızca `<Alert>` render ediliyor; **`{{entityName}}Table` hiç mount edilmiyor**.

**Değişecek dosyalar (Generator repo) — B)**

| Dosya | Ne yapılacak |
| --- | --- |
| `src/main/templates/frontend/page.hbs` | Üst başlık + varsa “Add New” butonu **aynı kalır**. Koşulu daralt: tam sayfa `<Alert>` yalnızca **ilk yükleme / hata / `entity` yok** gibi gerçekten tablo gösterilemeyecek durumlarda (isteğe bağlı); **`items.length === 0`** için tabloyu **her zaman** render et (`{{entityName}}Table` + `items={[]}`, `total={0}`, pagination uyumu). Metin: Alert yerine tablo içi empty state veya ince bir `Typography` toolbar altında. |
| `src/main/templates/frontend/table.hbs` | `TableBody` içinde: `items?.length > 0` map’inin yanında **`items.length === 0`** dalında tek `TableRow` + `TableCell colSpan={…}` ile “No rows” / “Henüz kayıt yok” (kolon sayısı = `showInTable` alan sayısı + Actions). Filtre barı ve `TablePagination` **boş listede de** görünür kalmalı (layout tutarlılığı). |
| `src/main/utils/templateHelpers.ts` | **Yalnızca** boş mesajı helper’a taşımak istenirse (Task 56 ile uyum) küçük bir metin helper’ı; zorunlu değil. |

**Not:** Değişiklikler **bu Generator reposundaki `.hbs` / helper’larda** yapılır; üretilmiş frontend/backend dosyaları kullanıcı projesinde regenerate ile güncellenir.

### C) Tablo filtresi: tarih alanları için başlangıç + bitiş (otomatik çift input)

- **Amaç:** `filterType === 'date-range'` (veya generator kararı: `type === 'date'` ve searchable) için kullanıcıdan **iki tarih** alınsın; API gövdesinde tek key altında `{ from?, to? }` gitsin. Tek `YYYY-MM-DD` string yerine aralık sözleşmesi UI ile zorunlu hale gelir; **A)** ile backend gün normalize birlikte kullanıldığında davranış tutarlı olur.
- **UX:** Her ilgili alan için iki `TextField` `type="date"` (veya sonradan `datetime-local`): etiketler örn. “Created from” / “Created to” (`{{label}}` tabanlı). Grid’de iki komşu kolon veya `xs=12 sm=6` ile yan yana; mobilde alt alta.
- **Kısmi dolum:** Yalnız `from` → backend’de yalnız `$gte`; yalnız `to` → yalnız `$lte`/`$lt` (**A)** `filters.hbs` bunu desteklemeli). İkisi de boş → alan gönderilmez / `undefined`.
- **Saat:** İlk aşamada yalnız tarih seçimi → `from`/`to` string’leri backend’de **gün başı / gün sonu** (veya `$lt` ertesi gün) ile normalize edilir; politika **A)** ile aynı dokümanda sabitlenir.

**Değişecek dosyalar (Generator repo) — C)**

| Dosya | Ne yapılacak |
| --- | --- |
| `src/main/templates/frontend/table.hbs` | `{{#each fields}}` / `isSearchable` içinde: `filterType === 'date-range'` **veya** (`type === 'date'` && date-range semantiği) için **tek TextField yerine iki kontrol** (`from` / `to`). `handleFilterChange` yerine veya üzerine: aynı filter key için obje birleştirme — örn. `handleDateRangeChange('createdAt', 'from', value)` → `{ ...filters, createdAt: { ...(filters.createdAt as object), from: x } }`. Reset bu key’i tamamen temizlemeli. |
| `src/main/utils/templateHelpers.ts` (`feTableFilterNormalizeFunction`) | İlgili alan için: boş string’leri çıkar; `{ from, to }` içinde ikisi de yoksa `undefined` dön; tek taraf doluysa `{ from }` veya `{ to }` gönder. |
| `src/main/utils/templateHelpers.ts` (`feTableFilterFieldAttrs`) | Gerekirse date-range için kullanılmıyorsa dokunma; iki alan zaten `type="date"` + `InputLabelProps shrink`. |
| `src/main/utils/templateHelpers.ts` (`zodFieldScoped`, `mode === 'filter'`) | `from` / `to` için opsiyonel string veya `Date`; **`z.object({ from: … .optional(), to: … .optional() }).optional()`** veya uygun `z.union` — GetAll filter şeması gövdedeki objeyi kabul etmeli (**A)** tablosundaki isteğe bağlı madde burada **önerilir / zorunlu**). |
| `src/main/templates/backend/types.hbs` | Liste filtresi tipi zaten `date-range` için union; çift input ile uyumlu olduğundan emin ol (gerekirse yorum / küçük düzeltme). |
| `src/main/templates/frontend/service*.hbs` / üretilen `Get*Query` | `feFilterPropLine` veya eşdeğeri: `date-range` alanı `{ from?, to? }` olarak DTO’da kalmalı. |

**Doğrulama:**

- A) Aynı veri setinde `createdAt` ve `updatedAt` filtreleri tek gün seçildiğinde beklenen kayıtlar dönüyor; timezone politikası dokümante veya test ile sabit.
- B) Kayıt yokken tablo başlıkları ve layout görünür; boş mesaj tablo içindedir.
- C) Tarih searchable alanlarda iki input görünür; yalnız başlangıç, yalnız bitiş ve tam aralık senaryolarında API gövdesi ve liste sonucu beklenenle uyumlu; Reset filtreleri doğru temizler.

Task 59

[x] Handlebars helper mimarisi: paylaşılan çekirdek + tek FE yüzeyi + `templateHelpers` inceltme

### Bağlam

Task 56 sonrası FE şablonları sadeleşti ama helper kodu **dört yerde** dağıldı (`templateHelpers.ts` ~1000+ satır + `handlebars-fe-frontend.ts` + `handlebars-fe-service-client.ts` + `handlebars-fe-table.ts`). İstenen yön: **BE + FE’nin ortak kullandığı** Handlebars yardımcıları net bir çekirdekte; **yalnızca FE’ye özel** olanlar tek yüzeyde; `templateHelpers.ts` ise **path/util export + ince orchestration** ile sınırlı kalsın.

### Uygulanan değişiklikler

- `handlebars-schema-predicates.ts`: `fieldsHaveSearchable`, `hasSearchableRelationFields`, `uppercaseFirstStr` (tek kaynak).
- `handlebars-fe-table.ts`: tablo için hem saf `emitFe*` fonksiyonları hem `registerFeTableTemplateFragments()`.
- `handlebars-fe-helpers.ts`: `registerFrontendHandlebarsHelpers()` — FE Handlebars kayıtlarının tamamı; sıra: shared/page → DTO satırları → `feFilterQueryPropLine` → `registerFeServiceClientHelpers` → modal/slice/tablo çekirdeği → `registerFeTableTemplateFragments`.
- `templateHelpers.ts`: genel + BE helper’lar; sonunda `registerFrontendHandlebarsHelpers()`; `hasSearchableFields` ve `uppercaseFirst` bu predicate/util’e delegasyon.
- `handlebars-fe-table.ts`: `Handlebars.helpers.*` runtime çağrıları kaldırıldı; emitter fonksiyonları ve fragment kayıtları aynı dosyada; predicates doğrudan import.
- `fieldsHaveSearchableFrontend`: geriye dönük uyumluluk için `handlebars-fe-frontend.ts` üzerinden alias.

### Önceki envanter (referans — Task 56 sonrası)

| Konum | Rol |
| --- | --- |
| `templateHelpers.ts` | `getGeneratorRoot`, `getTemplatesDir`, `getProjectRootPath`, `toCamelCase`; `registerHandlebarsHelpers()` içinde genel helper’lar (`eq`, `hasSearchableFields`, `filterValueGuard`, `zodField`, BE populate satırları, …); FE için büyük blok: `FeField` tipi, `feEntityPropLine` … `feSliceDeleteFulfilledBody`, `feTableCellExpr` … `feTableRelationSupportCode`; ara çağrılar: `registerFeSharedTemplateHelpers`, `registerFeEntityPageHelpers`, `registerFeServiceClientHelpers`, `registerFeTableTemplateFragments`. |
| `handlebars-fe-frontend.ts` | `fieldsHaveSearchableFrontend`, `registerFeSharedTemplateHelpers`, `registerFeEntityPageHelpers` (`fePage*`, `feServiceImportSuffix`). |
| `handlebars-fe-service-client.ts` | `joinFeServiceApiPath`, `registerFeServiceClientHelpers` (`feJoinedApiUrl`, GetQuery export/list body/thunk import parçaları); `feFilterQueryPropLine` sonrası kayıt şartı. |
| `handlebars-fe-table.ts` | Tablo fragment kayıtları; `emitSearchFilterField` içinde `Handlebars.helpers.feTableFilterFieldAttrs` vb. **runtime** çağrıları → kayıt sırasına bağımlılık. |

### Analiz — çift kaynak ve benzerlikler

1. **`hasSearchableFields` (Handlebars helper, `templateHelpers.ts`) vs `fieldsHaveSearchableFrontend` (saf TS, `handlebars-fe-frontend.ts`)**  
   Aynı boolean koşul iki yerde; “keep in sync” yorumu var — **tek gerçek kaynak** olmalı (ör. `fieldsHaveSearchable(filters)` export; helper içinde ve FE TS helper’larında yalnızca bu fonksiyon).

2. **`hasSearchableRelationFields`**  
   `templateHelpers.ts` içinde Handlebars helper olarak kayıtlı; `handlebars-fe-table.ts` içinde **aynı mantığın yerel kopyası** (`hasSearchableRelationFields(fields)`). Tekilleştir: ya helper’ı TS’ten çağır ya da ortak modülde tek predicate.

3. **`uppercaseFirst`**  
   `templateHelpers.ts`’te `Handlebars.registerHelper('uppercaseFirst', …)`; `handlebars-fe-table.ts` içinde **yeniden tanımlı** yerel fonksiyon. Tek kaynak: ortak util veya mevcut helper’ın TS export’u.

4. **Tekrarlayan string kalıpları**  
   - Admin servis soneki: `isAdminUser === true ? '.admin' : ''` — `feServiceImportSuffix` ile kısmen çözülmüş; `fePageEntityServiceImportLine`, `feTableTypesImportLine` vb. hâlâ aynı mantığı içeriyor.  
   - `Get${entityName}Query` import/tip eki: `fePageEntityServiceImportLine`, `feTableTypesImportLine`, `feThunkOptionalGetQueryImport`, `feServiceGetQueryListBodyTypeLine` — **ortak küçük builder** (örn. `feOptionalGetQueryImportSuffix(entityName, fields)`, `feServiceTypesImportFragment(...)`) ile tekilleştirilebilir.

5. **`templateHelpers.ts` iç yapısı**  
   `registerHandlebarsHelpers` tek dev fonksiyon; FE modal/tablo/slice mantığı ile BE populate/zod aynı closure’da — **modüler dosyalara bölününce** okunabilirlik ve test edilebilirlik artar.

6. **Bağımlılık / sıra riski**  
   `registerFeServiceClientHelpers` → `feFilterQueryPropLine` sonrası; `registerFeTableTemplateFragments` → diğer `feTable*` sonrası. Refactor’da **tek `registerFrontendHandlebarsHelpers()`** içinde sıra sabitlenmeli veya runtime `Handlebars.helpers` yerine **doğrudan TS fonksiyon import** tercih edilmeli (ör. `emitFeTableFilterFieldAttrs(field)` tablo modülünde import).

### Hedef mimari (öneri)

- **`templateHelpers.ts` (veya `paths.ts`):** Sadece generator path util’leri + `export function registerHandlebarsHelpers()` → sırayla `registerSharedHandlebarsHelpers()`, `registerBackendHandlebarsHelpers()` (isteğe bağlı ayrım), `registerFrontendHandlebarsHelpers()`.
- **`handlebars-shared.ts` (isim örnek):** `eq`, `currentDate`, `hasSearchableFields` (içerde tek predicate), `filterValueGuard`, `schemaRef`, `zodField`, `lookup`, vb. — hem BE hem FE şablonları.
- **`handlebars-fe*.ts` birleşimi:** Tek giriş `registerFrontendHandlebarsHelpers()`; içerik mevcut üç FE dosyasında kalabilir (**alt modül**) veya tek dosyada bölüm başlıklarıyla birleştirilebilir — karar: satır sayısı vs git diff okunabilirliği.
- **Saf fonksiyonlar:** Arama/ilişki predicate’leri ve import satırı üreticileri **Handlebars kaydından ayrı** `.ts` modülünde; helper’lar ince sarmalayıcı olsun.

### Kapsam dışı / dikkat

- Şablon içi business logic geri taşınmayacak (Task 56 doğrulaması korunur).
- `templateEngine.ts`, `modelCreator.ts` import yolu `templateHelpers` kalabilir; iç refactor şeffaf olmalı.

### Doğrulama

- `npm run build` (veya proje script’i).
- Örnek şema ile FE + BE generate smoke; üretilen `service` / `page` / `table` import satırları ve filtre blokları önceki ile diff veya gözden geçirme.
- `.hbs` içinde `hasSearchableFields` kullanımı kalıyorsa helper adı değişmeden **aynı semantik** predicate’e bağlı kalmalı.

Task 60

[x] Relation satırında SELECT ile hedef modele göre populate alan seçimi (sabit User/`name` mantığının kaldırılması)

### Uygulama özeti (2026)

- Şema: `FieldConfig.relationPopulateFields?: string[]` + modal ile seçim; `relationProperty` display için seçilen kümeden.
- IPC: `project:getRelatedModelFields` → `relatedModelFields.ts` (`listMongooseModelFiles` + `parseModelFile` + `entityNameFromModelFileName`).
- BE üretim: `templateHelpers` `bePopulateEntries` önce `relationPopulateFields` birleştirir; yoksa önceki User / `relationProperty` fallback.
- UI: `SchemaDesignPage` diyalog (checkbox + display radio); tabloda populate chip’leri satır başına max 4.

### Bağlam

Bugün `populate.select` üretimi `templateHelpers.ts` içinde **sabit kurallara** bağlı: `relationEntityName === 'user'` veya alan adı `userId` ise sabit string (`email name isActive …`), aksi halde tek alan (`relationProperty` veya `name`). Bu ölçeklenmiyor; kullanıcı hedef modelde hangi alanların populate edileceğini seçebilmeli.

### UI (Schema tasarımı — ilişki satırı)

- İlişki satırındaki **SELECT** aksiyonu: seçilen **hedef model** adına göre (ör. `SymbolTypes`) projede ilgili **model şeması / model dosyasından** alan listesi okunur ve kullanıcıya gösterilir (mevcut **project scanner** veya IPC ile `.model.ts` / şema kaynağı — tek kaynak kararı task içinde netleşsin).
- Kullanıcı listeden **birden fazla alan** seçer; seçilenler üretilen serviste `populate: { path: '<fkField>', select: '<boşlukla ayrılmış veya çoklu path kuralları>' }` ifadesine yansır (mevcut `bePopulateEntries` / `beServicePopulateOptionLine` ile uyumlu **tek string select** kalabilir: seçilen alan adları boşlukla birleştirilir).
- **Display / “name” sütunu:** Şu an tek metin (`relationProperty`). Bunun yerine:
  - Ya **seçilen populate alanlarından biri** “display” olarak işaretlenir (tek seçim),
  - Ya da display alanı seçilen kümenin alt kümesinden seçilir — ürün kararı: minimumda **populate seçimi ile tutarlı** olmalı (tablo/FE’de gösterilen başlık bu alandan geliyorsa senkron).
- **Görünüm:** Seçilen alanlar **Display column** gibi **üstten alta** listelenir (chip veya compact liste); **satır başına en fazla 4** öğe — fazlası wrap ile alt satıra insin (görüntüyü bozmamak için).

### Veri modeli / IPC

- `ModelField` (veya eşdeğeri) üzerinde ilişki için yeni alanlar: örn. `populateSelectFields: string[]` ve `relationDisplayField` yalnızca bu listeden biri olacak şekilde kısıtlanır (veya tek `populateFieldSelection` yapısı).
- Şema kaydedilirken ve generator’a giderken `BackendGenerator.toTemplateFields` / `relationProperty` / `includeRelation` ile **tek doğruluk kaynağı** korunur.

### Generator / şablon

- `templateHelpers.ts` → `bePopulateEntries`: sabit User paketi kaldırılır veya yalnızca geriye dönük fallback olarak kalır; **asıl kaynak** şemadaki seçilen alan listesi.
- Çoklu populate path’i olan modellerde (birden fazla FK) her FK için kendi seçim listesi (zaten `fields` döngüsü ile mümkün).

### Doğrulama

- Hedef model alanları değişince SELECT diyaloğu güncel listeyi gösterir.
- Üretilen `*.service.ts` `getAllPaginated` / `getById` populate satırı seçilen alanlarla eşleşir; display alanı FE tablo ile uyumlu kalır.
- Esnek grid: seçim sayısı > 4 iken satır kırılımı ve dar ekranda taşma yok.


Task 61

[x] Boolean alanlar için liste filtresi: UI + tip + Zod + Mongo sorgusu hizalaması

### Uygulama özeti

- `handlebars-fe-table.ts`: Boolean için **Select** (All / Yes / No), `ft` varsayılanında tip `boolean`; `normalizeFilterValue` boolean kolu yalnızca **primitive boolean** kabul eder (aksi halde `undefined`), string coerce yok; `feTableMuiBooleanFilterImportsLine`.
- `table.hbs`: İlgili MUI importları yalnızca searchable boolean alan varsa eklenir.
- `filters.hbs`: `Boolean(filters.x)` kaldırıldı; boolean dalında doğrudan **`query.<alan> = filters.<alan>`** (gövde Zod ile `boolean`; string parse yok).
- `templateHelpers` Zod filter / `types.hbs`: değiştirilmedi (`z.boolean().optional()`, tip genişletme yok).

### Sorun

- Modelde `isShow` gibi alanlar **gerçek `boolean`**.
- `Get{Entity}Filters` (`types.hbs`) ve `zodField` filter modunda boolean için **`z.boolean().optional()`** üretiliyor.
- Üretilen tablo filtresi (`handlebars-fe-table.ts` → `emitSearchFilterField`) **`filterType === 'boolean'`** için özel dal üretmiyor; relation / date-range dışında her şey **`TextField`** → `onChange` ile **her zaman string** (`e.target.value`).
- Thunk/query normalizasyonundaki boolean `switch` kolu string’i **boolean’a çevirmeden** geçirebiliyor (`return s as any`).
- `filters.hbs` içinde `Boolean(filters.isShow)` kullanımı: **`Boolean("false") === true`** — string filtre değerleriyle yanlış Mongo koşulu riski.

Sonuç: JSON örneğinde `"isShow": true` doğal görünür; form katmanı string üretir; validasyon / runtime davranışı tutarsız.

### Yapılacaklar (dosya / bileşen)

1. **`src/main/utils/handlebars-fe-table.ts` — `emitSearchFilterField`**
   - `filterType === 'boolean'` (veya alan tipi `boolean` + searchable) için **`TextField` yerine** uygun kontrol üret:
     - Öneri: MUI **`Select`** veya **`ToggleButtonGroup`** ile üç durum: **tümü (filtre yok)** / **true** / **false**; state **`boolean | undefined`** (veya `null` ile “yok” semantiği — mevcut `handleFilterChange` ile uyumlu olacak şekilde netleştir).
   - `value` / `onChange`: primitive boolean ile çalışsın; boş seçimde filtreyi **sil** veya `undefined` gönder (backend `filterValueGuard` ile uyumlu).

2. **`src/main/utils/handlebars-fe-table.ts` — `emitFeTableFilterNormalizationSwitch` (boolean `case`)**
   - Gelen değer: `string` | `boolean` | `undefined` olabilir (URL, eski state).
   - Açık eşleme: `'true'` / `'1'` → `true`, `'false'` / `'0'` → `false`, boş → `undefined`; zaten `boolean` ise olduğu gibi dön.
   - **`as any` ile string geçirmeyi bırak.**

3. **`src/main/utils/templateHelpers.ts` — `zodField` (mode `filter`)**
   - **`z.boolean().optional()` korunur**; tip genişletilmez. String yalnızca istemci tarafında (normalize/thunk veya tek bir coerce adımında) **boolean’a çevrilir**, sonra body Zod’a girer.

4. **`src/main/templates/backend/types.hbs` — `Get{{entityName}}Filters`**
   - **Karar: genişletme yok.** Boolean filtre alanları **`boolean | undefined`** (optional property) olarak kalır; `boolean | 'true' | 'false'` gibi birlikler ekstra tip/kod işi yaratır ve gerekmez — doğru kaynak FE’nin primitive boolean göndermesidir.

5. **`src/main/templates/backend/filters.hbs` — `filterType === 'boolean'` kolu**
   - `Boolean(filters.x)` kaldırıldı; **`query.name = filters.name`** — tip sözleşmesi Zod + FE primitive boolean.

6. **`filterValueGuard` (`templateHelpers.ts`)**
   - Boolean için koşul (`!== undefined && !== null`) üç değerli UI ile uyumlu kalsın; **“hayır filtresi” = undefined** net olsun.

7. **İsteğe bağlı — `SchemaDesignPage`**
   - DB tipi `boolean` iken searchable açılınca **`filterType` varsayılanı `boolean`** (BE `BackendGenerator.resolveFilterType` ile zaten uyumlu olabilir; UI’da yanlışlıkla `regex` kalmış projeler için dokümantasyon veya tek seferlik migrate notu).

### Doğrulama

- Generate edilmiş tablo sayfasında boolean filtre: üç durum (hepsi / evet / hayır); istek gövdesinde **`true` / `false` primitive** (tip ve Zod ile uyumlu).
- `isShow === false` filtresi Mongo’da **false** eşitliği üretir; string `"false"` ile **yanlış pozitif** oluşmaz.
- `npm run build`; örnek entity ile FE+BE smoke.


Task 62

[x] Üretilen admin / FE liste tablosu: dar viewport’ta genişlik — yatay sığma ve kaydırma

### Bağlam

- Sorun **Generator uygulamasındaki şema ekranı değil**; hedef projede generate edilen **`{{Entity}}Table`** / liste sayfası.
- Viewport küçülünce tablo genişliği ekrana sığmıyor; içerik taşıyor veya yatay kaydırma beklenen şekilde çalışmıyor.

### Yapılacaklar

1. **`src/main/templates/frontend/table.hbs`** ve gerekiyorsa **`page.hbs`**: `Table` / `TableContainer` / üst `Box` zincirinde `minWidth: 0`, taşıyıcı `width`/`maxWidth`, `overflowX: 'auto'` tutarlılığı; gerekirse tablo için makul `minWidth` + konteynerde yatay scroll (MUI table layout davranışı ile uyumlu).
2. Üretilen sayfanın **layout ana kabı** (`Container`, flex parent): flex çocuklarda **`minWidth: 0`** eksikliği taşmayı engelleyebilir — kontrol et.
3. Küçük breakpoint’te (isteğe bağlı) sütun **`sticky`** / **dense** / aksiyon sütunu sabitleme değerlendirilir; önce yatay scroll doğru çalışmalı.

### Doğrulama

- Geniş kolonlu entity ile generate; tarayıcı genişliği daraltıldığında tablo ya sığar ya da **tek** yatay scrollbar ile kaydırılabilir; sayfa dışına taşma yok.


Task 63

[x] Liste tablosu: `CoreModal` ile aynı mimari — ortak `CoreTable` kabuğu + entity dosyası yalnızca şema / tip odaklı

### Sorun

- Bugün **`src/main/templates/frontend/table.hbs`** her entity için **tam bir tablo bileşeni** üretiyor: `Paper`, `TableContainer`, scrollbar `sx`, pagination, filtre alanları, başlık satırı, gövde, aksiyonlar — hepsi **aynı dosyada** ve her model üretiminde **tekrarlanıyor**.
- **`CoreModal`** tarafında ise kalıp net: `templates/frontend/core.modal.hbs` → hedef projede **bir kez** kullanılan genel kabuk (`Dialog`, başlık, içerik alanı, Cancel/Save); entity dosyası **`modal.hbs`** sadece `I{{Entity}}` / `I{{Entity}}Input` ve alanlara göre form içeriği üretir — `@/components/CoreModal` import edilir (`modal.hbs` satır 4–5 civarı).
- İstenen: liste için **aynı ayrım** — **ana kurallar / layout tek yerde**; generate edilen **`{{Entity}}Table.tsx`** mümkün olduğunca **yalnızca T tipli veri ve şema çıktısı** (kolonlar, hücre ifadesi, filtre state parçaları), **MUI tekrarı değil**.
- **Layout bug (üretilen UI):**
  - Uzun string alanlar (ör. `fcmTokens`, token/id) hücreyi şişiriyor; kolon tek satırda aşırı genişliyor, tablo okunaksız (Users ekranı örneği).
  - Liste sayfasında **başlık satırı** (`{{entityName}} Management` + Add New) ile tablo arasında fazla dikey boşluk (`page.hbs` header `Box` — şu an `mb: { xs: 2, sm: 3, md: 4 }`).
  - Başlık/toolbar `Box` (`MuiBox-root`, `h4` + `MuiButton`) ekran boyutuna göre hizalanmalı; **varsayılan** başlık–tablo aralığı **`1rem`** (responsive ince ayar serbest).

### Referans (mevcut doğru örnek)

| Parça | Şablon | Hedef projede rol |
|--------|--------|-------------------|
| Ortak kabuk | `core.modal.hbs` | `CoreModal` — presentational, entity bilmez |
| Entity özel | `modal.hbs` | `{{Entity}}Modal` — tip + alan mantığı, `CoreModal` children |

### Hedef mimari (tablo)

| Parça | Şablon (öneri) | Hedef projede rol |
|--------|----------------|-------------------|
| Ortak kabuk | **`core.table.hbs`** (yeni) | **`CoreTable`** — `Paper` / `TableContainer` / scroll `sx` / boş satır / `TablePagination` yerleşimi; **tüm `TableCell` için ortak `maxWidth` + overflow**; opsiyonel generic props (`columns`, `renderRow`, `toolbar` slot, pagination props). Entity veya `I*` bilmez; yalnızca UI iskeleti. |
| Entity özel | **`table.hbs`** (inceletilir) | **`{{Entity}}Table`** — `I{{Entity}}[]`, `total`, `page`, filtre state; şemadan üretilen kolon başlıkları + `table-cell` mantığı + searchable blok; **`import CoreTable from '@/components/CoreTable'`** (veya projede `CoreModal` ile aynı kök). |
| Sayfa chrome | **`page.hbs`** | Başlık + Add New `Box` ile tablo arası boşluk; entity tablosunu sarmalayan `flex` alanı (değişmez import yolu). |

### UI / layout kuralları (yeni)

1. **Tablo hücre `maxWidth` (tüm kolonlar)**
   - **Tek sabit üst sınır** tüm entity tablolarında aynı (ör. `280px` — implementasyonda tek constant; Task içinde netleştirilir).
   - `TableHead` + `TableBody` **`TableCell`** (Actions kolonu hariç veya daha dar sabit genişlik): `maxWidth`, `overflow: 'hidden'`, `textOverflow: 'ellipsis'`, `whiteSpace: 'nowrap'` (uzun token/id metinleri taşmaz; tam metin için satır tıklama/tooltip ileride opsiyonel).
   - Uygulama yeri: öncelik **`CoreTable`** (Task 63 kabuğu); gerekirse `table.hbs` / `table-cell` partial ile uyum.
   - Dar ekranda yatay scroll **TableContainer**’da kalır (Task 62); hücre içeriği kolonu şişirmez.

2. **Sayfa başlığı ↔ tablo aralığı (`page.hbs`)**
   - Toolbar `Box` (ör. `UserWatchList Management` + `Add New …` butonu): **`mb` varsayılan `1rem`** (şu anki `mb: { xs: 2, sm: 3, md: 4 }` kaldırılır).
   - Responsive: `display: 'flex'`, `flexDirection: { xs: 'column', sm: 'row' }`, `alignItems`, `gap` mevcut kalıbı korunur; yalnızca **alt margin** default **`1rem`**, çok dar ekranda isteğe bağlı `1.25rem` gibi küçük artış (breakpoint tablosu implementasyonda).
   - Hedef: 2. ekran görüntüsündeki gibi başlık ile tablo/filtre alanı arasında gereksiz boşluk olmaması.

### Yapılacaklar (teknik)

1. **`core.table.hbs` tasarımı**
   - `core.modal.hbs` gibi: tek `{{currentDate}}`, entity/string şema dallanması **yok**; sabit MUI importları ve ortak `sx` (Task 62 ile uyumlu: `minWidth: 0`, yatay scroll tek yerde).
   - **Hücre stili:** export edilebilir `TABLE_CELL_MAX_WIDTH` (ör. `280`) + `tableCellSx` — tüm data/header hücrelerine uygulanır; Actions kolonu sabit dar genişlik.
   - Props: en azından pagination (`count`, `page`, `rowsPerPage`, handlers), children veya `columns`+`renderCell` API’si — entity şablonunun ihtiyacına göre netleştirilir.

2. **Generator (`FrontendGenerator.ts` ve dosya yolu)**
   - `CoreModal` nerede üretiliyorsa aynı strateji: `CoreTable.tsx` **bir kez** yazılır (dosya yoksa veya güncelleme modunda politika net); entity başına **tekrar yazılmaz**.
   - `getFrontendDirs()` / `components` kökü — `CoreModal` ile aynı dizin konvansiyonu (`@/components/CoreTable`).

3. **`table.hbs` sadeleştirme**
   - Kabuk JSX ve tekrarlayan importlar **`CoreTable`**’a taşınır.
   - Kalan: `feTable*` ile üretilen **entity-tipi** parçalar (filtre grid’i, başlık etiketleri döngüsü, `{{> table-cell}}`, `onEdit`/`onDelete` wiring). Amaç: dosya boyutu ve tekrar azalsın; okuyan biri “bu entity’nin tablosu”yu doğrudan görür.

4. **`page.hbs` — başlık toolbar + tablo aralığı**
   - Header `Box` (`Typography h4` + Add New): `mb: '1rem'` default; responsive `flexDirection` / `gap` korunur (yukarıdaki UI kuralları).
   - Tablo sarmalayıcı `Box` (`flex: 1, minHeight: 0`) değişmeden kalabilir; yalnızca üst margin sıkılaştırılır.

5. **Geriye dönük uyumluluk**
   - Eski projelerde zaten üretilmiş şişkin `*Table.tsx` dosyaları: güncelleme modunda merge marker veya “bir kez elle CoreTable’a taşı” notu; mümkünse yeni generate ile kırılmayan import yolu.

### Task 62 ile ilişki

- Dar ekranda taşma / yatay kaydırma düzeltmeleri **`CoreTable`** içinde yapılırsa tüm entity tabloları aynı davranır (Task 62 burada kapanabilir veya Task 62 sadece doğrulama maddesi olarak kalır).

### Doğrulama

- Yeni entity generate: `src/components/CoreTable.tsx` (veya seçilen yol) **tek kopya**; iki farklı entity tablosu aynı `CoreTable`’ı import eder.
- `{{Entity}}Table.tsx` içinde **Paper/TableContainer/TablePagination tekrarı yok** (veya yalnızca ince wrapper).
- `npm run build` hedef projede; liste sayfası çalışır; davranış önceki tablo ile fonksiyonel eşdeğer.
- **Uzun alan:** `fcmTokens` benzeri değer hücrede **ellipsis** ile kesilir; kolon genişliği sabit üst sınıra uyar, tablo layout’u bozulmaz.
- **Sayfa chrome:** `{{Entity}} Management` satırı ile tablo/filtre bandı arası yaklaşık **`1rem`** (fazla boşluk yok); mobilde başlık + buton hâlâ responsive stack.


Task 64

[x] Şema snapshot’ı: workspace kökünde `.generator/manifest.json` — tek dosyada tüm modeller (Kaydet + yalnızca başarılı Generate; overwrite; `.gitignore` otomatik yazımı yok)

### Sorun

- Kullanıcı **Models / şema tasarım** ekranında relation’ları, başlıkları (`label`), `uiComponent`, filtreler, tabloda görünürlük, `includeRelation`, `relationPopulateFields` vb. seçer; ardından **Generate** çalışır.
- Generate bittikten sonra elde **yalnızca üretilmiş kaynak kod** kalır; **hangi seçimle ne üretildiği** (ör. bu alan `Autocomplete` + `manyToOne` ile mi bağlandı, bu başlık neydi) tek dosyada veya raporlanabilir biçimde **persist edilmiyor**.
- Regresyon, ekip içi “bu projeyi kim nasıl üretti?” ve **üretim–şema uyumu** sorularında boşluk oluşuyor.

### Hedef

- **Workspace kökünde** (Generator'da açılan hedef proje / workspace root) **tek dosya:** `.generator/manifest.json` — içinde **tüm modellerin** şema + seçimlerinin **son snapshot'ı** (ör. `models` dizisi veya modele göre map).
- **Kaydet:** her kayıtta manifest **tüm workspace şema state'i ile** yeniden yazılır; **üzerine yazılır** (geçmiş versiyon tutulmaz).
- **Generate:** yalnızca **başarıyla** bittiğinde aynı tek dosya güncellenir; başarısız generate **mevcut `manifest.json`'ı bozmaz** (son başarılı Kaydet / Generate hali kalır).
- Paralel ikinci bir "run history" yapısı yok; manifest yerel snapshot — Generator **hedef repo `.gitignore` dosyasına dokunmaz**.

### Kararlar (kilitle)

| Konu | Karar |
|------|--------|
| Git | Generator `.gitignore` **değiştirmez**; `.generator/` commit’lenmesin istenirse ekip kendi ekler. |
| Geçmiş | **Şimdilik tutulmaz**; her yazışta ilgili dosya **overwrite**. |
| Konum | **Workspace root** + `.generator/manifest.json` — **tek dosya**; model başına ayrı `.json` dosyası **yok**. |
| Zamanlama | **Kaydet** → son hal; **Generate success** → aynı güncelleme. |
| Model ayrımı (dosya içi) | Her kayıt için **workspace'e göre `sourceRelativePath`** (veya eşdeğer benzersiz anahtar) + `entityName` / `fields[]` alanlarında tutulur; aynı class adı farklı path'lerde **dosya içi çakışma olmaz**. |
| UI açılış (öncelik) | **Config yok** → yalnızca modeller diskten; **config var ve model dosyası hâlâ var** → yapı diskten, **label / uiComponent / relation / tablo-filtre** vb. manifest’ten (`fields` `name` ile eşleştirme). |

### İçerik şekli (kabaca)

- `manifestVersion` (ileride migrate).
- `models`: her öğede en az `sourceRelativePath`, `entityName`, `fields[]` (`FieldConfig` uyumlu: `label`, `uiComponent`, relation alanları, `showInTable`, `filterType`, …).
- İsteğe bağlı kök meta: `lastGeneratedAt`, `generatorVersion`, `targets` — **ayrı runs/ klasörü yok**.

### Uygulama açılışı (hydrate önceliği)

- **`manifest.json` yok:** Mevcut akış gibi modeller diskten taranır; UI’da **yalnızca tarama/parse sonucu** görünür (config yok).
- **`manifest.json` var** ve diskte **hâlâ aynı `sourceRelativePath`** ile model dosyası duruyorsa: önce model dosyası okunur (**yapısal doğruluk**: alan listesi, tipler, `required` vb.); ardından manifest’teki ilgili `fields[]` ile **eşleşen alan adları** için UI/config alanları (`label`, `uiComponent`, relation seçimleri, `showInTable`, `filterType`, …) **manifest’ten** gösterilir — yani **config üstün gelir** (son kaydedilen Generator tercihleri).
- **Diskte model yok, manifest’te kayıt var:** O manifest girdisi hydrate’da **kullanılmaz** (hayalet kayıt); isteğe bağlı uyarı veya bir sonraki başarılı Kaydet’te `models` listesinin disk ile reconcile edilmesi.
- **Diskte yeni model, manifest’te yok:** Tamamen tarama sonucu gösterilir; ilk **Kaydet** / **Generate success** ile manifest’e eklenir.

### Yapılacaklar (uygulama — task ayrıntısı)

1. Açılış / proje yükleme: `manifest.json` var mı kontrol; varsa `models`’i indeksle (`sourceRelativePath` anahtarı).
2. Model tarama sonrası **merge**: disk alanı ↔ manifest alanı **`name` (veya kararlaştırılan anahtar)** ile eşleştir; eşleşmeyen yeni disk alanı → varsayılan `FieldConfig`; manifest’te fazla alan → diskte yoksa yok say veya UI’da “silindi” politikası (netleştirilir).
3. Snapshot: mevcut **tüm model şema state** → tek JSON gövdesi (`ProjectTypes` / slice ile uyumlu).
4. **Kaydet** akışı: workspace root + `.generator/manifest.json`; atomik yazma tercih edilir.
5. **Generate** success path'inde aynı tek dosyaya yazım.
6. ~~Hedef `.gitignore` otomatik satırı~~ — **kaldırıldı** (`ensureDotGeneratorGitignore` yok).
7. (İsteğe bağlı) IPC'de dönen yollar; UI'da açma — sonraki iterasyon.

### Doğrulama

- Manifest yok: davranış bugünkü gibi; sadece tarama.
- Manifest + mevcut Product: UI’da Product için **manifest’teki label/relation/ui** görünür; modele yeni alan eklendiyse yeni alan taramadan gelir, manifest’te yoksa varsayılanlarla listelenir (ilk kayıtta manifest tamamlanır).
- Manifest’te Product var ama dosya silinmiş: listede hayalet yok; kayıt temizlenir veya bir sonraki yazımda reconcile.
- Kaydet: `.generator/manifest.json` oluşur/güncellenir; `models` içinde relation ve `label` okunabilir.
- Başarılı generate sonrası: meta alanları (varsa) tutarlı; **başarısız generate** önceki snapshot'ı değiştirmez.
- Aynı entity adı farklı path'lerde: `models` içi anahtarlar **çakışmaz** (`sourceRelativePath` veya eşdeğer).
- Eski projeler: ilk kaydet/generate ile oluşur, kırılmaz.


Task 65

[x] Birleşik özel blok politikası: tüm üretilen dosyalarda aynı altı varsayılan marker + FE/BE aynı merge mantığı

### Varsayılan marker kümesi (tek doğruluk kaynağı)

Aşağıdaki **altı isim** projede “resmi” özel alan sınırlarıdır; kullanıcı istediği dosyada istediğini doldurabilmeli; **dosya türüne göre alt küme yok** (serviste biri var diğerinde yok gibi bir ayrım hedeflenmez):

| Marker | Açılış / kapanış |
|--------|------------------|
| `custom-imports` | `// <custom-imports>` … `// </custom-imports>` |
| `custom-types` | `// <custom-types>` … `// </custom-types>` |
| `custom-methods` | `// <custom-methods>` … `// </custom-methods>` |
| `custom-routes` | `// <custom-routes>` … `// </custom-routes>` |
| `custom-schema` | `// <custom-schema>` … `// </custom-schema>` |
| `custom-tojson-transform` | `// <custom-tojson-transform>` … `// </custom-tojson-transform>` |

**Not:** Köşeli parantezsiz `// custom-types` gibi kullanımlar birleştirici tarafından **tanınmaz**; dokümantasyon ve örneklerde yalnızca yukarıdaki biçim kullanılmalı.

### Mevcut durum analizi (kontrol özeti)

**1) Kod — marker listesi**

- `BackendGenerator.applyUpdateStrategy`: `markerNames` sabit dizisi **tam bu altı isim**; güncellemede tüm backend çıktıları için aynı liste ile `applyCustomBlockMerge` çağrılıyor (`customImportsPrecedence: true`).
- `FrontendGenerator.generateFile`: yalnızca **`modal`** için `applyCustomBlockMerge` ve sadece **`custom-imports`**. `service`, `service.admin`, `slice`, `page`, `table`, `thunk` için **merge yok** → güncellemede dosya baştan yazılırsa elle eklenen bloklar **kaybolur**.

**2) `customBlockMerge` davranışı**

- Her marker adı için dosyada **tam bir** açılış ve **tam bir** kapanış beklenir (`validateMarkerStructure`). Aynı isimle birden fazla çift **geçersiz** sayılır.
- Birleştirme: mevcut dosyadan çıkarılan gövde, **yeni şablondan üretilen içerikteki** aynı isimli çiftlerin arasına yazılır. Yeni şablonda ilgili çift **yoksa** ve eski dosyada dolu blok varsa `mergeCustomBlock` **başarısız** olur (şu anki implementasyon).

**3) Backend şablonları — hangi marker gerçekten var**

| Şablon | Var olan marker’lar | Eksik (altıdan kalan) |
|--------|---------------------|------------------------|
| `model.hbs` | imports, types, tojson-transform, methods | routes, schema |
| `types.hbs` | imports, types (dosya sonu) | methods, routes, schema, tojson-transform |
| `service.hbs` / `service.admin.hbs` | imports, methods | types, routes, schema, tojson-transform |
| `crud.hbs` | imports, methods | types, routes, schema, tojson-transform |
| `filters.hbs` | imports, methods (iç içe) | types, routes, schema, tojson-transform |
| `route.hbs` / `route.admin.hbs` | imports, routes | types, methods, schema, tojson-transform |
| `schema.hbs` | schema | imports, types, methods, routes, tojson-transform |

**4) Frontend şablonları**

| Şablon | Var olan marker |
|--------|-----------------|
| `modal.hbs` | yalnızca `custom-imports` |
| `thunk.hbs` | `custom-methods` **üç kez** (create / update / delete) — mevcut birleştirici ile **tek çift kuralı çakışır**; ayrıca FE’de bu dosya için merge yok. |
| `service.hbs`, `service.admin.hbs`, `slice.hbs`, `page.hbs`, `table.hbs`, `table-cell.hbs`, `core.modal.hbs` | Şu an **marker yok** (JSDoc / açıklama temizliği ayrı konu). |

### Hedef (kullanıcı isteğiyle hizalı)

1. **Tek sabit liste:** `custom-imports`, `custom-types`, `custom-methods`, `custom-routes`, `custom-schema`, `custom-tojson-transform` — mümkünse `BackendGenerator` + `FrontendGenerator` + dokümantasyon için **tek export** (ör. `src/main/utils/customBlockMarkers.ts` veya mevcut `customBlockMerge` yanında sabit).
2. **Her generate edilen dosyada** bu altı çift, **şablonda boş gövdeyle** bulunsun; anlamsız olanlar (ör. `service.ts` içinde `tojson-transform`) dosya sonunda veya uygun “yuva”da **no-op boş blok** olarak dursun; böylece kullanıcı dilediği marker’ı doldurduğunda güncelleme üretiminde **silinmez**.
3. **Frontend güncelleme:** Backend ile aynı pipeline — `read → render → applyCustomBlockMerge` — `service`, `service.admin`, `slice`, `page`, `table`, `modal`, `thunk` (ve varsa `table-cell`, `core.modal`) için; `markerNames` **aynı altılı** + `customImportsPrecedence: true` (backend ile aynı).
4. **Thunk özel durumu:** Aynı dosyada birden fazla `custom-methods` **mevcut validator ile uyumsuz**. Seçenekler: (a) `create` / `update` / `delete` için **isimlendirilmiş** marker’lar (`custom-methods-create` vb.) ve birleştiricide çoklu isim listesi; veya (b) tek `custom-methods` bloğu dosya sonunda; veya (c) birleştiriciyi “aynı isimden dosya başına N çift” destekleyecek şekilde genişletmek. **Task kapsamında karar verilip tek politika yazılmalı.**

### Generator / util — ne değişecek, gereksiz ne kaldırılacak, ortaklaştırma

Repo’da **yalnızca üç generator sınıfı** var: `BackendGenerator`, `FrontendGenerator`, `BaseGenerator` (`src/main/generators/`). Özel blok işi pratikte **iki dosyada** + **bir util**te toplanıyor.

| Dosya | Aksiyon | Gereksiz / kaldırılacak | Ortaklaştırma |
|--------|---------|-------------------------|----------------|
| **`customBlockMerge.ts`** | Dosya başı yorumunu güncelle (yalnız modal değil, tüm artifact’lar). İsteğe bağlı: `skipMarkerIfMissingInRendered` gibi politika burada veya ayrı task’ta. | — | Marker sabitini **burada veya aşağıdaki yeni modülde** tek export yap; merge algoritması zaten tek yerde, **silme / taşıma gerekmez**. |
| **Yeni `customBlockMarkers.ts`** (öneri) | `DEFAULT_CUSTOM_BLOCK_MARKER_NAMES` (readonly dizi) + isteğe bağlı `defaultCustomBlockMergeParams(): Pick<ApplyCustomBlockMergeParams, 'markerNames' \| 'customImportsPrecedence'>` | — | `BackendGenerator` + `FrontendGenerator` içindeki **yinelenen literal dizileri kaldırır**. Alternatif: sabiti doğrudan `customBlockMerge.ts` sonuna export et → ayrı dosya açılmaz. |
| **`BackendGenerator.ts`** | `applyUpdateStrategy` içindeki `markerNames = ['custom-imports', …]` satırını kaldır; shared import kullan. | Tek seferlik **inline altılı dizi** | BE tarafında başka değişiklik yok (akış doğru). |
| **`FrontendGenerator.ts`** | `generateFile`: güncelleme + dosya var iken **modal dışındaki** tüm `templateName` çıktıları için de `applyCustomBlockMerge` (aynı altılı + `customImportsPrecedence: true`). Modal’a özel `markerNames: ['custom-imports']` dalını **kaldır**; tek bir `mergeUpdatedContent(filePath, rendered)` çağrısına indir. | **`templateName === 'modal'` ile kısıtlı merge** (gereksiz ayrık politika) | BE ile aynı parametre seti → shared sabit/import. |
| **`BaseGenerator.ts`** | **İsteğe bağlı:** `protected mergeWithDefaultCustomBlocks(existingPath, rendered): string \| null` (içinde `safeReadFile` + `applyCustomBlockMerge` + shared markers). BE `applyUpdateStrategy` ve FE `generateFile` tekrarını azaltır. | — | FE’de `mergeMarkersIfExisting` / `alwaysRegenerate` yok; bu yüzden ortak method parametreli olmalı (`{ mergeWhenFileExists: boolean }`) veya **sadece sabit paylaşımı** yapıp merge gövdesini iki generator’da bırakmak daha az riskli. |
| **`ipc/backendGenerator.ts`**, **`ipc/frontendGenerator.ts`**, **`main/index.ts`** | Büyük ihtimalle **dokunma**; `updateExistingFiles` zaten iletiliyor. | — | — |
| **`src/main/templates/**`** | Task 65 şablon maddeleri; **generator .ts değil** ama aynı PR’da yapılacaksa burada hatırlatma. | Eski “sadece bazı marker’lar” şablon düzeni | Tüm `.hbs` çıktılarında altı çift + thunk kararı. |

**Özet:** Zorunlu ortaklaştırma = **marker listesi tek kaynak** + **FE’de modal-only merge’in kaldırılıp tam listeye geçmesi**. İsteğe bağlı = **BaseGenerator**’a merge sarmalayıcı taşımak (tekrar azaltır, BE özel bayrakları yüzünden dikkatli tasarım gerekir). **Gereksiz kaldırılan:** FE’deki `['custom-imports']` literali ve modal’a özel dallanma; BE’deki inline altılı dizi.

### Yapılacaklar (uygulama checklist)

1. Ortak `DEFAULT_CUSTOM_BLOCK_MARKERS` (veya eşdeğeri) tanımla; BE/FE merge çağrıları bunu kullansın.
2. Tüm **backend** üretim şablonlarına eksik altı marker çiftini ekle (semantik olmayanlar için dosya sonu “appendix” bloğu kabul edilebilir — tek satır yorumla işaretlenebilir).
3. Tüm **frontend** üretim şablonlarına aynı altı çifti ekle; `thunk` için yukarıdaki çakışma kararını uygula.
4. `FrontendGenerator`: `generateFile` içinde backend’deki gibi **tüm ilgili `templateName`** değerleri için `applyCustomBlockMerge` (modal yalnız imports ile kısıtlı kalmamalı; tam liste).
5. `applyCustomBlockMerge` / `mergeCustomBlock`: İsteğe bağlı iyileştirme — şablonda çift varken eski dosyada marker yoksa mevcut davranış korunur; eski dosyada fazla marker şablonda yoksa hata yerine **politika** (Task 8 ile uyumlu: şimdiki “missing in rendered” = hata) netleştirilir.
6. `analyze/AiRules.md` / `beAnalyze.md` / doğrulama kapıları: “altı marker standart; her artifact şablonda hepsi” ifadesi güncellensin.
7. Test / doğrulama: güncelleme modunda her artifact için en az bir marker’a örnek içerik yazıp yeniden generate → içerik korunur; bozuk çift sayısı → üretim durur veya politika uyarısı.

### Doğrulama

- Yeni entity: üretilen her hedef dosyada grep ile altı `// <…>` açılışı **birer kez** bulunur.
- Mevcut projede her marker’a benzersiz bir satır eklenip güncelleme generate: satırlar **korunur**.
- FE `*.service.ts` üzerinde `custom-types` içi genişletme kaybolmaz (Task 65 öncesi bug kapanır).
- `thunk.ts`: ya tek çift kuralı ihlal edilmez ya da isimlendirilmiş marker stratejisi dokümante ve testlidir.


Task 66

[x] “Model ekle” çıktı yolu: `src/models` yerine **modül merkezli** `src/modules/<module>/` (Backend generate + proje tarama ile aynı)

### Sorun

- UI’dan **yeni model oluştur** (`createModel`) şu an `src/main/ipc/modelCreator.ts` → `findModelsDirectory` ile **önce `src/models`**, sonra kök `models` arıyor; ikisi de yoksa **`src/models` oluşturuyor**.
- Proje taraması (`projectScanner.ts`) Node/Mongoose için modelleri **`src/modules/**`** altında arıyor.
- Backend generate (`BackendGenerator.createArtifactManifest`) çıktıları **`src/modules/<moduleName>/`** altına yazıyor (`moduleName` = normalized **kebab**; dosya tabanı `moduleName` ile uyumlu, örn. `{moduleName}.model.ts`).
- Sonuç: kullanıcı “model ekle” deyince dosya **listede görünmeyebilir** (yanlış klasör) veya **üretilen modül yapısıyla çakışmaz**; tek tip “default yer” yok.

### Hedef

- Yeni Mongoose model dosyası **varsayılan olarak** backend ile aynı yerde: `src/modules/<moduleDir>/` — `<moduleDir>` ve dosya adı kuralları **BackendGenerator ile aynı normalizasyon** (mümkünse ortak util / `namingUtils` veya generator’da kullanılan kebab/camel ile tek kaynak).
- `src/modules` yoksa oluşturulur; modül alt klasörü yoksa oluşturulur.
- **Geriye dönük:** Projede yalnızca eski `src/models` (veya kök `models`) kullanılıyorsa isteğe bağlı tespit sırası: önce `src/modules` var mı → yoksa mevcut `src/models` / `models` ile uyumlu davranış (task içinde net karar: “yalnızca modules” mı, “modules öncelik + legacy fallback” mı).

### Yapılacaklar

1. `findModelsDirectory` / `createModel` (Mongoose) yolunu `BackendGenerator` modül dizini ile hizala; gerekiyorsa `modelData.modelName` → `moduleDir` + `fileName` dönüşümünü paylaşılan fonksiyona taşı.
2. İlk kayıt / tarama sonrası listede yeni modelin göründüğünü doğrula (`scanModulesDirectory` ile uyum).
3. Kısa not: `analyze/beAnalyze.md` veya ilgili “model keşfi” bölümünde “yeni model = modules altı” ifadesi güncellensin (isteğe bağlı).

### Doğrulama

- Boş/temiz backend projesinde model ekle → dosya `src/modules/...` altında; tarama listede görür.
- Aynı isimle tekrar ekleme → mevcut “dosya var” hatası doğru klasörde çalışır.


Task 67

[x] Model düzenleme modalı / `parseModelToModelData`: üretilen şema şablonu (`timestamps: { … }`, `toJSON.transform`, `custom-tojson-transform`) ile parser uyumu

### Sorun

- Üretilen model şablonu (`model.hbs` benzeri) sıklıkla **ikinci Schema argümanında** `timestamps: { createdAt: true, updatedAt: true }`, `versionKey`, `toJSON: { transform: function (doc, ret) { … // <custom-tojson-transform> … } }` içerir.
- `schemaParser.ts` içinde `toJSON` içeriğini ayıklayan regex yaklaşık şu formda: `toJSON\s*:\s*\{[^{}]*transform…` — **`[^{}]*`**, `toJSON` bloğunun başı ile `transform` arasında **herhangi bir `{`/`}`** (ör. `timestamps: { … }` içindeki süslüler) olduğunda **eşleşme başarısız**; `deletedInToJSON` / transform analizi **sessizce bozulur** veya yanlış kalır.
- `modelCreator.ts` → `parseModelToModelData`, ana şema gövdesini bulmak için **`const\s+\w+Schema\s*=…`** ile dosyada **ilk eşleşen** `*Schema` tanımını kullanıyor; dosyada **nested / yardımcı şema** ana export’tan önce tanımlıysa veya isim farklıysa (`MobileAppConfigSchema` vs ilk gelen `FooItemSchema`), modal için **`schemaFieldsContent` / unique / trim** çıkarımı **yanlış veya boş** kalır — kullanıcı “içeriği modal düzgün alamadı” der.
- Özet: **brace-denge** ile zaten okunan `schemaOptions` substring’i varken `toJSON` gövdesi için regex yerine **güvenli ayrıştırma** yok; modal tarafı ana şema **isim çözümlemesi** `parseModelFile` ile paylaşılmıyor.

### Hedef

- `toJSON.transform` gövdesi (ve istenirse `delete obj.*` listesi): **seçenek nesnesi içinde süslü parantez içi iç içe** (`timestamps: { }` dahil) doğru şekilde tolere edilsin; mümkünse `schemaParser`’da ikinci argümanı okuyan **mevcut brace-walker** sonrasında `toJSON` anahtarı için **alt brace-walker** veya küçük bir util (`extractObjectPropertyBalanced(source, 'toJSON')` benzeri).
- `parseModelToModelData`: ana şema bloğunu **`parseModelFile` ile aynı mantık** — `mongoose.model('…', MainSchema)` → `MainSchema` veya dosya + fallback — ile konumlandır; `const\s+\w+Schema` “ilk gelen” kuralı kaldırılsın veya yalnızca doğrulanmış isimle sınırlansın.
- `custom-tojson-transform` marker’ları: transform gövdesi çıkarılırken **yorum satırları korunabilir** veya en azından **parse hatası üretmeden** göz ardı edilir (modal yalnızca alan listesi için kullanıyorsa bile tutarlı davranış).

### Yapılacaklar

1. `schemaParser.ts`: `toJSONPattern` regex’ine bağımlılığı azalt; şema **options** string’i üzerinde brace-balanced `toJSON` değeri çıkarımı + iç içe `function () { … }` için transform gövdesi.
2. `modelCreator.ts` `parseModelToModelData`: şema alan gövdesi başlangıcını `parseModelFile`’ın kullandığı `mainSchemaName` ile hizala (IPC’den isim geçirilebilir veya `schemaParser`’dan küçük bir helper export).
3. Örnek fixture: kullanıcı snippet’i (`timestamps: { createdAt, updatedAt }`, boş `{}` alanlar, `toJSON` + `custom-tojson-transform`) ile birim test veya manuel doğrulama checklist’i.

### Doğrulama

- Verilen örnek `MobileAppConfigSchema` + boş alanlar + `timestamps` nesnesi + `toJSON.transform` içinde marker: **parseModelFile** alanları tutarlı; **parseModelToModelData** modal alanları / unique / trim **yanlış dosya parçasından okumaz**.
- `toJSON` içinde `delete obj.foo` satırları varsa `deletedInToJSON` / audit davranışı beklendiği gibi (mevcut ürün semantiği korunur).


Task 68

[x] Workspace UI kalıcılığı: model değiştirince / proje yeniden açılınca tüm şema + generate tercihlerinin geri yüklenmesi (Task 64 genişletmesi)

### Sorun (kullanıcı gözlemi)

- Schema Designer’da **label**, **sütun adı**, **relation** (`includeRelation`, `relationEntityName`, `relationPopulateFields`, `relationProperty`), **uiComponent**, **showInTable**, **filterType** vb. seçilir; **Generate** çalışır.
- Başka bir modele tıklanıp geri dönüldüğünde veya proje kapatılıp **aynı workspace kökü** tekrar seçildiğinde bu tercihler **sıfırlanır** — yalnızca diskten parse edilen ham alan yapısı kalır.
- **Generate paneli** (`generationMode`, FE/BE dosya checkbox’ları, `isProtectedRoute`, `updateExisting*`, `isAdminUser`, `features.deletable/updatable`, `frontendPath` vb.) `SchemaDesignPage` içinde **local `useState`**; hiç persist edilmiyor; model değişince de proje yeniden açılınca da kaybolur.
- Task 64 (`.generator/manifest.json`) **kısmen** var: Kaydet / başarılı Generate sonrası **tek model** `fields[]` upsert; açılışta parse sırasında manifest satırı varsa hydrate. Eksikler:
  - Kaydetmeden model değiştirme → son düzenlemeler **yazılmaz**.
  - Generate UI tercihleri manifest’te **yok**.
  - Manifest yazımı “tüm workspace state” değil, **yalnızca aktif model** upsert (Task 64 metnindeki tam snapshot henüz değil).
  - Eski `.scaffold/{entity}.schema.json` (Generator kökü, entity adına göre) ile workspace manifest **çift kaynak**; proje bazlı tek doğruluk kaynağı net değil.

### Hedef

- **Tek workspace snapshot** (Task 64 ile aynı dosya: `.generator/manifest.json` veya genişletilmiş şema) — proje kökü seçildiğinde **okunur**, UI buna göre dolar.
- **Model başına kalıcı config:** `fields[]` + relation + tablo/filtre/UI (Task 64 `FieldConfig`); model listesinde A → B → A dönünce **A’nın son kayıtlı hali** geri gelir.
- **Generate / proje tercihleri** de persist (model başına mı workspace geneli mi — aşağıda karar):
  - En az: `frontendPath`, `generationMode`, `isProtectedRoute`, `isAdminUser`, FE/BE **selectedFiles**, `updateExistingFrontend/Backend`, `features` (deletable/updatable).
- **Zamanlama:** açılışta hydrate; değişiklikte yazım politikası net:
  - **Minimum:** Kaydet + başarılı Generate (Task 64 ile uyumlu).
  - **Tercih edilen UX:** model değiştirmeden önce **otomatik stash** (debounced veya `parseModelFile` pending öncesi aktif modeli manifest’e upsert) — kullanıcı “Kaydet” demeden de model geçişinde kayıp olmasın.
- Disk yapısı (alan listesi, tipler) manifest/config ile **merge**; yeni disk alanı → varsayılan; silinen alan → manifest’ten düşür (reconcile).

### Task 64 ile ilişki

| Konu | Task 64 | Task 68 |
|------|---------|---------|
| Konum | `.generator/manifest.json` | Aynı dosya, şema genişletmesi |
| `fields[]` / relation / label | Hedeflendi | Model geçişi + otomatik stash ile **tamamlanır** |
| Generate checkbox’ları | Bahsedilmedi | **Yeni alan** (`generation` / `workspace` bloğu) |
| Yazım | Kaydet + Generate success | + isteğe bağlı model değişiminde otomatik |
| Hydrate | parseModel’de manifest satırı | Proje açılışı + her model seçiminde tutarlı |

### İçerik şekli (öneri — `manifestVersion` 2 migrate)

```json
{
  "manifestVersion": 2,
  "workspace": {
    "frontendPath": "...",
    "generationMode": "fullstack",
    "isProtectedRoute": false,
    "isAdminUser": false,
    "updateExistingFrontendFiles": false,
    "updateExistingBackendFiles": false,
    "selectedFrontendFiles": { "service": true, "thunk": true, "slice": true, "page": true },
    "selectedBackendFiles": { "model": true, "crud": true, ... },
    "features": { "deletable": true, "updatable": true }
  },
  "models": [
    {
      "sourceRelativePath": "src/modules/foo/foo.model.ts",
      "entityName": "Foo",
      "fields": [ /* FieldConfig */ ],
      "generationOverrides": null
    }
  ]
}
```

- **`workspace`:** tüm modeller için varsayılan generate paneli (model `generationOverrides` null ise).
- **`generationOverrides` (opsiyonel):** model bazında farklı generate seçimi gerekiyorsa; yoksa sadece `workspace` yeter.

### Yapılacaklar

1. `manifestSnapshot` / tipler: `workspace` (+ isteğe bağlı `generationOverrides`) ekle; migrate v1 → v2.
2. `SchemaDesignPage`: generate state’i Redux’a taşı **veya** mount/hydrate + save hook’ları manifest ile bağla.
3. Model değişimi (`parseModelFile` öncesi): aktif `selectedModelSchema` + path varsa manifest upsert (auto-stash).
4. Proje kökü seçilip scan bittikten sonra: manifest varsa `workspace` + listedeki modeller için indeks; model tıklanınca merge (Task 64 hydrate).
5. `.scaffold` ile çakışma: workspace manifest **birincil**; `.scaffold` legacy fallback veya kademeli kaldırma (karar dokümante).
6. Task 64 maddesine “kısmi uygulama; tam UX Task 68” notu (isteğe bağlı).

### Doğrulama

- Product’ta label + relation + uiComponent ayarla → Order’a geç → Product’a dön: **ayarlar duruyor** (Kaydet veya auto-stash sonrası).
- Generate panelinde fullstack + belirli checkbox’lar → projeyi kapat, aynı kökü aç, Product seç: **panel aynı**.
- Manifest yok: mevcut davranış; ilk Kaydet / Generate / auto-stash ile oluşur.
- Diskte yeni alan eklenmiş model: manifest’teki diğer alan config’leri korunur, yeni alan varsayılan.


Task 69

[x] Update / Create Model sonrası manifest reconcile — diskteki yeni/silinen alanlar `.generator/manifest.json`’a yansısın (Task 68 boşluğu)

### Sorun

- **Update Model** (model düzenleme modalı) yalnızca `*.model.ts` dosyasını yazar; ardından `scanProjectFiles` çalışır.
- **Manifest `models[]` güncellenmez** — kullanıcı User’a alan ekleyip Update Model dese bile `.generator/manifest.json` eski `fields[]` ile kalır.
- Schema Designer’a gelince `parseModel` + `mergeSchema` yeni alanı **UI’da** gösterir (varsayılan config); manifest diske yazılana kadar (Kaydet / Generate / model stash) **persist edilmez**.
- **Create Model** de aynı: yeni dosya diskte; manifest’te satır yok (ilk Kaydet/Generate/stash’a kadar).

### Hedef

- **Update Model başarılı** → ilgili `sourceRelativePath` için manifest **reconcile**:
  - Güncellenmiş model dosyasını parse et (yapısal alan listesi).
  - Manifest’te aynı path varsa: mevcut `fields[]` ile **`name` eşleştirmesi** — label/relation/ui vb. **korunur**; yeni disk alanı → `enrichFieldWithUIConfig` varsayılanları; diskten silinen alan → manifest’ten düşür.
  - Manifest’te satır yoksa: yeni entry (varsayılan `FieldConfig` ile).
- **Create Model başarılı** → aynı reconcile (yeni path + entity).
- **FE/BE Generate zorunlu değil** bu adım için; manifest yapısal uyum disk değişikliğiyle senkron olsun (UI config sonraki Kaydet/Generate ile zenginleşebilir).
- Yazım: `stash` veya ayrı `reconcile` event — **`lastSavedAt` / `lastGeneratedAt` değiştirmesin** (yalnızca model snapshot güncellensin).

### Task 68 ile ilişki

| Olay | Task 68 (şimdi) | Task 69 |
|------|------------------|---------|
| Update Model | Manifest yok | **Reconcile** |
| Create Model | Manifest yok | **İlk entry** |
| Schema Designer Kaydet/Generate/stash | Var | Aynı kalır |

### Yapılacaklar

1. `manifestSnapshot`: `reconcileModelFromDisk(workspaceRoot, filePath, sourceType?)` — parse + merge manifest fields + upsert (`event: 'reconcile'` veya mevcut `stash` ile aynı timestamp politikası).
2. `modelCreator.ts` `updateModel` / `createModel` success sonrası (veya IPC handler): `projectRoot` + relative path ile reconcile çağrısı.
3. ~~Renderer isteğe bağlı `parseModelFile`~~ → **Task 72**: reconcile şeması IPC + `selectedModelSchema` güncellemesi.
4. `projectRoot` Update/Create akışına iletilmeli (`createModel` zaten `projectPath` alıyor; `updateModel` için `projectRoot` + `filePath` → `toProjectRelativePath`).

### Doğrulama

- User modeline modal ile alan ekle → Update Model → `.generator/manifest.json` içinde User satırında **yeni alan** `fields[]`’de (varsayılan label/ui).
- Mevcut alanların manifest’teki label/relation ayarları **korunur**.
- Modal ile alan sil → Update Model → manifest’ten o alan **düşer**.
- Create Model → manifest’te yeni `sourceRelativePath` satırı oluşur.
- FE/BE generate etmeden manifest okunabilir; Schema Designer açılınca merge tutarlı.


Task 72

[x] Update / Create Model sonrası Schema Designer Field Configuration senkronu (Task 69 manifest boşluğu — UI)

### Sorun

- Task 69: `reconcileModelFromDisk` manifest’i güncelliyor; diskten silinen alan manifest’ten düşüyor.
- **Redux `selectedModelSchema`** Update Model sonrası **yenilenmiyor** — kullanıcı Schema Designer’da eski alan listesini görüyor.

### Hedef

- Update/Create Model başarılı + `projectPath` → reconcile sonrası **birleştirilmiş şema** IPC ile renderer’a dönsün.
- Açık modelin `sourceRelativePath`’i güncellenen dosyayla aynıysa → `selectedModelSchema` anında güncellensin (silinen alan UI’dan kalksın).

### Uygulama

1. `reconcileModelFromDisk` → `schema`, `sourceRelativePath` döndürür.
2. `project:updateModel` / `createModel` handler → reconcile sonucunu response’a ekler.
3. `projectSlice` `updateModel` / `createModel` fulfilled → path eşleşirse `selectedModelSchema` ata.
4. **Manifest disk:** `upsertModels` normalize path + aynı `entityName` eski satırı düşürür; `resolveWorkspaceRootForModelFile` manifest konumunu bulur; reconcile `projectPath` olmasa da çalışır.

### Doğrulama

- Model seçili → Schema Designer → başka sayfada Update Model ile alan sil → Field Configuration’da alan **yok**.
- Mevcut alanların label/relation ayarları korunur.


Task 70

[x] FE tipografi: tüm üretilen UI metinleri `CoreText` + `TypographyScale` ile kurallaştır (servis/thunk/slice hariç)

### Sorun

- Hedef projede tipografi **tek bir scale** ile tanımlı (`TypographyScale`, `TypographyVariant` = `TextVariant/SubVariant`), ekranda metin basan bileşen **`CoreText`** üzerinden gitmeli.
- Generator bugün üretilen FE UI’da **doğrudan MUI `Typography`**, ham string, `<strong>`, ve helper’larda **sarmalanmamış `{item.field}`** kullanıyor — scale dışı, tutarsız font/weight/ellipsis.
- **Kapsam dışı:** `service.hbs`, `thunk.hbs`, `slice.hbs` ve API katmanı — yalnızca **kullanıcıya görünen UI** (sayfa, tablo, modal kabuğu, dialog metinleri, hücre içeriği).

### Referans (hedef projede canonical)

| Dosya | Rol |
|--------|-----|
| `src/components/TypographyScale.ts` | `TypographyScale`, `resolveTypographyStyle`, `TypographyVariant` |
| `src/components/CoreText.tsx` | `CoreText` — `variant`, `component`, `noWrap`, `color`, `sx` (tek tema fontu) |

Import yolu (Varlik360 ile uyumlu):

- `import { CoreText } from '@/components/CoreText'` (veya projede seçilen export stili)
- `import type { TypographyVariant } from '@/components/TypographyScale'`

### Mevcut durum (Generator envanteri)

| Kaynak | Bugünkü metin kalıbı | Hedef |
|--------|----------------------|--------|
| `page.hbs` | `Typography variant='h4' component='h1'` | `CoreText variant='headingMedium/semiBold' component='h1'` |
| `table.hbs` | `<strong>{{label}}</strong>`, `No data to display.` | `CoreText variant='labelBase/semiBold'`, empty state `bodyBase/regular` + `color='text.secondary'` |
| `handlebars-fe-helpers.ts` → `feTableCellExpr` | Ham `{item['field']}`, date `toLocaleString`, array `join`, boolean `Chip` | Skaler metin → `CoreText noWrap variant='bodySmall/regular'`; boolean **Chip kalabilir** (faz 1) |
| `handlebars-fe-frontend.ts` → `fePageDeleteConfirmDialog` | `DialogContent` içinde düz string | `CoreText variant='bodyBase/regular'` |
| `core.modal.hbs` | `DialogTitle` ham `{title}` | `CoreText variant='headingSmall/semiBold' component='span'` (veya DialogTitle içinde) |
| `core.table.hbs` | Pagination MUI default | Faz 1’de dokunma; isteğe bağlı faz 2 |
| Filtre grid (`handlebars-fe-table.ts`) | `TextField label=`, `InputLabel` | **Faz 2** — form kontrol etiketleri MUI input sistemi; ilk fazda zorunlu değil |
| `modal.hbs` | JSON editor / `TextField` | Form alanı; faz 1 dışı (display metin yok) |

**Generator asset’leri:** `core.text.hbs`, `core.typography-scale.hbs` + `ensureCoreTextComponents()` (CoreTable ile aynı overwrite politikası).

### Hedef mimari (CoreModal / CoreTable ile aynı strateji)

| Parça | Şablon (yeni) | Hedef projede rol |
|--------|----------------|-------------------|
| Scale | **`core.typography-scale.hbs`** | `src/components/TypographyScale.ts` — entity bilmez, sabit |
| Metin kabuğu | **`core.text.hbs`** | `src/components/CoreText.tsx` — entity bilmez |
| Entity UI | `page.hbs`, `table.hbs`, helper’lar | Yalnızca `CoreText` + doğru `variant` |

### Variant eşleme tablosu (kilitle — implementasyon)

| UI bağlamı | `TypographyVariant` | Not |
|------------|---------------------|-----|
| Sayfa başlığı (`Management`) | `headingMedium/semiBold` | `component='h1'` |
| Tablo kolon başlığı | `labelBase/semiBold` | Actions dahil |
| Tablo hücre — normal metin | `bodySmall/regular` | `noWrap` |
| Tablo hücre — tüm metin | `bodySmall/regular` + `noWrap` | Aynı varsayılan font (mono yok) |
| Tablo boş durum | `bodyBase/regular` | `color='text.secondary'` |
| Silme onay gövdesi | `bodyBase/regular` | |
| Modal başlık (CoreModal) | `headingSmall/semiBold` | |
| Chip içi Yes/No | — | Faz 1: MUI Chip; faz 2 opsiyonel `CoreText` |

### Yapılacaklar (teknik)

1. **Şablon asset’leri**
   - `src/main/templates/frontend/core.typography-scale.hbs` — kullanıcının verdiği scale (tek kaynak).
   - `src/main/templates/frontend/core.text.hbs` — kullanıcının verdiği `CoreText` (TypographyScale import yolu `@/components/TypographyScale`).

2. **Generator bootstrap (`FrontendGenerator.ts`)**
   - `ensureCoreTextComponents()` (veya tek `ensureSharedUiComponents()`):
     - `TypographyScale.ts` → `src/components/`
     - `CoreText.tsx` → `src/components/`
   - Politika: `CoreTable` ile aynı — dosya yoksa yaz; varsa `updateExistingFiles` ile güncelle.

3. **Şablon / helper güncellemeleri**
   - `page.hbs`: `Typography` import kaldır; `CoreText` import.
   - `table.hbs`: header + empty state → `CoreText`.
   - `feTableCellExpr`: string/number/date/relation display → `CoreText` wrapper; `-` placeholder → `CoreText color='text.disabled'`.
   - `core.modal.hbs`: başlık → `CoreText`.
   - `fePageDeleteConfirmDialog`: gövde → `CoreText`.
   - İsteğe bağlı: `feCoreText(variant, props, children)` Handlebars helper — tekrarlayan JSX’i tek yerde toplar.

4. **Task 63 ile birleşim**
   - Hücre ellipsis: `TableCell` `maxWidth` (CoreTable) + **`CoreText noWrap`** birlikte — metin scale’den, taşma hücre + text’te çift katmanlı.

5. **Kapsam sınırı (bilinçli)**
   - **Dahil:** liste sayfası, entity tablosu, onay dialogu, ortak modal kabuğu.
   - **Hariç (faz 1):** service/thunk/slice; `Button` label metinleri (MUI Button theme); `TablePagination` etiketleri; filtre `TextField` / `Select` label’ları.
   - **Manuel projeler:** Varlik360’ta dosyalar zaten varsa generator skip veya update modu — import yolları hedef projeyle eşleştirilmeli.

6. **Doğrulama / regresyon**
   - Yeni entity FE generate → `CoreText.tsx` + `TypographyScale.ts` tek kopya.
   - Üretilen `*Page.tsx`, `*Table.tsx` içinde **`Typography` importu yok** (grep).
   - Uzun string hücrede ellipsis + scale font boyutu tutarlı.
   - `npm run build` Generator + hedef proje smoke.

### Uygulama sırası (öneri)

1. Asset şablonları + `ensureCoreTextComponents` (risk düşük, bağımsız).
2. `page.hbs` + `core.modal.hbs` (az dosya, görsel kazanım net).
3. `table.hbs` + `feTableCellExpr` (en geniş yüzey, Task 63 ile test).
4. Dialog helper + dokümantasyon; faz 2 için filtre label’ları ayrı alt madde.

### Task 63 / 62 ile ilişki

- Task 62–63 layout/ellipsis **CoreTable + TableCell** katmanında; Task 70 **metin tipografisi** katmanında — birbirini tamamlar, çakışmaz.

### Ortak helper yapısı (Task 71 ile uyumlu)

| Katman | Dosya | Rol |
|--------|--------|-----|
| Ortak emit / variant | **`shared/feTypography.ts`** | `FE_TEXT_VARIANT`, `emitFeCoreTextJsx`, `emitFeCoreTextCellDisplay` |
| Handlebars kayıt | **`handlebars-fe-coretext.ts`** | `feCoreText`, `feCoreTextLiteral` (ince) |
| Şablon asset | `core.text.hbs`, `core.typography-scale.hbs` | Hedef projeye bir kez yazılır |
| Entity şablon | `page.hbs`, `table.hbs` | `CoreText` import + variant; if/else yok |
| Hücre / dialog | `feTableCellExpr`, `fePageDeleteConfirmDialog` | shared emit kullanır |

**Renk:** ikincil metin `color` prop değil → `sx={{ color: 'text.secondary' }}` / `text.disabled` (tema token).

**CoreModal:** `core.modal.hbs` default güncellendi; Varlik360’ta mevcut dosya elle güncellenir (`ensureCoreModal` yok).


Task 71

[x] Mongo `_id` tipi: `mongoose.Types.ObjectId`, required (optional değil); şema/manifest inject `required: true`

### Karar

- `nodejs-mongoose` stack’te **`_id` her zaman** `type: schema` → üretilen BE types’ta **`mongoose.Types.ObjectId`**, property **zorunlu** (`?` yok).
- Manifest / parse / merge inject: `_id` için **`required: true`** default.
- FE `I{{Entity}}`: `_id: string` (JSON); yine **required** (API’den gelen kayıt).
- `I{{Entity}}Input`: `_id` yok (create/update body).

### Dokunulan yerler

- `shared/schemaMerge.ts` — `normalizeMongoIdField`, inject `required: true`
- `schemaParser.ts` — inject + mevcut `_id` normalize
- `BackendGenerator.ts` — `normalizeMongoIdField` on normalized model
- `backend/types.hbs` — ince şablon; dallanma yok
- `handlebars-be-types.ts` — BE `types.hbs` Handlebars kayıtları (ince)
- `shared/schemaFieldTypes.ts` — **ortak** PK / TS tip / emit mantığı (BE + FE + `getType`)
- `handlebars-fe-helpers.ts` — `_id: string` (required)

### `types.hbs` sadeleştirme (helper yüzeyi)

Şablonda **`sourceType` / `_id` / `id` if–else yok**; mantık **`shared/schemaFieldTypes.ts`** (ortak), Handlebars kaydı **`handlebars-be-types.ts`**:

| Helper | Rol |
|--------|-----|
| `beTypesMongooseImportLine` | `import mongoose …` yalnızca mongo veya `schema` alanı varsa |
| `beTypesEntityPropLine` | Entity alan satırı (`getType` eşdeğeri) |
| `beTypesEntitySyntheticPrimaryKeyLine` | Fields’ta PK yoksa: **mongo → `_id: mongoose.Types.ObjectId`**, diğer stack → **`id?: string`** |
| `beTypesInputPropLines` | Input DTO satırları; PK (`_id` / `id`) ve ownership `userId` skip |

`resolvePrimaryKeyFieldName(sourceType)`: `nodejs-mongoose` → `_id`, aksi → `id`.

### Doğrulama

- BE generate → `IUser { _id: mongoose.Types.ObjectId; ... }` (optional yok)
- Schema Designer’da `_id` satırı **Required: Yes**
- Regenerate sonrası eski `_id?: string` kalkar

