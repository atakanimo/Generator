# Phase 4: Scanner Refinement & Model Parsing

**Context:** We have a list of files, but it includes `index.ts` which we don't want. We need to filter that out first. Then, we need to implement the parsing logic to convert TypeScript model files into our JSON Schema format.

**Tasks:**

1.  **Refine Scanner (`src/main/ipc/projectScanner.ts`):**
    * **Urgent Fix:** Update the `project:scan` logic to explicitly **exclude** files named `index.ts`, `index.js`, `index.d.ts`.
    * Also exclude any file starting with a dot (e.g., `.DS_Store`).
    * *Goal:* When I scan again, `index.ts` should NOT appear in the list.

2.  **Redux Slice Update (`projectSlice.ts`):**
    * Add state: `selectedModelSchema`: `SchemaDefinition | null`.
    * Define `SchemaDefinition` interface:
        * `entityName`: string
        * `fields`: Array of `{ name: string, type: string, required: boolean, isArray: boolean }`
    * Add async thunk `parseModelFile` that calls the new IPC handler.

3.  **Main Process Logic (`src/main/ipc/schemaParser.ts`):**
    * Create a new IPC handler `project:parseModel`.
    * Input: `{ filePath: string }`.
    * **Logic (The Brain):**
        * Read the file content using `fs.readFileSync`.
        * **Parsing Strategy:**
            * Use Regex or string analysis to find property definitions.
            * Support **Mongoose Schemas** (e.g., `name: { type: String }`) AND **TypeScript Interfaces/Classes** (e.g., `name: string;`).
            * *Extraction:* Map found types to a generic string (e.g., 'String' -> 'string', 'Number' -> 'number').
        * Return the `SchemaDefinition` JSON.

4.  **UI Updates (`ProjectSelectPage.tsx`):**
    * Make the items in the "Found Models" list clickable.
    * When an item is clicked:
        * Show a loading indicator.
        * Dispatch `parseModelFile`.
        * Display the result in a simple **Table** or **JSON View** for now to verify it works.

**Outcome:**
1. `index.ts` disappears from the list.
2. I click 'User.model.ts'.
3. The app shows me extracted fields: `[{ name: 'email', type: 'string' }, { name: 'role', type: 'string' }]`.