# Phase 2 (REVISED): Project Source Selection UI

**Context:** CORRECTION. We are NOT connecting to a live database. We are building a "Static Code Analyzer". The user will select a local folder (their backend project), and our app will parse the Model/Schema files from that folder.

**Task:** Replace the previous 'Database Connection' UI with a 'Project Importer' UI.

1.  **Redux Slice Update (`projectSlice.ts`):**
    * Rename/Refactor `connectionSlice` to `projectSlice`.
    * State:
        * `projectPath`: string (The local folder path selected by user)
        * `sourceType`: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' (Dropdown selection)
        * `modelsFound`: array of strings (List of model names found, e.g., ['User', 'Product'])
        * `status`: 'idle' | 'scanning' | 'ready' | 'error'

2.  **UI Layout (`ProjectSelectPage.tsx`):**
    * **Card 1: Project Location**
        * Input field showing the selected path (Read only).
        * Button: "Browse Folder".
        * *Implementation Note:* This button will trigger an IPC call to Electron's `dialog.showOpenDialog` to let user pick a folder from their OS.
    * **Card 2: Technology Stack**
        * Select/Dropdown: "Which framework are you using?"
        * Options: "Node.js (Mongoose)", ".NET 8 (Entity Framework)", "Node.js (Sequelize)".
    * **Action Area:**
        * Button: "Scan Project Files".
        * It should be disabled if no path is selected.

3.  **IPC (Electron Main Process):**
    * In `src/main/ipc`, add a handler `dialog:openDirectory`.
    * It uses `electron.dialog.showOpenDialog({ properties: ['openDirectory'] })`.
    * Returns the selected file path string to the Renderer.

**Goal:**
1.  I click "Browse".
2.  Native OS folder picker opens.
3.  I select a folder, and the path appears in the Input field.
4.  I select "Node.js (Mongoose)" and click "Scan". (Scanning logic will be Phase 3).