import path from 'path';

/** Yerel takvim günü anahtarı (`process.env.TZ` / sistem saatine göre). */
export function getLocalDateKeyFor(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `logSystem` / Pino: `system/logs/YYYY-MM-DD.txt` (proje köküne göre). */
export function getDailySystemLogFilePathFor(date: Date): string {
  const logsDir = path.join(process.cwd(), 'system', 'logs');
  const fileName = `${getLocalDateKeyFor(date)}.txt`;
  return path.join(logsDir, fileName);
}

export function getDailySystemLogFilePath(): string {
  return getDailySystemLogFilePathFor(new Date());
}
