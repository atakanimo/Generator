/**
 * .NET EF Core module generator (plan backend-dotnet-efcore §3, §7): one NormalizedModel → module files in the 4 layers,
 * then the registry G files from the whole module list.
 *
 * G files carry the Generator header and are rewritten; K files (`*.Custom.cs`, `*Hooks.cs`) are created once.
 */
import { join } from 'path';
import type { NormalizedModel } from '../../../shared/normalizedModel.js';
import { ensureDotnetHost, writeDotnetRegistries } from './DotnetHostBootstrap.js';
import { DotnetModuleContext, buildDotnetModuleContexts, dotnetRegistryModule } from './dotnetContext.js';
import { WrittenFile, renderDotnetTemplate, writeGenerated, writeOnce } from './dotnetFiles.js';
import { dotnetLayout } from './dotnetLayout.js';

export interface DotnetGenerateResult {
  files: WrittenFile[];
  modules: DotnetModuleContext[];
}

function serviceSummary(ctx: DotnetModuleContext): string {
  const parts = [`Normal (mobil) API. normalOperations: ${ctx.normalOperations.join(', ') || '(yok)'}.`];
  if (ctx.ownership) parts.push(`Ownership: ${ctx.ownership.kind}.`);
  if (ctx.droppedOperations.length) parts.push(`Sözleşme gereği kapalı: ${ctx.droppedOperations.join(', ')}.`);
  return parts.join(' ');
}

function moduleFiles(root: string, ctx: DotnetModuleContext): WrittenFile[] {
  const layout = dotnetLayout(root, ctx.app);
  const { entity, folder } = ctx;
  const dir = {
    domain: join(layout.projectDir('Domain'), folder),
    app: join(layout.projectDir('Application'), folder),
    infra: join(layout.projectDir('Infrastructure'), 'Persistence', folder),
    api: join(layout.projectDir('Api'), 'Endpoints', folder)
  };
  const bodies = [
    { body: ctx.normal.create, update: false },
    { body: ctx.normal.update, update: true },
    { body: ctx.admin.create, update: false },
    { body: ctx.admin.update, update: true }
  ];
  const services = [
    {
      file: `${entity}Service.cs`,
      className: `${entity}Service`,
      iface: `I${entity}Service`,
      hooks: `I${entity}Hooks`,
      summary: serviceSummary(ctx),
      ownership: ctx.ownership,
      ...ctx.normal
    },
    {
      file: `${entity}AdminService.cs`,
      className: `${entity}AdminService`,
      iface: `I${entity}AdminService`,
      hooks: `I${entity}AdminHooks`,
      summary: 'Admin API.',
      ownership: undefined,
      ...ctx.admin
    }
  ];
  const allOps = { list: true, getOne: true, create: true, update: true, delete: true };
  const endpoints = [
    {
      file: `${entity}Endpoints.cs`,
      className: `${entity}Endpoints`,
      route: ctx.route,
      tag: folder,
      authCall: ctx.normalAuth === 'anonymous' ? '.AllowAnonymous()' : '.RequireAuthorization()',
      iface: `I${entity}Service`,
      create: ctx.normal.create.name,
      update: ctx.normal.update.name,
      ops: ctx.ops,
      summary: `Normal (mobil) API: <c>${ctx.route}</c>. normalOperations: ${ctx.normalOperations.join(', ') || '(yok)'}.`
    },
    {
      file: `${entity}AdminEndpoints.cs`,
      className: `${entity}AdminEndpoints`,
      route: `${ctx.route}/admin`,
      tag: `${folder} (admin)`,
      authCall: '.RequireAuthorization(AuthSetup.AdminPolicy)',
      iface: `I${entity}AdminService`,
      create: ctx.admin.create.name,
      update: ctx.admin.update.name,
      ops: allOps,
      summary: `Admin API: <c>${ctx.route}/admin</c>. Admin policy.`
    }
  ];

  const g = (path: string, template: string, data: object = {}) =>
    writeGenerated(path, renderDotnetTemplate(template, { ...ctx, ...data }));
  const k = (path: string, template: string) => writeOnce(path, renderDotnetTemplate(template, ctx));

  return [
    g(join(dir.domain, `${entity}.cs`), 'Domain/Entity.cs'),
    k(join(dir.domain, `${entity}.Custom.cs`), 'Domain/Entity.Custom.cs'),
    g(join(dir.app, `${entity}Dtos.cs`), 'Application/Dtos.cs', { bodies }),
    g(join(dir.app, `${entity}Validators.cs`), 'Application/Validators.cs', { bodies }),
    g(join(dir.app, `${entity}Filters.cs`), 'Application/Filters.cs'),
    g(join(dir.app, `${entity}Projections.cs`), 'Application/Projections.cs'),
    g(join(dir.app, `I${entity}Service.cs`), 'Application/IService.cs'),
    k(join(dir.app, `I${entity}Service.Custom.cs`), 'Application/IService.Custom.cs'),
    ...services.map((s) => g(join(dir.app, s.file), 'Application/Service.cs', s)),
    k(join(dir.app, `${entity}Service.Custom.cs`), 'Application/Service.Custom.cs'),
    k(join(dir.app, `${entity}Hooks.cs`), 'Application/Hooks.cs'),
    g(join(dir.infra, `${entity}Configuration.cs`), 'Infrastructure/Configuration.cs'),
    k(join(dir.infra, `${entity}Configuration.Custom.cs`), 'Infrastructure/Configuration.Custom.cs'),
    ...endpoints.map((e) => g(join(dir.api, e.file), 'Api/Endpoints.cs', e)),
    k(join(dir.api, `${entity}Endpoints.Custom.cs`), 'Api/Endpoints.Custom.cs')
  ];
}

/**
 * Generates every given module and rewrites the registries from that list. `models` must be the host's full
 * module list (D5 reads it from the host; until then the caller passes it).
 */
export function generateDotnetModules(root: string, app: string, models: NormalizedModel[]): DotnetGenerateResult {
  const modules = buildDotnetModuleContexts(app, models);
  const files: WrittenFile[] = ensureDotnetHost(root, app);
  for (const ctx of modules) files.push(...moduleFiles(root, ctx));
  files.push(...writeDotnetRegistries(root, app, modules.map(dotnetRegistryModule)));
  return { files, modules };
}
