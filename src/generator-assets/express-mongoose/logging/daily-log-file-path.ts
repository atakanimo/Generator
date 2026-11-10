import fs from 'fs';
import path from 'path';

/** Yerel takvim günü anahtarı (`process.env.TZ` / sistem saatine göre). */
export function getLocalDateKeyFor(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `logSystem` / Pino yazma yolu: `logs/app|jobs/YYYY-MM-DD.jsonl` (proje köküne göre). */
export function getDailyAppLogFilePathFor(date: Date): string {
  const logsDir = path.join(process.cwd(), 'logs', 'app');
  const fileName = `${getLocalDateKeyFor(date)}.jsonl`;
  return path.join(logsDir, fileName);
}

export function getDailyJobLogFilePathFor(date: Date): string {
  const logsDir = path.join(process.cwd(), 'logs', 'jobs');
  const fileName = `${getLocalDateKeyFor(date)}.jsonl`;
  return path.join(logsDir, fileName);
}

/** Cutover öncesi legacy path — yalnızca okuma fallback. */
export function getLegacyDailyAppLogFilePathFor(date: Date): string {
  return path.join(process.cwd(), 'system', 'logs', 'app', `${getLocalDateKeyFor(date)}.jsonl`);
}

export function getLegacyDailyJobLogFilePathFor(date: Date): string {
  return path.join(process.cwd(), 'system', 'logs', 'jobs', `${getLocalDateKeyFor(date)}.jsonl`);
}

/**
 * Okuma için: yeni path varsa onu, yoksa legacy `system/logs` dosyasını döner.
 * Yazma her zaman `getDaily*LogFilePathFor` kullanmalı.
 */
export function resolveReadableDailyAppLogFilePathFor(date: Date): string | null {
  const primary = getDailyAppLogFilePathFor(date);
  if (fs.existsSync(primary)) return primary;
  const legacy = getLegacyDailyAppLogFilePathFor(date);
  if (fs.existsSync(legacy)) return legacy;
  return null;
}

export function resolveReadableDailyJobLogFilePathFor(date: Date): string | null {
  const primary = getDailyJobLogFilePathFor(date);
  if (fs.existsSync(primary)) return primary;
  const legacy = getLegacyDailyJobLogFilePathFor(date);
  if (fs.existsSync(legacy)) return legacy;
  return null;
}

export function getAppLogsDirs(): string[] {
  return [path.join(process.cwd(), 'logs', 'app'), path.join(process.cwd(), 'system', 'logs', 'app')];
}

export function getJobLogsDirs(): string[] {
  return [path.join(process.cwd(), 'logs', 'jobs'), path.join(process.cwd(), 'system', 'logs', 'jobs')];
}
