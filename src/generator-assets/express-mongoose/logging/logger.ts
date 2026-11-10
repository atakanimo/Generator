import pino from 'pino';
import pinoPretty from 'pino-pretty';
import { getRequestContext } from '@utils/requestContext';
import { getJobLogContext } from './job-log-context';
import { createJsonlLogDestination } from './jsonl-log-destination';

const level = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
const isDev = process.env.NODE_ENV !== 'production';

const jsonlDestination = createJsonlLogDestination();

const streams: pino.StreamEntry[] = [{ stream: jsonlDestination }];

if (isDev) {
  streams.push({
    stream: pinoPretty({
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    })
  });
}

const logDestination = streams.length === 1 ? jsonlDestination : pino.multistream(streams);

/**
 * Uygulama kök logger'ı. Çıktı: normalize JSONL (`logs/app|jobs/`) + dev'de pino-pretty stdout.
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
 * Context-aware logger:
 * - cron `runWithJobLogContext` → job + correlationId
 * - HTTP ALS `getRequestContext` → requestId (+ userId)
 * Böylece Alpha Terminal vb. `getAppLogger()` çağrıları HTTP requestId taşır.
 */
export function getAppLogger(): pino.Logger {
  const job = getJobLogContext();
  if (job) {
    return appLogger.child({ job: job.jobName, correlationId: job.correlationId, channel: 'cron' });
  }

  const ctx = getRequestContext();
  if (ctx?.requestId) {
    return appLogger.child({
      requestId: ctx.requestId,
      ...(ctx.userId ? { userId: ctx.userId } : {})
    });
  }

  return appLogger;
}
