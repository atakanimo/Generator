import fs from 'fs';
import path from 'path';
import { Writable } from 'stream';
import { getDailySystemLogFilePathFor, getLocalDateKeyFor } from './daily-log-file-path';

/**
 * Pino `destination`: her chunk **stdout** + günlük dosya (`system/logs/YYYY-MM-DD.txt`).
 * Gece yarısından sonraki ilk yazımda dosya stream’i otomatik **rotate** edilir (uzun süreli process).
 */
export function createPinoStdoutFileTee(): Writable {
  let activeDateKey: string | null = null;
  let file: fs.WriteStream | null = null;

  const ensureFileStream = (): fs.WriteStream => {
    const now = new Date();
    const key = getLocalDateKeyFor(now);
    if (key === activeDateKey && file) {
      return file;
    }
    if (file) {
      file.end();
      file = null;
    }
    activeDateKey = key;
    const filePath = getDailySystemLogFilePathFor(now);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    file = fs.createWriteStream(filePath, { flags: 'a' });
    return file;
  };

  return new Writable({
    write(chunk: string | Buffer, _encoding, callback) {
      try {
        const out = ensureFileStream();
        process.stdout.write(chunk, errOut => {
          out.write(chunk, errFile => {
            callback(errFile ?? errOut);
          });
        });
      } catch (e) {
        callback(e instanceof Error ? e : new Error(String(e)));
      }
    },
    final(callback) {
      if (file) {
        file.end(() => {
          file = null;
          activeDateKey = null;
          callback();
        });
      } else {
        callback();
      }
    }
  });
}
