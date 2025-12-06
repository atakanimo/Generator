# Phase 7: Backend Generator (Routes, Services & Types)

**Context:** We have the UI generator working. Now we need to generate Node.js Backend code (CRUD operations) based on the schema.
**Goal:** Generate `Route`, `Service`, and `Type` files with specific middleware logic.

**Tasks:**

1.  **Templates (`src/main/templates/backend`):**
    * Create 3 new Handlebars templates. **ALL must start with the Auto-Generated Header & Timestamp.**
    * **`route.hbs`:**
        * **Imports:** Import the controller/service.
        * **Auth Logic:** If `{{isProtectedRoute}}` is true:
            * Add import: `import { authMiddleware } from '../middlewares/auth';` (Adjust path as needed).
            * Add usage: `router.use(authMiddleware);` BEFORE defining the endpoints.
        * **Endpoints:** Define GET, POST, PUT, DELETE endpoints mapping to the service.
    * **`service.hbs`:**
        * Implement standard CRUD methods: `create`, `findAll`, `findById`, `update`, `delete`.
        * Use the defined types.
    * **`types.hbs`:**
        * Export an interface `I{{EntityName}}` based on the schema fields.
        * Export a Data Transfer Object (DTO) type `I{{EntityName}}Input`.

2.  **UI Updates (`SchemaDesignPage.tsx` or Generate Dialog):**
    * Add a **"Backend Settings"** section.
    * **Toggle:** `isProtectedRoute` (Checkbox). Label: "Requires Authentication?".
    * **Button:** Update generation flow to support "Frontend Only", "Backend Only", or "Full Stack".

3.  **Main Process Logic (`src/main/ipc/backendGenerator.ts`):**
    * Create IPC handler `project:generateBackend`.
    * Input: `{ schema, projectPath, isProtectedRoute }`.
    * **Folder Resolution:**
        * Ensure `src/routes` and `src/services` exist.
    * **File Writing:**
        1.  `src/routes/{{entityName}}.routes.ts`
        2.  `src/services/{{entityName}}.service.ts`
        3.  `src/services/{{entityName}}.types.ts`
    * **Helper:** Use `currentDate` helper for the header.

**Outcome:**
1. I select 'User' model and check "Requires Authentication".
2. The generated `user.routes.ts` file includes:
   `import { authMiddleware } from '../middlewares/auth';`
   `const router = express.Router();`
   `router.use(authMiddleware);`
   `router.get('/', ...)`