/** Bundle entry for `scripts/host.mjs`. Same functions the Electron IPC calls. */
export { readWorkspaceManifest, getWorkspacePreferences } from '../src/main/utils/manifestSnapshot.ts';
export { detectProjectStack } from '../src/main/ipc/projectScanner.ts';
export { generateFrontend } from '../src/main/ipc/frontendGenerator.ts';
export { generateBackend } from '../src/main/ipc/backendGenerator.ts';
export { generatePythonBackend } from '../src/main/ipc/pythonBackend.ts';
export { generateDotnetBackend } from '../src/main/ipc/dotnetBackend.ts';
export { parseBaseUrlFromBackend } from '../src/main/utils/backendAppFile.ts';
export { moduleNameFromEntity } from '../src/main/utils/namingUtils.ts';
export { adminDir } from '../src/shared/adminDir.ts';
