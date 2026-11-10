import { getJobLogContext } from './job-log-context';

export type LogCategory = 'app' | 'job';

/** Job context, explicit category veya cron channel'a göre app/job dosyası seçimi. */
export function resolveLogCategory(
  explicit?: LogCategory | null,
  fields?: { job?: unknown; channel?: unknown }
): LogCategory {
  if (explicit === 'app' || explicit === 'job') {
    return explicit;
  }
  const jobCtx = getJobLogContext();
  if (jobCtx) {
    return 'job';
  }
  if (fields?.job != null && fields.job !== '') {
    return 'job';
  }
  if (fields?.channel === 'cron') {
    return 'job';
  }
  return 'app';
}
