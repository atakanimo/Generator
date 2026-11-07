// Projeye özel HTTP davranışı (docs/frontend/http-layer.md). `api.ts` ortaktır ve değiştirilmez; fark buraya yazılır.
// Boş bırakılan hook'ta api.ts sözleşmenin varsayılanını uygular.
import type { ApiHooks } from '@/types';

export const apiHooks: ApiHooks = {};
