/** Bundle entry for `scripts/verify/regen-dotnet.mjs`. */
export { bootstrapDotnetHost, writeDotnetRegistries } from '../../src/main/generators/dotnet-efcore/DotnetHostBootstrap.ts';
export { generateDotnetModules } from '../../src/main/generators/dotnet-efcore/DotnetEfGenerator.ts';
export { dotnetModuleNames } from '../../src/main/generators/dotnet-efcore/dotnetContext.ts';
// D5: what the app calls.
export { parseDotnetEntity } from '../../src/main/parsers/dotnet/entityParser.ts';
export { findDotnetHost, listDotnetEntityFiles } from '../../src/main/parsers/dotnet/dotnetHost.ts';
export { bootstrapDotnetProject, generateDotnetBackend, loadDotnetModels, loadDotnetModelDraft, writeDotnetModel } from '../../src/main/ipc/dotnetBackend.ts';
export { scanProject } from '../../src/main/ipc/projectScanner.ts';
export { getRelatedModelFieldNames } from '../../src/main/ipc/relatedModelFields.ts';
export { parseNormalizedModel } from '../../src/main/ipc/schemaParser.ts';
export { findAdminMountPath } from '../../src/main/utils/backendAppFile.ts';
export { readWorkspaceManifest } from '../../src/main/utils/manifestSnapshot.ts';
// Admin FE config from .NET models.
export { generateAdminConfig } from '../../src/main/generators/AdminConfigGenerator.ts';
export { toAdminResourceConfig } from '../../src/main/generators/adminResourceConfig.ts';
