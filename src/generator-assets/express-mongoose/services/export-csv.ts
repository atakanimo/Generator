import type { Response } from 'express';
import { t } from '@helpers';
import { ErrorResponse } from '@core/response/response.helper';
import { toWire } from '@core/response/wire';
import type { IApiResponse } from '@core/types/api-contract';
import { applyRequestIdToResponse } from '@utils/requestContext';

/**
 * Admin CSV export (api-contract §2 "Export", PY12): column checks, cell rules, CSV text. The generated admin service
 * reads the rows (the list query without paging); this module is only the format (same rules as Python `export.py`
 * and .NET `CsvExport`).
 */

/** At most this many rows per export; more is 400 (narrow the filters). */
export const EXPORT_ROW_LIMIT = 50_000;

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];
/** Number-like text (decimal wire `-12.50`) is not a formula; no prefix. */
const NUMBER_TEXT = /^-?\d+(\.\d+)?$/;

export interface ExportRequest {
  fields?: string[];
  headers?: string[];
}

export interface ExportColumns {
  /** Exportable columns in order (`id`, model fields, timestamps; `hidden` never). */
  fields: readonly string[];
  /** Populated reference column → the target field shown (`reference.display`). */
  display: Readonly<Record<string, string>>;
}

/** Requested columns and header row, or the 400 response. */
export function resolveExportColumns(
  request: ExportRequest,
  columns: ExportColumns
): { fields: string[]; headers: string[] } | IApiResponse<never> {
  const fields = request.fields?.length ? request.fields : [...columns.fields];
  const unknown = fields.find((f) => !columns.fields.includes(f));
  if (unknown !== undefined) {
    return ErrorResponse({
      code: 'BAD_REQUEST',
      message: t('crud.exportUnknownField', { field: unknown, defaultValue: `Cannot export this field: ${unknown}` })
    });
  }
  if (request.headers && request.headers.length !== fields.length) {
    return ErrorResponse({
      code: 'BAD_REQUEST',
      message: t('crud.exportHeaders', { defaultValue: '`headers` must have as many items as `fields`.' })
    });
  }
  return { fields, headers: request.headers ?? fields };
}

/** 400 when the query matched more than `EXPORT_ROW_LIMIT` rows (read with `limit: EXPORT_ROW_LIMIT + 1`). */
export function exportTooMany(): IApiResponse<never> {
  return ErrorResponse({
    code: 'BAD_REQUEST',
    message: t('crud.exportTooMany', {
      limit: EXPORT_ROW_LIMIT,
      defaultValue: `Too many records to export; at most ${EXPORT_ROW_LIMIT}. Narrow the filters.`
    })
  });
}

/** One cell: `null` empty, reference → its `display` field (else id), array / object compact JSON, text formula guard. */
export function cellText(value: unknown, display?: string): string {
  if (value === null || value === undefined) return '';
  if (display !== undefined) {
    if (Array.isArray(value)) return JSON.stringify(value.map((v) => shown(v, display)));
    return cellText(shown(value, display));
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return JSON.stringify(value);
  // Same as the JSON response: ISO UTC with milliseconds.
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  return FORMULA_PREFIXES.some((p) => text.startsWith(p)) && !NUMBER_TEXT.test(text) ? `'${text}` : text;
}

/** RFC 4180 (`,`, CRLF), UTF-8 BOM. `rows` are DB records; `toWire` gives the response shape (`id`, ISO dates). */
export function renderCsv(rows: readonly unknown[], fields: readonly string[], headers: readonly string[], display: ExportColumns['display']): string {
  const lines = [headers.map(quote).join(',')];
  for (const row of rows) {
    const wire = toWire(row) as Record<string, unknown>;
    lines.push(fields.map((f) => quote(cellText(wire[f], display[f]))).join(','));
  }
  return `﻿${lines.map((l) => `${l}\r\n`).join('')}`;
}

/** `<route>-<YYYY-MM-DD>.csv` (UTC date) as an attachment. */
export function sendCsv(res: Response, route: string, csv: string): void {
  applyRequestIdToResponse(res);
  const filename = `${route}-${new Date().toISOString().slice(0, 10)}.csv`;
  res.status(200).set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="${filename}"`).send(csv);
}

function shown(value: unknown, display: string): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return record[display] ?? record.id ?? record._id;
  }
  return value;
}

function quote(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}
