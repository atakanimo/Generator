import mongoose, { type PopulateOptions, Document, FilterQuery, Model, UpdateQuery } from 'mongoose';
import type { IApiResponse } from '@core/types/api-contract';
import { SuccessResponse, ErrorResponse } from '@core/response/response.helper';
import { HandleServiceError } from '@core/errors/error.helper';
import { clampListLimit, listOffsetFromPage, paginatedListMeta, type PaginatedList } from '@core/pagination/pagination.helper';
import { getCurrentUserId } from '@utils/requestContext';
import { resolveCrudProjection, stripHiddenFields } from '@core/services/crud-projection';
import { applyAuthScope, type CrudAuthScope } from '@core/services/crud-scope';
import { t } from '@helpers';

/**
 * Per-service message overrides. Unset → the host's shared `crud.*` locale keys (`listFailed`, `getByIdFailed`,
 * `createFailed`, `updateFailed`, `deleteFailed`, `notFound`, `deleteSuccess`), resolved per call in the request language.
 */
type CrudDefaultMessages = {
  listFailed?: string;
  findFailed?: string;
  getByIdFailed?: string;
  createFailed?: string;
  updateFailed?: string;
  deleteFailed?: string;
  notFound?: string;
  successMessage?: string;
  successUiMessage?: string;
};

export type CrudPopulate = string | PopulateOptions | Array<string | PopulateOptions>;

/** `BaseCrudService.find` ikinci argümanı (servis `find` sarmalayıcılarıyla paylaşılır). */
export type CrudFindListOptions = {
  projection?: string | Record<string, 0 | 1 | boolean> | null;
  sort?: Record<string, 1 | -1>;
  populate?: CrudPopulate;
  lean?: boolean;
  limit?: number;
};

/** `BaseCrudService.find` üçüncü argümanı. */
export type CrudFindErrorMessages = {
  findFailed?: string;
};

export type { CrudAuthScope };

export abstract class BaseCrudService<TDoc extends Document & { createdAt?: Date }> {
  /**
   * @param requireAuthUserIdScope Kayıt kapsamı: `true` → auth kullanıcının `userId` kayıtları, `'self'` → kullanıcının
   *   kendi kaydı (`{ _id: authUserId }`, G5), `false` → kapsam yok.
   * @param hiddenFields Hiçbir CRUD cevabında dönmeyen alanlar (ör. `password`, `otpCode`) — sözleşme §2.1, G2.
   */
  constructor(
    protected readonly model: Model<TDoc>,
    private readonly defaultMessages: CrudDefaultMessages = {},
    private readonly requireAuthUserIdScope: CrudAuthScope = false,
    private readonly hiddenFields: readonly string[] = []
  ) {}

  protected augmentListQuery(q: any): any {
    return q;
  }

  protected augmentDetailQuery(q: any): any {
    return q;
  }

  /** `create` öncesi payload (ObjectId dönüşümü, strip vb.) — alt sınıf override edebilir. */
  protected transformCreatePayload(payload: Record<string, unknown>): Record<string, unknown> {
    return payload;
  }

  private requireAuthUserId(): string | null {
    if (!this.requireAuthUserIdScope) {
      return null;
    }
    const uid = getCurrentUserId();
    return uid ?? '';
  }

  private withAuthScope(filter: FilterQuery<TDoc>, uid: string | null): FilterQuery<TDoc> {
    if (!uid) {
      return { ...filter } as FilterQuery<TDoc>;
    }
    return applyAuthScope(filter, this.requireAuthUserIdScope, new mongoose.Types.ObjectId(uid)) as FilterQuery<TDoc>;
  }

  private unauthorizedMessage(): string {
    return t('common.unauthorized');
  }

  async create(payload: Record<string, unknown>, errorMessages?: { createFailed: string }): Promise<IApiResponse<unknown>> {
    const createFailed = errorMessages?.createFailed ?? this.defaultMessages.createFailed ?? t('crud.createFailed');
    try {
      const uid = this.requireAuthUserId();
      if (uid === '') {
        return ErrorResponse({ message: this.unauthorizedMessage(), code: 'UNAUTHORIZED' });
      }

      const payloadWithScope = { ...payload };
      if (uid && this.requireAuthUserIdScope === true) {
        payloadWithScope.userId = new mongoose.Types.ObjectId(uid);
      }

      const prepared = this.transformCreatePayload(payloadWithScope);
      const created = await this.model.create(prepared as Parameters<Model<TDoc>['create']>[0]);
      const doc = Array.isArray(created) ? created[0]! : created;
      if (this.hiddenFields.length === 0) return SuccessResponse(doc);
      return SuccessResponse(stripHiddenFields(doc.toObject(), this.hiddenFields));
    } catch (error) {
      return HandleServiceError(error, { fallbackMessage: createFailed, context: 'BaseCrudService.create' });
    }
  }

  async getAllPaginated(
    baseFilter: FilterQuery<TDoc>,
    options: {
      limit?: number;
      page?: number;
      projection?: string | Record<string, 0 | 1 | boolean> | null;
      sort?: Record<string, 1 | -1>;
      populate?: CrudPopulate;
      lean?: boolean;
    },
    errorMessages?: { listFailed: string }
  ): Promise<IApiResponse<PaginatedList<unknown>>> {
    const listFailed = errorMessages?.listFailed ?? this.defaultMessages.listFailed ?? t('crud.listFailed');
    try {
      const uid = this.requireAuthUserId();
      if (uid === '') {
        return ErrorResponse({ message: this.unauthorizedMessage(), code: 'UNAUTHORIZED' });
      }

      const limit = clampListLimit(options.limit);
      const mergedFilter = this.withAuthScope(baseFilter, uid);
      const total = await this.model.countDocuments(mergedFilter as FilterQuery<unknown>);

      const skip = listOffsetFromPage(options.page, limit);

      const sort = options.sort ?? { createdAt: -1, _id: -1 };
      let q: any = this.model.find(mergedFilter).sort(sort);
      const projection = resolveCrudProjection(options.projection, this.hiddenFields);
      if (projection) {
        q = q.select(projection);
      }
      if (options.populate) {
        q = q.populate(options.populate as any);
      }
      q = this.augmentListQuery(q);

      const fetchLimit = limit + 1;
      const useLean = options.lean !== false;
      const docs = useLean ? await q.skip(skip).limit(fetchLimit).lean().exec() : await q.skip(skip).limit(fetchLimit).exec();

      const hasMore = docs.length > limit;
      const items = stripHiddenFields(hasMore ? docs.slice(0, limit) : docs, this.hiddenFields);

      return SuccessResponse<PaginatedList<unknown>>({
        items,
        hasMore,
        total,
        ...paginatedListMeta(skip, limit)
      });
    } catch (error) {
      return HandleServiceError<PaginatedList<unknown>>(error, { fallbackMessage: listFailed, context: 'BaseCrudService.getAllPaginated' });
    }
  }

  /**
   * Sayfalamasız liste — filtre + isteğe bağlı sort/populate.
   * `lean: false` Mongoose dokümanı döner (ör. `.save()` için).
   */
  async find(baseFilter: FilterQuery<TDoc>, options?: CrudFindListOptions, errorMessages?: CrudFindErrorMessages): Promise<IApiResponse<unknown[]>> {
    const findFailed = errorMessages?.findFailed ?? this.defaultMessages.findFailed ?? this.defaultMessages.listFailed ?? t('crud.listFailed');
    try {
      const uid = this.requireAuthUserId();
      if (uid === '') {
        return ErrorResponse({ message: this.unauthorizedMessage(), code: 'UNAUTHORIZED' });
      }

      const mergedFilter = this.withAuthScope(baseFilter, uid);
      const sort = options?.sort ?? { createdAt: -1, _id: -1 };
      let q: any = this.model.find(mergedFilter).sort(sort);
      const projection = resolveCrudProjection(options?.projection, this.hiddenFields);
      if (projection) {
        q = q.select(projection);
      }
      if (options?.populate) {
        q = q.populate(options.populate as any);
      }
      if (options?.limit != null && options.limit >= 0) {
        q = q.limit(options.limit);
      }
      q = this.augmentListQuery(q);

      const lean = options?.lean !== false;
      const docs = lean ? await q.lean().exec() : await q.exec();

      return SuccessResponse(stripHiddenFields(docs, this.hiddenFields));
    } catch (error) {
      return HandleServiceError<unknown[]>(error, { fallbackMessage: findFailed, context: 'BaseCrudService.find' });
    }
  }

  async findOne(
    baseFilter: FilterQuery<TDoc>,
    options?: {
      projection?: string | Record<string, 0 | 1 | boolean> | null;
      populate?: CrudPopulate;
      lean?: boolean;
    },
    errorMessages?: { findFailed?: string; notFound?: string }
  ): Promise<IApiResponse<unknown>> {
    const findFailed = errorMessages?.findFailed ?? this.defaultMessages.findFailed ?? this.defaultMessages.listFailed ?? t('crud.listFailed');
    const notFoundMsg = errorMessages?.notFound ?? this.defaultMessages.notFound ?? t('crud.notFound');
    try {
      const uid = this.requireAuthUserId();
      if (uid === '') {
        return ErrorResponse({ message: this.unauthorizedMessage(), code: 'UNAUTHORIZED' });
      }

      const mergedFilter = this.withAuthScope(baseFilter, uid);
      let q: any = this.model.findOne(mergedFilter);
      const projection = resolveCrudProjection(options?.projection, this.hiddenFields);
      if (projection) {
        q = q.select(projection);
      }
      if (options?.populate) {
        q = q.populate(options.populate as any);
      }

      const lean = options?.lean !== false;
      const doc = lean ? await q.lean().exec() : await q.exec();

      if (!doc) {
        return ErrorResponse({ message: notFoundMsg, code: 'NOT_FOUND' });
      }
      return SuccessResponse(stripHiddenFields(doc, this.hiddenFields));
    } catch (error) {
      return HandleServiceError(error, { fallbackMessage: findFailed, context: 'BaseCrudService.findOne' });
    }
  }

  async getById(
    id: string,
    extraFilter: FilterQuery<TDoc> = {},
    options?: { projection?: string | Record<string, 0 | 1 | boolean> | null; populate?: CrudPopulate; lean?: boolean },
    errorMessages?: { getByIdFailed: string; notFound?: string }
  ): Promise<IApiResponse<unknown>> {
    const getByIdFailed = errorMessages?.getByIdFailed ?? this.defaultMessages.getByIdFailed ?? t('crud.getByIdFailed');
    const notFoundMsg = errorMessages?.notFound ?? this.defaultMessages.notFound ?? t('crud.notFound');
    try {
      const uid = this.requireAuthUserId();
      if (uid === '') {
        return ErrorResponse({ message: this.unauthorizedMessage(), code: 'UNAUTHORIZED' });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return ErrorResponse({ message: notFoundMsg, code: 'NOT_FOUND' });
      }

      const scopedFilter = this.withAuthScope(extraFilter, uid);
      let q: any = this.model.findOne({ _id: id, ...scopedFilter } as FilterQuery<TDoc>);
      const projection = resolveCrudProjection(options?.projection, this.hiddenFields);
      if (projection) {
        q = q.select(projection);
      }
      if (options?.populate) {
        q = q.populate(options.populate as any);
      }
      q = this.augmentDetailQuery(q);
      const useLean = options?.lean !== false;
      const doc = useLean ? await q.lean().exec() : await q.exec();
      if (!doc) {
        return ErrorResponse({ message: notFoundMsg, code: 'NOT_FOUND' });
      }
      return SuccessResponse(stripHiddenFields(doc, this.hiddenFields));
    } catch (error) {
      return HandleServiceError(error, { fallbackMessage: getByIdFailed, context: 'BaseCrudService.getById' });
    }
  }

  async updateById(
    id: string,
    payload: Record<string, unknown>,
    extraFilter: FilterQuery<TDoc> = {},
    errorMessages?: { updateFailed: string; notFound?: string; successUiMessage?: string },
    opts?: { allowUserIdInPayload?: boolean }
  ): Promise<IApiResponse<unknown>> {
    const updateFailed = errorMessages?.updateFailed ?? this.defaultMessages.updateFailed ?? t('crud.updateFailed');
    const notFoundMsg = errorMessages?.notFound ?? this.defaultMessages.notFound ?? t('crud.notFound');
    try {
      const uid = this.requireAuthUserId();
      if (uid === '') {
        return ErrorResponse({ message: this.unauthorizedMessage(), code: 'UNAUTHORIZED' });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return ErrorResponse({ message: notFoundMsg, code: 'NOT_FOUND' });
      }
      const sanitized = { ...payload };
      if (!opts?.allowUserIdInPayload) {
        delete sanitized.userId;
      }
      const scopedFilter = this.withAuthScope(extraFilter, uid);
      let q: any = this.model.findOneAndUpdate({ _id: id, ...scopedFilter } as FilterQuery<TDoc>, { $set: sanitized } as UpdateQuery<TDoc>, {
        new: true,
        runValidators: true
      });
      const projection = resolveCrudProjection(undefined, this.hiddenFields);
      if (projection) {
        q = q.select(projection);
      }
      const updated = await q.lean().exec();
      if (!updated) {
        return ErrorResponse({ message: notFoundMsg, code: 'NOT_FOUND' });
      }
      return SuccessResponse(
        stripHiddenFields(updated, this.hiddenFields),
        errorMessages?.successUiMessage ?? this.defaultMessages.successUiMessage
      );
    } catch (error) {
      return HandleServiceError(error, { fallbackMessage: updateFailed, context: 'BaseCrudService.updateById' });
    }
  }

  async deleteById(
    id: string,
    extraFilter: FilterQuery<TDoc> = {},
    errorMessages?: { deleteFailed: string; notFound?: string; successMessage?: string },
    /** `onDeleted`: called with the deleted record (service `afterDelete`); a throw becomes the response, the delete stays. */
    opts?: { onDeleted?: (row: Record<string, unknown>) => Promise<void> | void; context?: string }
  ): Promise<IApiResponse<null>> {
    const deleteFailed = errorMessages?.deleteFailed ?? this.defaultMessages.deleteFailed ?? t('crud.deleteFailed');
    const notFoundMsg = errorMessages?.notFound ?? this.defaultMessages.notFound ?? t('crud.notFound');
    const successMessage = errorMessages?.successMessage ?? this.defaultMessages.successMessage ?? t('crud.deleteSuccess');
    try {
      const uid = this.requireAuthUserId();
      if (uid === '') {
        return ErrorResponse({ message: this.unauthorizedMessage(), code: 'UNAUTHORIZED' });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return ErrorResponse({ message: notFoundMsg, code: 'NOT_FOUND' });
      }
      const scopedFilter = this.withAuthScope(extraFilter, uid);
      const deleted = await this.model
        .findOneAndDelete({ _id: id, ...scopedFilter } as FilterQuery<TDoc>)
        .lean()
        .exec();
      if (!deleted) {
        return ErrorResponse({ message: notFoundMsg, code: 'NOT_FOUND' });
      }
      if (opts?.onDeleted) {
        try {
          await opts.onDeleted(deleted as Record<string, unknown>);
        } catch (error) {
          return HandleServiceError(error, { context: opts.context ?? 'BaseCrudService.deleteById.onDeleted' });
        }
      }
      return SuccessResponse(null, successMessage);
    } catch (error) {
      return HandleServiceError(error, { fallbackMessage: deleteFailed, context: 'BaseCrudService.deleteById' });
    }
  }
}
