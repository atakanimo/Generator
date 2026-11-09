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
export { generateClientAuthFiles, generateClientModules, clientAuthFromManifest } from '../src/main/generators/client-redux/ClientGenerator.ts';
export { CLIENT_PRESETS } from '../src/main/generators/client-redux/clientPreset.ts';
export { resolveClientPlatformAt } from '../src/main/utils/clientPlatform.ts';
export { loadDotnetModels } from '../src/main/ipc/dotnetBackend.ts';
export { findDotnetHost } from '../src/main/parsers/dotnet/dotnetHost.ts';
