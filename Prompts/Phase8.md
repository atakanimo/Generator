# Phase 8: Frontend Generator (Service, Thunk, Slice, Page) & Injection

**Context:** We are building the React Frontend scaffolding based on a specific Enterprise Architecture.
**Goal:** Generate Service, Thunk, Slice, and Page files. Crucially, INJECT references into `store/index.ts` and `routes/routes.ts` without breaking existing code.

**Constraint:**
* **Static File:** Assume `src/services/api.ts` exists (do not generate it).
* **Conflict Rule:** If a Slice or Thunk file already exists, **DO NOT OVERWRITE**. Return a warning: "File exists, skipped."
* **Icon:** Use `Circle` from `@mui/icons-material` for new routes.

**Tasks:**

1.  **Frontend Templates (`src/main/templates/frontend`):**
    * Create Handlebars templates. **All start with the Auto-Generated Header.**
    * **`service.hbs`:**
        * Import `API` from `@/services/api`.
        * Methods: `create`, `update`, `delete`, `getAll`, `getById`.
        * Pattern: `return API({ url: '{{EntityName}}', method: 'POST', data });`
    * **`thunk.hbs`:**
        * Import `createAsyncThunk`.
        * Import generated Services.
        * Create async thunks for CRUD. Handle `try/catch` returning `error`.
    * **`slice.hbs`:**
        * Use `createSlice`.
        * **No local loading/error states.**
        * Handle `extraReducers`.
        * Export Selector: `export const {{EntityName}}State = (state: RootState) => state.{{camelEntityName}};`
    * **`page.hbs`:**
        * A full React Component (`index.tsx`).
        * Use `useAppDispatch`, `useAppSelector`.
        * Implement `useEffect` to fetch data.
        * Implement `unwrap()` logic for actions: `const { isSuccess } = await dispatch(...).unwrap();`

2.  **Injector Utilities (`src/main/utils/injector.ts`):**
    * Implement robust string manipulation functions.
    * **`injectRoute`:**
        * Read `src/routes/routes.ts`.
        * **Import:** Add `import {{EntityName}} from '@/pages/{{EntityName}}';` and `import { Circle } from '@mui/icons-material';` (if missing) at the top.
        * **Array Injection:**
            * Regex to find the `ProtectedRoutes` array.
            * Regex to find the last `id: (\d+)`. Increment it.
            * Insert the new object `{ id: X, text: '{{camelEntityName}}', path: '/{{camelEntityName}}', element: {{EntityName}}, icon: Circle, isProtected: true }` before the closing `];`.
    * **`injectReducer`:**
        * Read `src/store/index.ts`.
        * **Import:** Add `import { {{EntityName}}Slice } from './slices/{{EntityName}}Slicer';`.
        * **Combine:** Find `combineReducers({` and insert `{{camelEntityName}}: {{EntityName}}Slice.reducer,` inside.

3.  **Main Process Logic (`src/main/ipc/frontendGenerator.ts`):**
    * Handler: `project:generateFrontend`.
    * **Steps:**
        1.  **Check Exists:** Check if `src/store/slices/{{EntityName}}Slicer.ts` exists. If yes, stop Slice/Thunk generation and warn.
        2.  **Generate Files:**
            * `src/services/{{camelEntityName}}.services.ts`
            * `src/store/thunks/{{camelEntityName}}Thunks.ts`
            * `src/store/slices/{{EntityName}}Slicer.ts`
            * `src/pages/{{EntityName}}/index.tsx`
        3.  **Run Injection:** Call `injectRoute` and `injectReducer`.

**Outcome:**
1. I generate 'Customer'.
2. Files are created in `services`, `store`, `pages`.
3. `routes.ts` is modified: 'Customer' route is added with the next ID and Circle icon.
4. `store/index.ts` is modified: 'customer' reducer is registered.