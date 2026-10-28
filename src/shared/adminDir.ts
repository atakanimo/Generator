function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Admin directory for a host (`scripts/host.mjs`).
 * `frontendPath` is kept when it sits inside the host; an empty path or one that points at
 * another project becomes `<host>/apps/admin`.
 */
export function adminDir(host: string, frontendPath?: string | null): string {
  const root = normalize(host);
  const fallback = `${root}/apps/admin`;
  if (!frontendPath?.trim()) return fallback;
  const abs = normalize(frontendPath);
  if (abs === root || abs.startsWith(`${root}/`)) return abs;
  return fallback;
}
