export function camelCase(input: string): string {
  if (!input) return '';
  return input.charAt(0).toLowerCase() + input.slice(1);
}

export function pascalCase(input: string): string {
  if (!input) return '';
  return input.charAt(0).toUpperCase() + input.slice(1);
}

export function kebabCase(input: string): string {
  if (!input) return '';
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function pluralizeToken(token: string): string {
  // Very small heuristic (good enough for generator naming, not linguistics)
  if (token.endsWith('s')) return token;
  if (token.endsWith('y') && token.length > 1 && !/[aeiou]y$/i.test(token)) return `${token.slice(0, -1)}ies`;
  return `${token}s`;
}

function singularizeToken(token: string): string {
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && token.length > 1) return token.slice(0, -1);
  return token;
}

export function pluralize(input: string): string {
  return pluralizeToken(input);
}

export function singularize(input: string): string {
  return singularizeToken(input);
}

/** Backend module folder + file base (kebab), aligned with `BackendGenerator.createArtifactManifest`. */
export function moduleNameFromEntity(entityName: string): string {
  return kebabCase(pascalCase(entityName));
}
