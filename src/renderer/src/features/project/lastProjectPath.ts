const LAST_PROJECT_PATH_KEY = 'generator.lastProjectPath';

export function readLastProjectPath(): string {
  try {
    return localStorage.getItem(LAST_PROJECT_PATH_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function writeLastProjectPath(path: string): void {
  const trimmed = path.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(LAST_PROJECT_PATH_KEY, trimmed);
  } catch {
    // Storage can be unavailable; the in-memory path still works for this session.
  }
}
