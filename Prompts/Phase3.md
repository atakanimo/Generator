# Phase 3: File System Scanning & Model Discovery logic

**Context:** The user has selected a project folder path in Phase 2. Now, when they click "Scan", we need to read that directory, look for model files based on the selected tech stack, and return a list of found entities.

**Goal:** Bridge the UI "Scan" button to a Node.js `fs` operation that actually lists files from the user's disk.

**Tasks:**

1.  **Main Process Logic (`src/main/ipc/projectScanner.ts`):**
    * Create a new IPC handler `project:scan`.
    * It receives `{ path: string, type: 'nodejs-mongoose' | 'dotnet-ef' }`.
    * **Logic:**
        * Use `fs.readdir` (or `glob`) to verify the path exists.
        * **If Node.js/Mongoose:** Look for a folder named `models`. If found, list all `.js` or `.ts` files inside it.
        * **If .NET/EF:** Look for a folder named `Entities` or `Models`. List `.cs` files.
        * *Fallback:* If those specific folders don't exist, just search the root for files matching the extension.
    * **Return:** A JSON object: `{ success: true, models: [{ fileName: 'User.ts', path: '...' }, { fileName: 'Product.ts', path: '...' }] }`.

2.  **Preload & Types:**
    * Update `window.api` to include `scanProject(path, type)`.
    * Update TS interfaces to match the return type.

3.  **Redux Integration (`projectSlice.ts`):**
    * Create an async thunk `scanProjectFiles`.
    * Handle states:
        * `pending`: Set `status` to 'scanning'.
        * `fulfilled`: Update `modelsFound` with the list returned from Electron. Set `status` to 'ready'.
        * `rejected`: Show error message (e.g., "Models folder not found").

4.  **UI Feedback (`ProjectSelectPage.tsx`):**
    * When "Scan" is clicked, show a `CircularProgress`.
    * Upon success, display a new section below the button: **"Found Models"**.
    * List the found files as clickable items (e.g., using a simple MUI `List` and `ListItem`).

**Result:** I select a real folder on my computer containing some code. I click Scan. The app tells me "I found User.js and Product.js".