/** Bundle entry for `scripts/verify/python-bootstrap.mjs`, `regen-python.mjs`, `python-import.mjs` and `scripts/python-host.mjs`. */
export { bootstrapPythonHost, ensurePythonHost, renderRoutersRegistry, writePythonRegistries } from '../../src/main/generators/python-fastapi/PythonHostBootstrap.ts';
export { pythonAssetsDir } from '../../src/main/generators/python-fastapi/pythonFiles.ts';
export { isValidPythonPackage, toPythonPackageName } from '../../src/main/generators/python-fastapi/pythonLayout.ts';
// What the app calls (IPC `project:bootstrapPython`).
export { bootstrapPythonProject } from '../../src/main/ipc/pythonBackend.ts';
export { readWorkspaceManifest } from '../../src/main/utils/manifestSnapshot.ts';
// PY5 (`regen-python.mjs`): module generator + what the app calls (generate, model editor).
export { generatePythonModules, renderPythonGeneratedFiles, renderPythonOwnedFiles } from '../../src/main/generators/python-fastapi/PythonFastapiGenerator.ts';
export { buildPythonModuleContexts, pythonModuleNames } from '../../src/main/generators/python-fastapi/pythonContext.ts';
export { findPythonHost, generatePythonBackend, loadPythonModelDraft, loadPythonModels, writePythonModel } from '../../src/main/ipc/pythonBackend.ts';
// Auth modules of an existing host (`scripts/python-host.mjs auth`), what IPC `project:setPythonAuthModules` calls.
export { readPythonAuthSettings, setPythonAuthModules } from '../../src/main/ipc/pythonBackend.ts';
// PY7 (`python-import.mjs`): Pydantic import + extra-field report + what the app calls (scan, preview, import).
export { listPydanticClasses, parsePydanticModel } from '../../src/main/parsers/python/pydanticModel.ts';
export { collectionReport, reportShape, resolveMongoConfig, summarizeReport } from '../../src/main/parsers/python/mongoReport.ts';
export { importPythonModel, listPythonModels, loadPythonModelForEditor, previewPythonImport } from '../../src/main/ipc/pythonBackend.ts';
export { scanProject } from '../../src/main/ipc/projectScanner.ts';
export { loadModelForEditor } from '../../src/main/ipc/modelEditor.ts';
// Admin FE config for a Python host's modules (`scripts/python-host.mjs admin-config`), what IPC `generateFrontend` calls.
export { generateFrontend } from '../../src/main/ipc/frontendGenerator.ts';
