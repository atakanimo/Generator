# PROJECT TASKS & CONTEXT LOG

## Project Overview

**Generator**: Electron-based code generator for Node.js/React full-stack applications

- **Backend**: Generates Express routes, services, types (Mongoose/TypeORM/.NET EF support)
- **Frontend**: Generates React components, Redux slices/thunks, services, pages, modals
- **UI**: Schema designer with field configuration (labels, UI components, visibility toggles)

---

## [2024-12-XX] - Phase 7: Backend Code Generation

**Status:** [DONE]

**Task:** Implement backend code generation (Routes, Services, Types) with middleware support and response utilities

**Implementation Details:**

- Created `backendGenerator.ts` IPC handler
- Templates created:
  - `route.hbs`: Express routes with CRUD endpoints
  - `service.hbs`: Service layer with try-catch, SuccessResponse/ErrorResponse
  - `types.hbs`: TypeScript interfaces and DTOs
  - `response.hbs`: Response utility (AtaResponse, SuccessResponse, ErrorResponse, InternalServerErrorResponse, ErrorCodes)
- **Update Operation:** Changed from `PUT /:id` to `POST /update/:id` (user requirement)
- **Service Methods:** Renamed `findAll` → `getAll`, `findById` → `getById`
- **Response Handling:** All routes use `AtaResponse(res, result)` instead of direct `res.status().json()`
- **Service Error Handling:** All methods wrapped in try-catch, return `InternalServerErrorResponse` on error, `ErrorResponse('Entity not found', 'NOT_FOUND')` for not found cases
- **Auto-generation:** If Node.js selected, automatically creates `src/utils/response.ts` from template if it doesn't exist
- **Path Handling:** Implemented `getProjectRootPath()` to correctly identify project root when subdirectories like `src/models` or `src` are selected

**AI Context:**

- Backend services use Mongoose models (assumed pattern: `EntityNameModel.find()`, `EntityNameModel.findById()`, etc.)
- Response utilities follow a standardized pattern with `isSuccess`, `data`, `errorMessage`, `errorCode`
- Protected routes use `authMiddleware` when `isProtectedRoute` is true
- All generated files include auto-generated header with timestamp

---

## [2024-12-XX] - Phase 8: Frontend Code Generation

**Status:** [DONE]

**Task:** Implement frontend code generation (Services, Thunks, Slices, Pages, Table Components, Modal)

**Implementation Details:**

- Created `frontendGenerator.ts` IPC handler
- Templates created:
  - `service.hbs`: API service with CRUD methods using `API()` helper
  - `thunk.hbs`: Redux async thunks (fetchList, fetchById, create, update, delete)
  - `slice.hbs`: Redux slice with extraReducers for all thunks
  - `page.hbs`: React page component with modal state management
  - `table.hbs`: Reusable table component (refactored from original TablePage)
  - `modal.hbs`: Modal component for create/edit with form fields
- **Component Architecture:** Table is now a reusable component, Page uses Table component
- **Modal Implementation:**
  - Create/Edit modes supported
  - Form fields generated based on `showInForm` flag
  - All UI component types supported (TextField, TextArea, NumberField, Switch, DatePicker, Select, MultiSelect)
  - DatePicker uses `@mui/x-date-pickers` with LocalizationProvider
- **State Management:** Page component manages modal open/close, selected item, delete confirmation
- **File Protection:** Slice file existence check prevents overwriting (critical check)

**AI Context:**

- Frontend uses Redux Toolkit pattern
- Services assume `API()` helper exists in `@/services/api`
- Table component receives `onEdit` and `onDelete` callbacks
- Modal form uses controlled inputs with `formData` state
- After save, list is automatically refreshed

---

## [2024-12-XX] - Schema Parser Enhancements

**Status:** [DONE]

**Task:** Improve schema parser to handle nested schemas and filter non-model files

**Implementation Details:**

- **Nested Schema Support:**
  - Added `nestedSchemas?: SchemaDefinition[]` to `SchemaDefinition` interface
  - Created `parseNestedSchema()` function to parse nested schema definitions
  - Main schema parsing now identifies and excludes nested schemas from main fields
  - UI displays nested schemas in separate sections below main schema
- **File Filtering:**
  - Enhanced `isModelFile()` to exclude files containing "mapping", "helper", or "util" in filename
  - Updated `scanDirectory()` to filter out non-model files during scanning
  - Prevents files like `yahooMapping.ts` from appearing in schema designer
- **Field Parsing Improvements:**
  - Better handling of `Schema.Types.ObjectId` with `ref:` (marked as type 'schema')
  - Improved detection of nested schema arrays: `items: { type: [PortfolioSnapshotItemSchema] }`
  - More robust `required` field detection using regex pattern `/required\s*:\s*(true|1)/i`
  - Field parsing now extracts field boundaries correctly to avoid nested schema field contamination

**AI Context:**

- Nested schemas are read-only in UI (no UI config merging)
- Main schema fields can reference nested schemas (e.g., `items: [PortfolioSnapshotItemSchema]`)
- Schema parser identifies main schema by finding `mongoose.model` export
- Nested schema fields are displayed for reference only, not for configuration

---

## [2024-12-XX] - Path Handling Fix

**Status:** [DONE]

**Task:** Fix path handling when user selects subdirectories like `src/models` or `src`

**Implementation Details:**

- Created `getProjectRootPath()` function in both `backendGenerator.ts` and `frontendGenerator.ts`
- Logic:
  - If path contains `/src/`, returns path up to `/src/`
  - If path ends with `/src`, returns parent directory
  - Otherwise returns path as-is
- Ensures generated files go to existing `src` directory, not creating new nested `src/src` directories

**AI Context:**

- Critical for monorepo or nested project structures
- Must handle both Unix (`/`) and Windows (`\`) path separators
- Path normalization happens before directory creation

---

## [2024-12-XX] - UI Enhancements: Backend Settings & Generation Mode

**Status:** [DONE]

**Task:** Add Backend Settings section with protected route toggle and generation mode selection

**Implementation Details:**

- Added "Backend Settings" section in `SchemaDesignPage.tsx`
- **Protected Route Toggle:** `isProtectedRoute` state controls whether routes require authentication
- **Generation Mode:** Radio buttons for "Frontend Only", "Backend Only", "Full Stack"
- **Frontend Path Selection:**
  - When "Frontend Only" or "Full Stack" selected, shows frontend path selection field
  - Uses `setFrontendPath` action to store frontend project path separately from backend path
  - Frontend path is used in `generateFrontend` thunk (falls back to backend path if not set)
- Updated `handleGenerateCode` to dispatch appropriate generators based on mode

**AI Context:**

- Backend and frontend can be in different project directories
- `frontendPath` stored in Redux state separately from `projectPath`
- Generation mode determines which generators are called
- Protected route setting only affects backend generation

---

## [2024-12-XX] - UI Enhancements: Schema Designer

**Status:** [DONE]

**Task:** Improve schema designer UI with better field configuration and nested schema display

**Implementation Details:**

- **Table Scroll:** Added horizontal scroll to table containers with `maxWidth: '100%', overflowX: 'auto'`
- **Column Widths:** Set minimum widths for Label and UI Component columns (150px)
- **Nested Schema Display:**
  - Shows nested schemas in separate Paper components below main schema
  - Nested schema table shows: Field Name, DB Type, Required, Array (no UI config)
- **Field Configuration:**
  - Label field: Editable, used in generated table headers and form labels
  - UI Component: Dropdown with options (TextField, TextArea, NumberField, Switch, Select, DatePicker, MultiSelect)
  - In Table: Toggle to show/hide field in generated table
  - In Form: Toggle to show/hide field in generated modal form
  - Required: Display only (from schema)
  - Array: Display only (from schema)

**AI Context:**

- `showInTable` controls table column visibility
- `showInForm` controls modal form field visibility
- Label is auto-generated from field name using `formatLabel()` but can be customized
- Nested schemas are informational only (no configuration)

---

## [2024-12-XX] - Project Select Page Updates

**Status:** [DONE]

**Task:** Update project selection page title and add logging

**Implementation Details:**

- Changed page title from "Project Source Selection" to "Backend Project"
- Added console log for selected project path in `handleBrowseFolder`
- Added console log in main process `dialog:openDirectory` handler

**AI Context:**

- Clarifies that this page is for backend project selection
- Frontend project selection happens in Schema Designer when needed

---

## [2024-12-XX] - Config Manager: Schema JSON Storage

**Status:** [DONE]

**Task:** Schema configuration JSON files stored in Generator project's `.scaffold` folder

**Implementation Details:**

- Config files stored at: `{GeneratorRoot}/.scaffold/{EntityName}.schema.json`
- `getGeneratorRoot()` finds Generator project root by searching for `package.json`
- `ensureConfigDir()` creates `.scaffold` directory if it doesn't exist
- Config files contain full `SchemaDefinition` with UI configurations

**AI Context:**

- Config files are per-entity, not per-project
- Files are stored in Generator app directory, not in user's project
- This allows schema configs to persist across different project selections

---

## Technical Architecture Notes

### File Structure

```
src/
├── main/           # Electron main process
│   ├── ipc/        # IPC handlers
│   │   ├── backendGenerator.ts
│   │   ├── frontendGenerator.ts
│   │   ├── schemaParser.ts
│   │   ├── projectScanner.ts
│   │   └── configManager.ts
│   └── templates/  # Handlebars templates
│       ├── backend/
│       └── frontend/
└── renderer/       # React frontend
    ├── pages/
    ├── features/
    └── store/
```

### Key Patterns

- **IPC Communication:** All file operations go through Electron IPC
- **Template Engine:** Handlebars.js for code generation
- **State Management:** Redux Toolkit with async thunks
- **Path Handling:** Always normalize and detect project root correctly
- **Error Handling:** Try-catch in all service methods, standardized responses

### Important Considerations

- **Slice Protection:** Never overwrite existing slice files (critical check)
- **Path Normalization:** Always handle both Unix and Windows paths
- **Schema Merging:** Code schema merged with saved config to preserve UI settings
- **Nested Schemas:** Parsed separately, displayed for reference only
- **Response Utilities:** Auto-generated if missing, standardized across backend

---

## Current Status

- ✅ Backend generation (Routes, Services, Types, Response utilities)
- ✅ Frontend generation (Services, Thunks, Slices, Pages, Tables, Modals)
- ✅ Schema parser with nested schema support
- ✅ UI with field configuration and generation mode
- ✅ Path handling for nested directories
- ✅ Frontend/Backend path separation
- ✅ Protected route support
- ✅ File filtering (mapping, helper, util files excluded)

## [2024-12-XX] - Frontend Path Handling Verification

**Status:** [DONE]

**Task:** Verify and document frontend path handling for correct directory structure

**Implementation Details:**

- **Path Handling:** `getProjectRootPath()` correctly identifies project root from various path selections:
  - `/path/to/frontend/src` → `/path/to/frontend`
  - `/path/to/frontend/src/services` → `/path/to/frontend`
  - `/path/to/frontend/src/store` → `/path/to/frontend`
  - `/path/to/frontend` → `/path/to/frontend` (no src, assume root)
- **Directory Structure:** Files are generated in correct locations:
  - Services: `{projectRoot}/src/services/`
  - Thunks: `{projectRoot}/src/store/thunks/` ✅
  - Slices: `{projectRoot}/src/store/slices/` ✅
  - Pages: `{projectRoot}/src/pages/{EntityName}/`
  - Components: `{projectRoot}/src/components/`
- **Path Normalization:** Handles both Unix (`/`) and Windows (`\`) path separators

**AI Context:**

- Frontend path can be different from backend path (stored separately in Redux)
- `getProjectRootPath()` ensures files are always written to existing `src` directory structure
- Thunks and slices are correctly placed in `store` subdirectory (not directly in `src/store`)
- All directories are created recursively if they don't exist

---

## [2024-12-XX] - Frontend Generation: File Existence Handling

**Status:** [DONE]

**Task:** Change all file existence checks from blocking errors to warnings, continue generation for all files

**Implementation Details:**

- **Previous Behavior:** If any file exists (especially slice), generation stopped with error
- **New Behavior:** If any file exists, add warning and skip that file, continue with remaining files
- **All Files Checked:**
  - Service file: `${camelEntityName}.services.ts`
  - Thunk file: `${camelEntityName}Thunks.ts`
  - Slice file: `${entityName}Slicer.ts`
  - Table component: `${entityName}Table.tsx`
  - Modal component: `${entityName}Modal.tsx`
  - Page file: `index.tsx`
- Each file check adds warning if exists, skips generation, continues to next file
- Generation completes for all non-existing files

**AI Context:**

- Allows incremental generation - user can generate missing files even if some already exist
- Prevents accidental overwriting of existing files
- Warning messages: "{FileType} file already exists, skipped: {path}"
- Generation always completes (unless template files are missing)

---

## [2024-12-XX] - Frontend Thunk: Catch Block Simplification

**Status:** [DONE]

**Task:** Simplify catch blocks in thunk template to return error directly

**Implementation Details:**

- **Previous Behavior:** `catch (error) { return rejectWithValue(error instanceof Error ? error.message : 'Failed to...'); }`
- **New Behavior:** `catch (error: any) { return error; }`
- Applied to all thunk functions:
  - `fetch{{entityName}}List`
  - `fetch{{entityName}}ById`
  - `create{{entityName}}`
  - `update{{entityName}}`
  - `delete{{entityName}}`
- Error is now returned directly without formatting or wrapping

**AI Context:**

- Simpler error handling - error object is passed through as-is
- Service layer errors are expected to be in correct format already
- No need for error message formatting in thunk layer

---

## [2024-12-XX] - File Naming Convention: Lowercase with Dots

**Status:** [DONE]

**Task:** Change all generated file names to lowercase camelCase with dot notation (e.g., `user.slice.ts`, `user.thunk.ts`)

**Implementation Details:**

- **Frontend Files:**
  - Slice: `${entityName}Slicer.ts` → `${camelEntityName}.slice.ts`
  - Thunk: `${camelEntityName}Thunks.ts` → `${camelEntityName}.thunk.ts`
  - Service: `${camelEntityName}.services.ts` → `${camelEntityName}.service.ts`
  - Table: `${entityName}Table.tsx` → `${camelEntityName}.table.tsx`
  - Modal: `${entityName}Modal.tsx` → `${camelEntityName}.modal.tsx`
  - Page: `index.tsx` (unchanged, in `${camelEntityName}/` folder)
- **Backend Files:** (already correct)
  - Route: `${entityNameLower}.routes.ts` ✅
  - Service: `${entityNameLower}.service.ts` ✅
  - Types: `${entityNameLower}.types.ts` ✅
- **Template Updates:**
  - All import statements updated to use new file names
  - Service imports: `{{entityNameLower}}.services` → `{{camelEntityName}}.service`
  - Thunk imports: `{{camelEntityName}}Thunks` → `{{camelEntityName}}.thunk`
  - Slice imports: `{{entityName}}Slicer` → `{{camelEntityName}}.slice`
  - Component imports: `{{entityName}}Table` → `{{camelEntityName}}.table`
  - Service variable names: `{{entityNameLower}}Service` → `{{camelEntityName}}Service`
- **Injector Updates:**
  - Slice import: `from './slices/${entityName}Slicer'` → `from './slices/${camelEntityName}.slice'`
  - Reducer reference: `${entityName}Slicer.reducer` → `${camelEntityName}Reducer` (default import)
  - Page import: `from '@/pages/${entityName}'` → `from '@/pages/${camelEntityName}'`

**AI Context:**

- All files now follow consistent naming: `{camelCaseEntityName}.{type}.{ext}`
- Frontend uses camelCase for all file names
- Backend uses lowercase for all file names (already correct)
- Import statements match new file names
- Injector functions updated to use new naming convention

---

## Next Steps / Pending

- [ ] Form template generation (if needed beyond modal)
- [ ] Additional UI component types (if needed)
- [ ] Validation rules in schema config
- [ ] Multi-select options configuration
- [ ] Select dropdown options configuration

---

## [2024-12-04 01:15] - Frontend Features & Component Fixes

**Status:** [DONE]

**Task:**

- Fixed DatePicker slotProps placeholder replacement in modal template
- Changed table component naming from `{{camelEntityName}}.table.tsx` to `{{entityName}}Table.tsx`
- Changed modal component naming from `{{camelEntityName}}.modal.tsx` to `{{entityName}}Modal.tsx`
- Fixed injectReducer comma handling for store/index.ts
- Clarified UI: "Table Features" are for controlling buttons in table (delete/update), Page is always generated regardless of features
- Fixed route injection: Changed import from `@/pages/${camelEntityName}` to `@/pages/${entityName}` to match directory structure
- Fixed route format: Multi-line format with proper indentation
- **CRITICAL FIX**: Changed features logic from `=== true || === undefined` to `!== false`. Now features default to `true` (enabled) unless explicitly set to `false`. Added console.log for debugging.
- **Route injection fixes**:
  - Fixed regex to match `RouteObject[]` not just `RouteType[]` (using `\w+\[\]`)
  - Fixed Circle import logic - simplified and now correctly adds to existing MUI imports or creates new one
  - Fixed comma handling - checks last route, adds comma if needed, new route without trailing comma
- **Thunk template fix**: Changed `async (_) => {` to `async () => {` for thunks without parameters (fetchList). Also removed trailing commas from parameter lists.
- **Backend route fix**: Changed GET endpoint from `router.get('/')` to `router.get('/get-all')` to match frontend service URL format (`/get-all`)
- **Frontend service fix**: Changed `getAll` URL from `{{baseUrl}}/{{entityNameLower}}` to `{{baseUrl}}/{{entityNameLower}}/get-all`
- **Base URL parsing improvements**:
  - Enhanced `parseBaseUrlFromBackend` to extract full base path (e.g., `/api/assety` instead of just `/api`)
  - Added double `/api` detection and removal
  - Added user input field for base URL in UI (Frontend/Full Stack modes)
  - User-provided baseUrl takes priority over auto-detected value
- **Null safety fixes**:
  - Added null check in page template: `!{{camelEntityName}} || {{camelEntityName}}.items.length === 0`
  - Added optional chaining in table template: `items?.length > 0 && items.map(...)`
- **Backend response file location**: Changed from `src/utils/response.ts` to `src/models/Response.model.ts`
  - Updated import paths in route and service templates: `../utils/response` → `../models/Response.model`
  - File is only created if it doesn't exist (no overwrite)
- **Backend model import fix**: Changed from default import `{{entityName}}Model from '../models/{{entityNameLower}}.model'` to named import `{ {{entityName}} } from '../models/{{entityName}}.model'` (PascalCase entity name)
  - Updated all model references: `{{entityName}}Model.find()` → `{{entityName}}.find()`
- **Backend delete function naming**: Changed from `delete(id: string)` to `delete{{entityName}}(id: string)` to avoid TypeScript reserved keyword conflict
  - Updated route template to call `delete{{entityName}}` instead of `delete`
- Removed try-catch blocks from page component (component-level try-catch not allowed per rules)
- Fixed features (updatable/deletable) conditional prop passing in page template
- Fixed table component to always show buttons when props are passed (removed Handlebars conditionals from table, kept in page)

**AI Context/Comment:**

- **Component-level try-catch rule**: Component seviyesinde try-catch kullanılmamalı. Error handling thunk'larda yapılmalı.
- **Features logic**: `onEdit` ve `onDelete` prop'ları her zaman geçiriliyor (features kontrolü kaldırıldı). Table component'inde `onEdit &&` ve `onDelete &&` kontrolü var, prop yoksa button'lar render edilmez. Modal sadece `updatable` true ise render ediliyor. Dialog sadece `deletable` true ise render ediliyor. "Add New" button sadece `updatable` true ise gösteriliyor.
- **DatePicker slotProps fix**: Handlebars `{{` karakterini kendi syntax'ı olarak algıladığı için `slotProps={{...}}` çalışmıyordu. Çözüm: Template'de `slotProps=___DATEPICKER_SLOTPROPS_START___` (= ile) placeholder kullanıldı. `frontendGenerator.ts`'de string replace ile bunlar `{{`, `}}`, `{`, `}` olarak değiştiriliyor.
- **Component naming**: Tüm .tsx component dosyaları PascalCase ile kaydediliyor: `UserTable.tsx`, `UserModal.tsx`, `UserPage.tsx`. Import path'leri buna göre güncellendi.
- **Store injection fix**: Brace counting algoritması ile doğru `}` bulunuyor. `trimEnd()` ile trailing whitespace kaldırılıyor, son reducer'a virgül ekleniyor, yeni reducer doğru indentation ile ekleniyor.
- **Features boolean fix**: Default değerler `true` olacak şekilde `features?.deletable !== false` kullanıldı. Bu sayede features undefined, empty object veya explicitly true olduğunda özellikler aktif, sadece explicitly false olduğunda pasif olur.

---

## [2024-12-04 02:57] - baseUrl Parameter Fix

**Status:** [DONE]

**Task:** Fix "baseUrl is not defined" error in preload script

**Implementation Details:**

- **CRITICAL FIX**: Added missing `baseUrl` parameter to `generateFrontend` function signature in `preload/index.ts`
  - Function signature was missing `baseUrl?: string` parameter
  - Line 148 was trying to use `baseUrl` but it wasn't in the function parameters
  - Added `baseUrl?: string` as the 6th parameter in the function signature (line 140)
  - This ensures `baseUrl` is properly passed from renderer to main process via IPC
- **Added extensive console logging** for `baseUrl` throughout the entire chain:
  - `SchemaDesignPage.tsx`: Logs baseUrl state before dispatch
  - `projectSlice.ts`: Logs baseUrl in Redux thunk before IPC call
  - `main/index.ts`: Logs baseUrl in IPC handler when received
  - `frontendGenerator.ts`: Logs baseUrl processing, final value, template data, and generated code preview
  - All logs include type checking and JSON stringified values for debugging
- **Auto-parse baseUrl from backend project**:
  - Added new IPC handler `project:parseBaseUrl` that parses baseUrl from backend's `src/index.ts` (or similar files)
  - Exported `parseBaseUrlFromBackend` function from `frontendGenerator.ts` for reuse
  - Added `parseBaseUrl` method to ElectronAPI interface and preload script
  - Added `useEffect` in `SchemaDesignPage.tsx` that automatically parses baseUrl when:
    - `projectPath` changes (backend project selected)
    - `sourceType` is Node.js (mongoose or typeorm)
  - baseUrl is now automatically populated in the UI input field when backend project is selected/scanned
  - User can still manually override the auto-parsed value

**AI Context/Comment:**

- The error "baseUrl is not defined" was occurring because the preload script was trying to reference `baseUrl` without it being a function parameter
- The `baseUrl` parameter was already being passed from `projectSlice.ts` and `SchemaDesignPage.tsx`, but the preload bridge wasn't accepting it
- Now the full chain works: UI → Redux → Preload → IPC → Main Process → Generator

---

## [2024-12-XX] - Types File Location & Schema Type Support

**Status:** [DONE]

**Task:** Move types files to `src/types` directory and add support for schema type fields with mongoose.Types.ObjectId

**Implementation Details:**

- **Types File Location:**
  - Changed types file location from `src/services/` to `src/types/` directory
  - Updated `backendGenerator.ts` to create `src/types` directory if it doesn't exist
  - Updated `service.hbs` template import path: `'./{{entityNameLower}}.types'` → `'../types/{{entityNameLower}}.types'`
- **Platform-Specific ID Fields:**
  - Added `sourceType` to template data in `backendGenerator.ts`
  - Updated `types.hbs` template to conditionally add ID field based on `sourceType`:
    - MongoDB (`nodejs-mongoose`, `nodejs-typeorm`): `_id?: string;`
    - .NET (`dotnet-ef`): `id?: string;`
  - Removed duplicate `_id` and `id` fields - now only one is added based on platform
- **Schema Type Support:**
  - Added Handlebars helpers:
    - `getType`: Returns `mongoose.Types.ObjectId` for type `'schema'`, otherwise returns type as-is
    - `hasSchemaType`: Checks if any field has type `'schema'`
  - Updated `types.hbs` template:
    - Conditionally adds `import mongoose from 'mongoose';` if any field has type `'schema'`
    - Uses `getType` helper for all field types in both `I{{entityName}}` and `I{{entityName}}Input` interfaces
    - Schema type fields (e.g., `userId`, `symbol`) now generate as `mongoose.Types.ObjectId` instead of `string`
- **Route Endpoint Update:**
  - Changed POST create endpoint from `router.post('/', ...)` to `router.post('/create', ...)`
  - Updated comment to reflect new path: `/api/{{entityNameLower}}/create`

**AI Context/Comment:**

- Schema type fields are detected by schema parser when field contains `Schema.Types.ObjectId` with `ref:` or nested schema arrays
- Types files are now properly organized in dedicated `types` directory, separate from services
- Platform-specific ID fields ensure correct type generation for MongoDB vs .NET projects
- Schema type fields automatically get correct mongoose type without manual intervention

---

## [2024-12-05] - Logging System & Code Quality Improvements

**Status:** [DONE]

**Task:** Implement comprehensive logging system and replace all console.log with logger, fix conditional injection logic

**Implementation Details:**

- **Logging System:**
  - Created `src/main/utils/logger.ts` with logging utilities
  - Logs directory: `{GeneratorRoot}/logs/` (auto-created)
  - Log files: `YYYY-MM-DD.log` format (one file per day)
  - Log functions:
    - `logGenerate(fileName, filePath, error?)`: Logs generate operations with timestamp
    - `log(message, level)`: General logging with levels (info, error, warn)
  - All logs include timestamp in `[HH:MM:SS]` format
- **Console.log Removal:**
  - Removed all `console.log` and `console.error` from main process code
  - Replaced with `log()` function calls that write to log files
  - Removed unnecessary debug logs (baseUrl processing details, template data dumps, etc.)
  - Kept only essential logs (generation start/completion, errors, warnings)
  - Files updated:
    - `frontendGenerator.ts`: All console.log → log()
    - `backendGenerator.ts`: All console.log → log()
    - `injector.ts`: All console.log → log()
    - `index.ts`: All console.error → log(..., 'error')
    - `projectScanner.ts`: Removed console.error
- **Conditional Injection Logic Fix:**
  - **CRITICAL FIX**: Changed route injection condition from `selectedFiles?.page !== false` to `selectedFiles?.page === true`
  - **CRITICAL FIX**: Changed reducer injection condition from `selectedFiles?.slice !== false` to `selectedFiles?.slice === true`
  - Now injections only happen when files are explicitly selected (true), not when undefined
  - Prevents unwanted route/reducer injections when user doesn't select page/slice
- **Frontend Service Template Fixes:**
  - **Schema Type → String Conversion:**
    - Added `eq` Handlebars helper to frontend generator
    - Updated `service.hbs` template to convert `type === "schema"` to `string` in TypeScript interfaces
    - Schema fields now generate as `string` instead of `schema` type
    - Works for both single fields and arrays: `string` or `string[]`
  - **Platform-Specific ID Fields:**
    - Added `sourceType` parameter to `generateFrontend` function
    - Updated service template to conditionally generate ID fields:
      - MongoDB (`nodejs-mongoose`): Only `_id?: string;`
      - .NET (`dotnet-ef`): Only `id?: string;`
      - TypeORM (`nodejs-typeorm`): Only `id?: string;`
      - Undefined: Both `_id` and `id` (backward compatibility)
    - Updated IPC chain: `index.ts` → `preload/index.ts` → `projectSlice.ts` → `SchemaDesignPage.tsx`
    - `sourceType` is passed from UI through entire chain to generator
    - **ID Usage in Generated Code:**
      - Fixed all `(item.id || item._id)` patterns to use platform-specific ID:
        - `slice.hbs`: Update and Delete reducers now use `_id` for MongoDB, `id` for .NET/TypeORM
        - `page.hbs`: `handleDelete` and `handleSave` now use platform-specific ID
        - `table.hbs`: Table row keys now use platform-specific ID
        - `modal.hbs`: Relation data handling now uses platform-specific ID
      - All ID comparisons and operations are now type-safe and platform-appropriate
- **Searchable Fields Feature:**
  - Added `isSearchable` field to `SchemaField` and `FieldConfig` interfaces (default: `true`)
  - UI: Field Configuration table now includes "Searchable" column with toggle switch
  - Backend: `Get{EntityName}Query` interface generated (only includes searchable fields)
  - Backend: `CreateFilters` function generated in service (MongoDB query builder for searchable fields)
  - Backend: `getAll` function now accepts filters parameter
  - Backend: Route changed from GET to POST for `/get-all` endpoint (filters in body)
  - Frontend: `Get{EntityName}Query` interface in service
  - Frontend: `getAll` function accepts optional filters parameter
  - Frontend: Table component includes search input fields (only for searchable fields)
  - Frontend: Search and Reset buttons added to table
  - Frontend: Page component manages filter state and passes to table
  - Frontend: Thunk updated to accept filters parameter
  - Enter key support in search inputs
  - Delete operation now refreshes list with current filters
- **MongoDB Timestamp Fields (createdAt/updatedAt):**
  - **Schema Parser Enhancement:**
    - Schema parser now parses schema options (second parameter of `new Schema()`)
    - Detects `timestamps: true` in schema options
    - Parses `toJSON.transform` function to detect deleted fields
    - Extracts all `delete obj.fieldName;` statements from transform function
    - Commented delete statements are ignored (only active deletes are detected)
    - If `timestamps: true` and field is NOT in `deletedInToJSON` array, adds to fields array
    - Example: If `delete obj.updatedAt;` exists in toJSON, `updatedAt` is NOT added to fields
  - **Template Updates:**
    - Table component conditionally shows `createdAt` and `updatedAt` columns (only if in parsed schema)
    - Backend types conditionally include `createdAt` and `updatedAt` (only if in parsed schema)
    - Frontend service types conditionally include `createdAt` and `updatedAt` (only if in parsed schema)
    - Backend service uses conditional sort: `sort({ createdAt: 1 })` if exists, otherwise `sort({ _id: 1 })`
    - Uses `hasField` Handlebars helper (added to both frontend and backend generators) to check field existence
    - Timestamps are formatted using `toLocaleString()` for display in table
- **Frontend Search Feature:**
  - Search input fields added to table component (only for searchable fields)
  - Grid layout with responsive design (md={4} for inputs, md={3} for buttons)
  - Search button triggers API call with current filters
  - Reset button clears all filters and refreshes list with empty filters
  - Enter key support in search inputs (triggers search on Enter)
  - Filter state managed in page component (`useState<Get{EntityName}Query>`)
  - Delete operation refreshes list with current filters preserved
  - Initial load uses empty filters (shows all records)
- **Modal Relation Data Fix:**
  - Relation modal TextField value now uses platform-specific ID
  - Placeholder `__RELATION_DATA_ID_{{name}}__` replaced in post-processing based on `sourceType`
  - MongoDB: `userIdRelationData?._id`
  - .NET/TypeORM: `userIdRelationData?.id`
  - Removed `||` fallback pattern for relation data ID
- **Frontend Service Date Type Fix:**
  - Fixed `ITransactionInput` interface: `date` type now correctly converts to `Date` (capital D)
  - Added `{{else if (eq type "date")}}Date{{else}}` check in `ITransactionInput` template
  - Both `I{{entityName}}` and `I{{entityName}}Input` now correctly handle date types
- **Table Component Fixes:**
  - Removed duplicate `createdAt`/`updatedAt` columns (previously added both from fields loop and conditionally)
  - Removed conditional `createdAt`/`updatedAt` additions - now only from fields array
  - Reset button color changed to red (`color="error"`)
  - `createdAt` and `updatedAt` now only appear if `showInTable: true` in fields array
- **Automatic \_id Field Addition:**
  - Schema parser now automatically adds `_id` field for `nodejs-mongoose` projects
  - `_id` field added with: `showInTable: true`, `showInForm: true`, `isSearchable: true`, `label: 'ID'`
  - `sourceType` parameter added to `parseModelFile` function
  - `sourceType` passed through IPC chain: frontend -> preload -> main -> schemaParser
  - `_id` appears in field configuration table and is automatically included in generated types and tables
- **Default Field Configuration:**
  - `showInForm` default changed to `true` for all fields (previously used `shouldShowInForm` function)
  - `isSearchable` default already `true` for all fields
  - Both defaults apply to new fields and fields without saved config
  - Users can still override these defaults in the UI
- **Template Fixes:**
  - Fixed Handlebars parse errors in `modal.hbs`:
    - Changed `open={{{name}}RelationModalOpen}` to `open={{{name}}RelationModalOpen}` (removed triple braces)
    - Changed `value={{{name}}RelationData` to `value={{{name}}RelationData` (removed triple braces)
    - Fixed JSX object literals: `sx={{ mb: 2 }}` → `sx=\{{ mb: 2 }}` (escaped braces)
    - Fixed `InputProps={{` → `InputProps=\{{` (escaped braces - double braces, not triple)
    - Fixed `InputLabelProps=\{{{` → `InputLabelProps=\{{` in `table.hbs` (escaped braces - double braces, not triple)
    - **CRITICAL: DatePicker slotProps format** (DO NOT CHANGE):
      ```handlebars
      slotProps=\{{ textField: { fullWidth: true, required: field.required, margin: 'normal' as const, }, }}
      ```
      This format correctly parses in Handlebars. The escaped opening brace `\{` followed by `{{` allows Handlebars to treat the inner braces as literal JSX syntax.
    - **IMPORTANT: Never use triple braces `{{{` in JSX props** - Always use double braces `{{` with escaped opening brace `\{` for JSX object literals

**AI Context/Comment:**

- Logging system provides audit trail of all generation operations
- Log files are stored in Generator project root, not user's project
- All logs include timestamps and operation details (file name, path, errors)
- Conditional injection fix ensures user has full control over what gets injected
- Schema type conversion ensures TypeScript interfaces are valid (no `schema` type)
- Platform-specific ID fields match backend conventions (MongoDB uses `_id`, .NET uses `id`)
- Handlebars triple braces (`{{{`) cause parse errors in JSX context, must use double braces (`{{`) with proper escaping
- Schema parser now intelligently handles MongoDB timestamps by parsing schema options and toJSON transform
- Searchable fields feature enables dynamic filtering on frontend with proper backend query building
- All `||` fallback patterns removed from ID comparisons - now strictly platform-specific
- CoreModal component pattern improves code reusability and reduces Handlebars parsing issues
- Date type handling: `date` (lowercase) in schema parser converts to `Date` (capital D) in TypeScript interfaces
- Field configuration defaults: `showInForm: true` and `isSearchable: true` for better developer experience
- Automatic `_id` field addition for MongoDB projects ensures consistency across generated code

---

## [2024-12-05] - Backend Search: String Includes & Modal ID Field Exclusion

**Status:** [DONE]

**Task:** Implement string includes search in backend and exclude ID fields from modal forms

**Implementation Details:**

- **Backend String Search Enhancement:**
  - Updated `CreateFilters` function in `service.hbs` template
  - String type fields now use MongoDB regex for "includes" search: `{ $regex: filters.{{name}}, $options: 'i' }`
  - Case-insensitive search enabled with `$options: 'i'`
  - Number, date, and schema fields still use exact equality matching
  - Example: Searching "john" in a string field will match "John", "johnny", "Johnson", etc.
- **Modal ID Field Exclusion:**
  - **Form Rendering:**
    - Added `sourceType`-based conditional filtering in `modal.hbs` template
    - MongoDB (`nodejs-mongoose`): `{{#unless (eq name "_id")}}` - excludes `_id` from form
    - .NET/TypeORM: `{{#unless (eq name "id")}}` - excludes `id` from form
    - ID fields are not rendered in form fields even if `showInForm: true`
  - **Form Data Initialization:**
    - Updated `useEffect` in modal template to exclude ID fields from `initialData`
    - MongoDB: Excludes `_id` when populating form from item data
    - .NET/TypeORM: Excludes `id` when populating form from item data
  - **Form Submission:**
    - Updated `handleSubmit` to remove ID field from `formData` before saving
    - MongoDB: `const { _id, ...dataToSave } = formData;`
    - .NET/TypeORM: `const { id, ...dataToSave } = formData;`
    - Prevents ID fields from being sent in create/update requests
- **Import Path Standardization:**
  - Backend route template: Changed `import { authMiddleware } from '../middlewares/auth';` to `import { authMiddleware } from '../../middlewares';`
  - Backend service template: Changed `import { {{entityName}} } from '../models/{{entityName}}.model';` to `import { {{entityName}} } from '../models';`

**AI Context/Comment:**

- String search now works like JavaScript `includes()` - partial matches with case-insensitive search
- ID fields should never be editable in forms (they are auto-generated by database)
- ID fields are still visible in tables (for reference) but not in modal forms
- Platform-specific ID exclusion ensures correct behavior for MongoDB vs .NET projects
- Import path standardization improves code consistency and maintainability
- **IMPORTANT**: Always check `sourceType` before deciding which ID field to exclude (`_id` vs `id`)

---

## [2024-12-05] - Conditional Component Generation Based on Page Selection

**Status:** [DONE]

**Task:** Only generate CoreModal, Table, and Modal components when page is selected

**Implementation Details:**

- **Conditional Component Generation:**
  - **Table Component (`{entityName}Table.tsx`):**
    - Only generated when `selectedFiles?.page !== false`
    - If `selectedFiles?.page === false`, table generation is skipped
    - Table component is only needed when page component exists
  - **CoreModal Component (`CoreModal.tsx`):**
    - Only generated when `selectedFiles?.page !== false`
    - If `selectedFiles?.page === false`, CoreModal generation is skipped
    - CoreModal is used by Modal component, which is only needed with page
  - **Modal Component (`{entityName}Modal.tsx`):**
    - Only generated when `selectedFiles?.page !== false`
    - If `selectedFiles?.page === false`, modal generation is skipped
    - Modal component is only used by page component
- **Logic:**
  - `selectedFiles?.page === false` → Table, CoreModal, and Modal are NOT generated
  - `selectedFiles?.page === true` or `undefined` → Table, CoreModal, and Modal are generated (existing behavior)
- **Code Changes:**
  - Added conditional checks in `frontendGenerator.ts`:
    - Table generation wrapped in `if (selectedFiles?.page === false) { /* skip */ } else { /* generate */ }`
    - CoreModal generation wrapped in `if (selectedFiles?.page === false) { /* skip */ } else { /* generate */ }`
    - Modal generation wrapped in `if (selectedFiles?.page === false) { /* skip */ } else { /* generate */ }`

**AI Context/Comment:**

- These components (Table, CoreModal, Modal) are only used by the page component
- If user doesn't want to generate page, they also don't need these components
- This prevents unnecessary file generation when only service/thunk/slice are needed
- Components are still generated if page is explicitly selected (`true`) or not specified (`undefined`)

---

## [2024-12-05] - Protected Routes: userId from Middleware

**Status:** [DONE]

**Task:** For protected routes, extract `userId` from middleware (`BaseRequestAuthenticated`) and pass it to service functions as a parameter, instead of accepting it from the request body.

**Implementation Details:**

- **Route Template (`route.hbs`):**
  - Added `BaseRequestAuthenticated` import when `isProtectedRoute` is true
  - Import paths: `import { authMiddleware } from '../middlewares';` and `import { BaseRequestAuthenticated } from '../interfaces';`
  - Updated `/get-all`, `/create`, and `/update/:id` endpoints to:
    - Extract `userId` from `authenticatedReq.userId` (from middleware)
    - Pass `userId` as a parameter to service functions (only if `userId` field exists in schema)
  - Pattern used:
    ```typescript
    const authenticatedReq = req as BaseRequestAuthenticated<any>;
    const userId = authenticatedReq.userId;
    const result = await service.getAll(req.body, userId);
    ```
- **Service Template (`service.hbs`):**
  - Updated `getAll` function:
    - Added optional `userId?: string` parameter (only if protected route and `userId` field exists)
    - Automatically filters by `userId` in MongoDB query when provided
    - Uses `mongoose.Types.ObjectId(userId)` to convert string to ObjectId
  - Updated `create` function:
    - Added optional `userId?: string` parameter (only if protected route and `userId` field exists)
    - Automatically adds `userId` to the data object before creating
    - Removes `userId` from input DTO (handled by types template)
  - Updated `update` function:
    - Added optional `userId?: string` parameter (only if protected route and `userId` field exists)
    - Removes `userId` from update data (prevents users from changing their userId)
    - Uses `findOneAndUpdate({ _id: id, userId: new mongoose.Types.ObjectId(userId) }, ...)` instead of `findByIdAndUpdate`
    - Ensures users can only update their own records (both `_id` and `userId` must match)
    - No explicit `userId` validation needed (middleware already handles authentication)
  - Added conditional `mongoose` import when protected route has `userId` field (even if no searchable fields)
- **Types Template (`types.hbs`):**
  - Updated `I{{entityName}}Input` interface:
    - Excludes `userId` field when `isProtectedRoute` is `true`
    - `userId` is no longer part of the input DTO for protected routes
    - Pattern: `{{#if (eq ../isProtectedRoute true)}}{{#if (eq name "userId")}}{{else}}...{{/if}}{{else}}...{{/if}}`
- **Conditional Logic:**
  - All changes are conditional based on:
    - `isProtectedRoute === true`
    - `hasField(fields, "userId") === true`
  - If route is not protected or `userId` field doesn't exist, behavior remains unchanged

**AI Context/Comment:**

- Protected routes use `authMiddleware` which sets `userId` on the request object
- `BaseRequestAuthenticated` interface extends Express Request with `userId` property
- This ensures `userId` is always taken from the authenticated user, not from request body
- Prevents security issues where users could potentially modify their `userId` in create/update requests
- `getAll` automatically filters by authenticated user's `userId`, ensuring users only see their own data
- `update` operation explicitly prevents `userId` modification for security

**Frontend Updates:**

- **Frontend Generator (`frontendGenerator.ts`):**
  - Added `isProtectedRoute?: boolean` parameter to `generateFrontend` function
  - Added `isProtectedRoute` to `templateData` object
- **Preload (`preload/index.ts`):**
  - Updated `generateFrontend` function signature to include `isProtectedRoute?: boolean` parameter
- **IPC Handler (`index.ts`):**
  - Updated `project:generateFrontend` handler to accept and pass `isProtectedRoute` parameter
- **Frontend Service Template (`service.hbs`):**
  - Updated `I{{entityName}}Input` interface to exclude `userId` field when `isProtectedRoute` is `true`
  - Pattern: `{{#if (eq ../isProtectedRoute true)}}{{#if (eq name "userId")}}{{else}}...{{/if}}{{else}}...{{/if}}`
- **Frontend Modal Template (`modal.hbs`):**
  - Updated `initialData` population to exclude `userId` field when `isProtectedRoute` is `true`
  - Updated `handleSubmit` to remove `userId` from `dataToSave` when `isProtectedRoute` is `true`
  - Updated field rendering to exclude `userId` field from form when `isProtectedRoute` is `true`
- **Redux Slice (`projectSlice.ts`):**
  - Updated `generateFrontend` thunk to accept `isProtectedRoute?: boolean` parameter
  - Passes `isProtectedRoute` to IPC call
- **UI Component (`SchemaDesignPage.tsx`):**
  - Updated `generateFrontend` dispatch to include `isProtectedRoute` (only when `generationMode === 'fullstack'`)

**AI Context/Comment:**

- Frontend service interfaces now match backend: `userId` is excluded from input DTOs for protected routes
- Modal forms no longer show or accept `userId` input for protected routes
- Frontend and backend are now synchronized: both exclude `userId` from input when route is protected
