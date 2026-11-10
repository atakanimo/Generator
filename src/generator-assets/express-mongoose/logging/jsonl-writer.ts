import fs from 'fs';
import path from 'path';
import type { LogCategory, LogRecord } from './log-record';
import { getDailyAppLogFilePathFor, getDailyJobLogFilePathFor, getLocalDateKeyFor } from './daily-log-file-path';

type ActiveStream = {
  dateKey: string;
  stream: fs.WriteStream;
};

const activeByCategory = new Map<LogCategory, ActiveStream>();

function getFilePathFor(category: LogCategory, date: Date): string {
  return category === 'job' ? getDailyJobLogFilePathFor(date) : getDailyAppLogFilePathFor(date);
}

function ensureStream(category: LogCategory, date: Date): fs.WriteStream {
  const dateKey = getLocalDateKeyFor(date);
  const current = activeByCategory.get(category);
  if (current && current.dateKey === dateKey) {
    return current.stream;
  }
  if (current) {
    current.stream.end();
  }
  const filePath = getFilePathFor(category, date);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const stream = fs.createWriteStream(filePath, { flags: 'a' });
  activeByCategory.set(category, { dateKey, stream });
  return stream;
}

export function appendLogRecord(record: LogRecord): void {
  const date = new Date(record.ts);
  const stream = ensureStream(record.category, date);
  stream.write(`${JSON.stringify(record)}\n`);
}
