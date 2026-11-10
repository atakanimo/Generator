import { getJobLogContext } from './job-log-context';
import { resolveLogCategory, type LogCategory } from './category-router';
import { synthesizeHttpLogMessage, stripDurationSuffixFromMessage, stripStatusSuffixFromMessage } from './http-log-message';

export type { LogCategory };

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type LogRecord = {
  ts: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  service: string;
  requestId?: string | null;
  userId?: string | null;
  job?: string | null;
  correlationId?: string | null;
  event?: string | null;
  channel?: string | null;
  method?: string | null;
  url?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  ip?: string | null;
  meta?: Record<string, unknown>;
};

const LEVEL_BY_NUM: Record<number, LogLevel> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal'
};

const STANDARD_KEYS = new Set([
  'level',
  'time',
  'pid',
  'hostname',
  'msg',
  'message',
  'service',
  'requestId',
  'userId',
  'job',
  'correlationId',
  'event',
  'channel',
  'category',
  'method',
  'url',
  'statusCode',
  'durationMs',
  'ip',
  'v'
]);

export function levelFromPino(level: unknown): LogLevel {
  if (typeof level === 'number' && LEVEL_BY_NUM[level]) {
    return LEVEL_BY_NUM[level];
  }
  if (typeof level === 'string' && (level === 'trace' || level === 'debug' || level === 'info' || level === 'warn' || level === 'error' || level === 'fatal')) {
    return level;
  }
  return 'info';
}

function timeToIso(time: unknown): string {
  if (typeof time === 'number') {
    return new Date(time).toISOString();
  }
  if (typeof time === 'string' && time.trim()) {
    const d = new Date(time);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString();
    }
    return time;
  }
  return new Date().toISOString();
}

/** Pino JSON satırından normalize `LogRecord`. */
export function normalizeFromPinoLog(raw: Record<string, unknown>): LogRecord {
  const jobCtx = getJobLogContext();
  const message =
    (typeof raw.msg === 'string' && raw.msg) ||
    (typeof raw.message === 'string' && raw.message && raw.message !== raw.event ? raw.message : '') ||
    synthesizeHttpLogMessage(raw) ||
    (typeof raw.event === 'string' ? raw.event : 'log');

  const category = resolveLogCategory(
    typeof raw.category === 'string' ? (raw.category as LogCategory) : null,
    { job: raw.job ?? jobCtx?.jobName, channel: raw.channel }
  );

  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!STANDARD_KEYS.has(k) && v !== undefined) {
      meta[k] = v;
    }
  }

  const record: LogRecord = {
    ts: timeToIso(raw.time),
    level: levelFromPino(raw.level),
    category,
    message,
    service: typeof raw.service === 'string' ? raw.service : 'varlik-backend',
    requestId: typeof raw.requestId === 'string' ? raw.requestId : null,
    userId: typeof raw.userId === 'string' ? raw.userId : null,
    job: typeof raw.job === 'string' ? raw.job : jobCtx?.jobName ?? null,
    correlationId: typeof raw.correlationId === 'string' ? raw.correlationId : jobCtx?.correlationId ?? null,
    event: typeof raw.event === 'string' ? raw.event : null,
    channel: typeof raw.channel === 'string' ? raw.channel : null,
    method: typeof raw.method === 'string' ? raw.method : typeof meta.method === 'string' ? meta.method : null,
    url: typeof raw.url === 'string' ? raw.url : typeof meta.url === 'string' ? meta.url : null,
    statusCode: typeof raw.statusCode === 'number' ? raw.statusCode : typeof meta.statusCode === 'number' ? meta.statusCode : null,
    durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : typeof meta.durationMs === 'number' ? meta.durationMs : null,
    ip: typeof raw.ip === 'string' ? raw.ip : typeof meta.ip === 'string' ? meta.ip : null
  };

  if (typeof record.ip === 'string') {
    delete meta.ip;
  }

  if (Object.keys(meta).length > 0) {
    record.meta = meta;
  }

  return record;
}

/** API okuma / admin tablo: eski satırlarda `message === event` ise HTTP özetini üret. */
export function enrichLogRecord(record: LogRecord): LogRecord {
  const meta = record.meta ?? {};
  const method = record.method ?? (typeof meta.method === 'string' ? meta.method : null);
  const url = record.url ?? (typeof meta.url === 'string' ? meta.url : null);
  const statusCode =
    record.statusCode ?? (typeof meta.statusCode === 'number' ? meta.statusCode : null);
  const durationMs =
    record.durationMs ?? (typeof meta.durationMs === 'number' ? meta.durationMs : null);
  const ip = record.ip ?? (typeof meta.ip === 'string' ? meta.ip : null);
  const userId = record.userId ?? (typeof meta.userId === 'string' ? meta.userId : null);

  const synthesized = synthesizeHttpLogMessage({
    event: record.event,
    method,
    url,
    statusCode,
    durationMs,
    meta
  });

  const message = stripStatusSuffixFromMessage(
    stripDurationSuffixFromMessage(
      record.message && record.event && record.message !== record.event
        ? record.message
        : synthesized ?? record.message,
      durationMs
    ),
    statusCode
  );

  const nextMeta = { ...meta };
  if (typeof ip === 'string') {
    delete nextMeta.ip;
  }
  if (typeof userId === 'string') {
    delete nextMeta.userId;
  }

  return {
    ...record,
    message,
    method,
    url,
    statusCode,
    durationMs,
    ip,
    userId,
    meta: Object.keys(nextMeta).length > 0 ? nextMeta : undefined
  };
}
