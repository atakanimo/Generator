import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { RELATION_OPTIONS_LIMIT, type Id, type ListBody } from '../contract/api.js';
import type { ActionParams } from '../data/dataProvider.js';
import { bindResourceApi, type ResourceApi } from '../data/resourceApi.js';
import type { RelationFieldConfig } from '../schema/fields.js';
import { canSearchRelation } from '../schema/relation.js';
import type { InferRow, ResourceSchema } from '../schema/resource.js';
import { useAtaAdmin } from './context.js';

/** Bir resource'un tüm sorguları `['ata-admin', name]` altında; mutation sonrası hepsi geçersiz kılınır. */
export const resourceKeys = {
  all: (name: string) => ['ata-admin', name] as const,
  list: (name: string, body: ListBody) => ['ata-admin', name, 'list', body] as const,
  one: (name: string, id: Id) => ['ata-admin', name, 'one', id] as const
};

export function useResourceApi<S extends ResourceSchema>(resource: S): ResourceApi<InferRow<S>> {
  const { dataProvider } = useAtaAdmin();
  return useMemo(() => bindResourceApi<InferRow<S>>(dataProvider, resource), [dataProvider, resource]);
}

/**
 * Liste / kayıt sorgularını yeniler. Yenileme beklenmez (`void`): mutation hemen biter, form / onay penceresi
 * kapanır, tablo arka planda güncellenir.
 */
function useInvalidateResource(name: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: resourceKeys.all(name) });
  };
}

export function useResourceList<S extends ResourceSchema>(
  resource: S,
  body: ListBody,
  options?: { enabled?: boolean; background?: boolean }
) {
  const api = useResourceApi(resource);
  return useQuery({
    queryKey: resourceKeys.list(resource.name, body),
    queryFn: ({ signal }) => api.list(body, { signal, background: options?.background }),
    placeholderData: keepPreviousData,
    enabled: options?.enabled
  });
}

export function useResourceOne<S extends ResourceSchema>(resource: S, id: Id | undefined) {
  const api = useResourceApi(resource);
  return useQuery({
    queryKey: resourceKeys.one(resource.name, id ?? ''),
    queryFn: ({ signal }) => api.getOne(id as Id, { signal }),
    enabled: id !== undefined
  });
}

export function useResourceMutations<S extends ResourceSchema>(resource: S) {
  const api = useResourceApi(resource);
  const invalidate = useInvalidateResource(resource.name);
  const create = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.create(data),
    onSuccess: invalidate
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: Id; data: Record<string, unknown> }) => api.update(id, data),
    onSuccess: invalidate
  });
  const remove = useMutation({
    mutationFn: (id: Id) => api.remove(id),
    onSuccess: invalidate
  });
  return { create, update, remove };
}

export function useResourceAction<S extends ResourceSchema>(resource: S, actionId: string) {
  const api = useResourceApi(resource);
  const invalidate = useInvalidateResource(resource.name);
  return useMutation({
    mutationFn: (params: ActionParams) => api.action(actionId, params),
    onSuccess: invalidate
  });
}

/**
 * İlişki alanı autocomplete seçenekleri (K3): hedef resource'un `get-all`'u,
 * gösterim alanında `regex`, en fazla 20 kayıt, global loading açılmadan.
 */
export function useRelationOptions(field: RelationFieldConfig, search: string, options?: { enabled?: boolean }) {
  const { dataProvider, resources } = useAtaAdmin();
  const target = resources.get(field.ref);
  const term = search.trim();
  const searchable = canSearchRelation(field, target);

  const body: ListBody = { limit: RELATION_OPTIONS_LIMIT };
  if (searchable && field.display) {
    body.sortBy = field.display;
    body.sortOrder = 'asc';
    if (term) body.filters = { [field.display]: term };
  }

  return useQuery({
    queryKey: resourceKeys.list(field.ref, body),
    queryFn: ({ signal }) =>
      dataProvider.list<{ id: Id } & Record<string, unknown>>(target!, body, { signal, background: true }),
    enabled: target !== undefined && (options?.enabled ?? true),
    placeholderData: keepPreviousData
  });
}
