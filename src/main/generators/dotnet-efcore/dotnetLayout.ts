/**
 * .NET EF Core host layout (plan backend-dotnet-efcore §3): project / folder / namespace paths in one place.
 */
import { join } from 'path';

export type DotnetLayer = 'Domain' | 'Application' | 'Infrastructure' | 'Api';
export const DOTNET_LAYERS: DotnetLayer[] = ['Domain', 'Application', 'Infrastructure', 'Api'];

/** Token used in skeleton / asset paths and contents; replaced by the app name (PascalCase). */
export const APP_TOKEN = '__App__';
/** Lower-case token (database name, JWT issuer). */
export const APP_TOKEN_LOWER = '__app__';

export interface DotnetLayout {
  app: string;
  root: string;
  projectDir(layer: DotnetLayer): string;
  namespace(layer: DotnetLayer, ...folders: string[]): string;
}

export function dotnetLayout(root: string, app: string): DotnetLayout {
  return {
    app,
    root,
    projectDir: (layer) => join(root, 'src', `${app}.${layer}`),
    namespace: (layer, ...folders) => [app, layer, ...folders].join('.')
  };
}

/** G files (header-owned, rewritten on every generate) that list all modules. */
export const REGISTRY_FILES: Array<{ template: string; layer: DotnetLayer; path: string }> = [
  { template: 'Application/IAppDbContext.Generated.cs', layer: 'Application', path: 'Common/Abstractions/IAppDbContext.Generated.cs' },
  { template: 'Application/DependencyInjection.Generated.cs', layer: 'Application', path: 'DependencyInjection.Generated.cs' },
  { template: 'Infrastructure/AppDbContext.Generated.cs', layer: 'Infrastructure', path: 'Persistence/AppDbContext.Generated.cs' },
  { template: 'Api/EndpointRegistry.Generated.cs', layer: 'Api', path: 'Endpoints/EndpointRegistry.Generated.cs' }
];

export function isValidAppName(app: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(app);
}
