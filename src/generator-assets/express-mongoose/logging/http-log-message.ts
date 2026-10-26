export function formatHttpRequestMessage(method: string, url: string): string {
  return `${method} ${url}`;
}

export function formatHttpResponseMessage(method: string, url: string): string {
  return `${method} ${url}`;
}

/** Message sonundaki ` 200` gibi HTTP status tekrarını kaldır (Status kolonu ayrı). */
export function stripStatusSuffixFromMessage(message: string, statusCode?: number | null): string {
  if (statusCode != null) {
    const stripped = message.replace(new RegExp(`\\s+${statusCode}$`), '');
    if (stripped !== message) return stripped;
  }
  return message;
}

/** Message sonundaki ` 6ms` tekrarını kaldır (Duration kolonu ayrı). */
export function stripDurationSuffixFromMessage(message: string, durationMs?: number | null): string {
  if (durationMs != null) {
    const stripped = message.replace(new RegExp(`\\s+${durationMs}ms$`), '');
    if (stripped !== message) return stripped;
  }
  return message.replace(/\s+\d+ms$/, '');
}

/** Eski JSONL satırları veya `message === event` durumları için okunur özet. */
export function synthesizeHttpLogMessage(raw: Record<string, unknown>): string | null {
  const event = raw.event;
  const meta = raw.meta && typeof raw.meta === 'object' && !Array.isArray(raw.meta) ? (raw.meta as Record<string, unknown>) : {};
  const method = String(raw.method ?? meta.method ?? '');
  const url = String(raw.url ?? meta.url ?? '');
  const statusCode = raw.statusCode ?? meta.statusCode;

  if (event === 'http.request' && (method || url)) {
    return formatHttpRequestMessage(method || '?', url || '?');
  }
  if (event === 'http.response' && (method || url)) {
    return formatHttpResponseMessage(method || '?', url || '?');
  }
  if (event === 'http.response' && statusCode != null) {
    return `HTTP ${statusCode}`;
  }
  return null;
}
