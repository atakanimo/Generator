import { z } from 'zod';

/**
 * Tüm `POST .../get-all` gövdelerinin sayfalama alanları — istemci göndermezse sunucu **sayfa 1**, **limit 50**
 * (`BaseCrudService` + `clampListLimit`). Filtreler ayrı `filters` objesinde (sözleşme K2); modül şeması ekler.
 */
export const ListPaginationBodySchema = z
  .object({
    limit: z.number().optional(),
    page: z.number().int().positive().optional(),
    sortBy: z.string().min(1).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional()
  })
  .strict();
