import { Writable } from 'stream';
import { normalizeFromPinoLog } from './log-record';
import { appendLogRecord } from './jsonl-writer';

/** Pino destination: her satırı parse edip normalize JSONL dosyasına yazar. */
export function createJsonlLogDestination(): Writable {
  let buffer = '';

  return new Writable({
    write(chunk: string | Buffer, _encoding, callback) {
      try {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const raw = JSON.parse(trimmed) as Record<string, unknown>;
            appendLogRecord(normalizeFromPinoLog(raw));
          } catch {
            appendLogRecord(
              normalizeFromPinoLog({
                level: 30,
                time: Date.now(),
                msg: trimmed,
                channel: 'system'
              })
            );
          }
        }
        callback();
      } catch (e) {
        callback(e instanceof Error ? e : new Error(String(e)));
      }
    },
    final(callback) {
      const trimmed = buffer.trim();
      if (trimmed) {
        try {
          const raw = JSON.parse(trimmed) as Record<string, unknown>;
          appendLogRecord(normalizeFromPinoLog(raw));
        } catch {
          appendLogRecord(
            normalizeFromPinoLog({
              level: 30,
              time: Date.now(),
              msg: trimmed,
              channel: 'system'
            })
          );
        }
      }
      callback();
    }
  });
}
