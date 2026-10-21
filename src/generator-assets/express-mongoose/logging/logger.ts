import pino from 'pino';
import { getJobLogContext } from './job-log-context';
import { createPinoStdoutFileTee } from './pino-stdout-file-tee';

const level = (process.env.LOG_LEVEL ?? 'info').toLowerCase();

const logDestination = createPinoStdoutFileTee();

/**
 * Uygulama kök logger’ı (tasks §10.1). `LOG_LEVEL` varsayılan `info`.
 * Çıktı: **stdout** + **`system/logs/YYYY-MM-DD.txt`** (günlük otomatik rotate; `logSystem` ile aynı dosya adı kuralı).
 */
export const appLogger = pino(
  {
    level,
    base: { service: 'varlik-backend' },
    timestamp: pino.stdTimeFunctions.isoTime
  },
  logDestination
);

/**
 * HTTP isteği dışında (cron) `runWithJobLogContext` aktifse child’da **job** + **correlationId** (tasks §14.1).
 */
export function getAppLogger(): pino.Logger {
  const job = getJobLogContext();
  if (job) {
    return appLogger.child({ job: job.jobName, correlationId: job.correlationId });
  }
  return appLogger;
}
