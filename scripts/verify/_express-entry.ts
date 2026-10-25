/** Bundle entry for `scripts/verify/express-bootstrap.mjs` (PY9): what the app calls for a new Express host and its first model. */
export { bootstrapExpressProject } from '../../src/main/ipc/expressBackend.ts';
export { bootstrapExpressHost, toExpressPackageName } from '../../src/main/generators/express-mongoose/ExpressHostBootstrap.ts';
export { scanProject } from '../../src/main/ipc/projectScanner.ts';
export { createModel } from '../../src/main/ipc/modelCreator.ts';
export { loadModelForEditor } from '../../src/main/ipc/modelEditor.ts';
export { generateBackend } from '../../src/main/ipc/backendGenerator.ts';
export { findAdminMountPath, findNormalMountPath, parseBaseUrlFromBackend } from '../../src/main/utils/backendAppFile.ts';
export { readWorkspaceManifest } from '../../src/main/utils/manifestSnapshot.ts';
// Stack info (single definition behind the buttons' popover) and the other two bootstraps for its tree check.
export { NEW_PROJECT_STACKS, stackTreePaths } from '../../src/shared/backendStacks.ts';
export { bootstrapDotnetProject } from '../../src/main/ipc/dotnetBackend.ts';
export { bootstrapPythonProject } from '../../src/main/ipc/pythonBackend.ts';
export { toPythonPackageName } from '../../src/main/generators/python-fastapi/pythonLayout.ts';
