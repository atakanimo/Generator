# Phase 5: Schema Designer, Types & Persistence

**Context:** We have parsed the model. Now we need a UI to customize the schema AND save these customizations to the disk so they are not lost on restart.

**CRITICAL REQUIREMENT:**
1. Structure Types and Helpers first.
2. Implement a ".scaffold" configuration folder strategy for persistence.

**Tasks:**

1.  **Refactor & Centralize Types (Architecture):**
    * Move ALL interfaces to `src/renderer/src/types`.
    * `src/renderer/src/types/ProjectTypes.ts`: `SchemaDefinition`, `FieldConfig`.
    * `src/renderer/src/types/IPCInterfaces.ts`: `ScanResult`, `ParsingResult`.

2.  **Extract Helper Functions (Utils):**
    * Create `src/renderer/src/utils`.
    * **`schemaUtils.ts`:**
        * `getComponentForType(type)`: Returns default UI component.
        * `shouldShowInForm(name)`: Returns false for 'id', 'created_at'.
        * **New:** `mergeSchema(codeSchema, savedSchema)`: Logic to merge freshly parsed fields with saved UI configs. (Preserve UI settings if field exists, add new fields if code changed).

3.  **Persistence Layer (Main Process):**
    * Update `schemaParser.ts` or create `configManager.ts`.
    * **Logic:**
        * Define a config directory: `{projectRoot}/.scaffold`.
        * **Save:** When user saves, write `{EntityName}.schema.json` to this folder.
        * **Load (Update Parsing Logic):** When `parseModel` is called:
            1. Parse the actual TS/CS file to get current fields.
            2. Check if `.scaffold/{EntityName}.schema.json` exists.
            3. If yes, read it and **MERGE** it with the parsed fields (using the helper logic).
            4. Return the merged result.

4.  **Redux & UI Implementation (`SchemaDesignPage.tsx`):**
    * **Slice:** Add `saveSchemaConfig` async thunk.
    * **UI:**
        * **MUI Table:** Columns for Field Name, Type, Label, UI Component, In Table, In Form.
        * **Action Bar:** Add a **"Save Configuration"** button (Floppy disk icon).
        * **Feedback:** Show a "Saved!" snackbar notification on success.

**Outcome:**
1. I change 'email' to 'Select' and click Save.
2. A `.scaffold` folder is created in my project root with a JSON file.
3. I restart the app and open 'User' again.
4. It remembers that 'email' is a 'Select'.