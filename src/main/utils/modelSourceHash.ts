import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import type { ModelSourceCheck } from '../../shared/ipcTypes.js';

/** Content hash of a model file: lets generation detect that the file changed after the editor parsed it. */
export function modelSourceHash(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

/**
 * Error message when the model file changed on disk since the editor parsed it, else `null`. Generating from the
 * stale editor state would rewrite the model file and silently drop the on-disk change (plan 6 §6).
 */
export function staleModelSourceError(check: ModelSourceCheck | undefined): string | null {
  if (!check?.filePath || !check.hash || !existsSync(check.filePath)) return null;
  if (modelSourceHash(readFileSync(check.filePath, 'utf8')) === check.hash) return null;
  return 'Model dosyası arayüzde açıldıktan sonra diskte değişmiş. Değişiklik silinmesin diye generate yapılmadı; modeli yeniden açıp tekrar deneyin.';
}
