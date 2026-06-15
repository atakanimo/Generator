import mongoose, { type PopulateOptions, Document, FilterQuery, Model, UpdateQuery } from 'mongoose';
import type { IApiResponse } from '@core/types/api-contract';
import { SuccessResponse, ErrorResponse } from '@core/response/response.helper';
import { HandleServiceError } from '@core/errors/error.helper';
import { clampListLimit, listOffsetFromPage, paginatedListMeta, type PaginatedList } from '@core/pagination/pagination.helper';
import { getCurrentUserId } from '@utils/requestContext';
import { t } from '@helpers';

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

export abstract class BaseCrudService<TDoc extends Document & { createdAt?: Date }> {
  constructor(
    protected readonly model: Model<TDoc>,
    private readonly defaultMessages: CrudDefaultMessages = {},
    private readonly requireAuthUserIdScope: boolean = false
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
    return {
      ...filter,
      userId: new mongoose.Types.ObjectId(uid)
    } as FilterQuery<TDoc>;
  }

  private unauthorizedMessage(): string {
    return t('common.unauthorized');
  }

  async create(payload: Record<string, unknown>, errorMessages?: { createFailed: string }): Promise<IApiResponse<unknown>> {
    const createFailed = errorMessages?.createFailed ?? this.defaultMessages.createFailed ?? 'Create failed';
    try {
      const uid = this.requireAuthUserId();
      if (uid === '') {
        return ErrorResponse({ message: this.unauthorizedMessage(), code: 'UNAUTHORIZED' });
      }

      const payloadWithScope = { ...payload };
      if (uid) {
        payloadWithScope.userId = new mongoose.Types.ObjectId(uid);
      }

      const prepared = this.transformCreatePayload(payloadWithScope);
      const created = await this.model.create(prepared as Parameters<Model<TDoc>['create']>[0]);
      const doc = Array.isArray(created) ? created[0]! : created;
      return SuccessResponse(doc);
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
    },
    errorMessages?: { listFailed: string }
  ): Promise<IApiResponse<PaginatedList<unknown>>> {
    const listFailed = errorMessages?.listFailed ?? this.defaultMessages.listFailed ?? 'List failed';
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
      if (options.projection) {
        q = q.select(options.projection);
      }
      if (options.populate) {
        q = q.populate(options.populate as any);
      }
      q = this.augmentListQuery(q);

      const fetchLimit = limit + 1;
      const docs = await q.skip(skip).limit(fetchLimit).lean().exec();

      const hasMore = docs.length > limit;
      const items = hasMore ? docs.slice(0, limit) : docs;

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
    const findFailed = errorMessages?.findFailed ?? this.defaultMessages.findFailed ?? this.defaultMessages.listFailed ?? 'Find failed';
    try {
      const uid = this.requireAuthUserId();
      if (uid === '') {
        return ErrorResponse({ message: this.unauthorizedMessage(), code: 'UNAUTHORIZED' });
      }

      const mergedFilter = this.withAuthScope(baseFilter, uid);
      const sort = options?.sort ?? { createdAt: -1, _id: -1 };
      let q: any = this.model.find(mergedFilter).sort(sort);
      if (options?.projection) {
        q = q.select(options.projection);
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

      return SuccessResponse(docs);
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
    const findFailed = errorMessages?.findFailed ?? this.defaultMessages.findFailed ?? this.defaultMessages.listFailed ?? 'Find failed';
    const notFoundMsg = errorMessages?.notFound ?? this.defaultMessages.notFound ?? 'Not found';
    try {
      const uid = this.requireAuthUserId();
      if (uid === '') {
        return ErrorResponse({ message: this.unauthorizedMessage(), code: 'UNAUTHORIZED' });
      }

      const mergedFilter = this.withAuthScope(baseFilter, uid);
      let q: any = this.model.findOne(mergedFilter);
      if (options?.projection) {
        q = q.select(options.projection);
      }
      if (options?.populate) {
        q = q.populate(options.populate as any);
      }

      const lean = options?.lean !== false;
      const doc = lean ? await q.lean().exec() : await q.exec();

      if (!doc) {
        return ErrorResponse({ message: notFoundMsg, code: 'NOT_FOUND' });
      }
      return SuccessResponse(doc);
    } catch (error) {
      return HandleServiceError(error, { fallbackMessage: findFailed, context: 'BaseCrudService.findOne' });
    }
  }

  async getById(
    id: string,
    extraFilter: FilterQuery<TDoc> = {},
    options?: { projection?: string | Record<string, 0 | 1 | boolean> | null; populate?: CrudPopulate },
    errorMessages?: { getByIdFailed: string; notFound?: string }
  ): Promise<IApiResponse<unknown>> {
    const getByIdFailed = errorMessages?.getByIdFailed ?? this.defaultMessages.getByIdFailed ?? 'Get failed';
    const notFoundMsg = errorMessages?.notFound ?? this.defaultMessages.notFound ?? 'Not found';
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
      if (options?.projection) {
        q = q.select(options.projection);
      }
      if (options?.populate) {
        q = q.populate(options.populate as any);
      }
      q = this.augmentDetailQuery(q);
      const doc = await q.lean().exec();
      if (!doc) {
        return ErrorResponse({ message: notFoundMsg, code: 'NOT_FOUND' });
      }
      return SuccessResponse(doc);
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
    const updateFailed = errorMessages?.updateFailed ?? this.defaultMessages.updateFailed ?? 'Update failed';
    const notFoundMsg = errorMessages?.notFound ?? this.defaultMessages.notFound ?? 'Not found';
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
      const updated = await this.model
        .findOneAndUpdate({ _id: id, ...scopedFilter } as FilterQuery<TDoc>, { $set: sanitized } as UpdateQuery<TDoc>, {
          new: true,
          runValidators: true
        })
        .lean()
        .exec();
      if (!updated) {
        return ErrorResponse({ message: notFoundMsg, code: 'NOT_FOUND' });
      }
      return SuccessResponse(updated, errorMessages?.successUiMessage ?? this.defaultMessages.successUiMessage);
    } catch (error) {
      return HandleServiceError(error, { fallbackMessage: updateFailed, context: 'BaseCrudService.updateById' });
    }
  }

  async deleteById(
    id: string,
    extraFilter: FilterQuery<TDoc> = {},
    errorMessages?: { deleteFailed: string; notFound?: string; successMessage?: string }
  ): Promise<IApiResponse<null>> {
    const deleteFailed = errorMessages?.deleteFailed ?? this.defaultMessages.deleteFailed ?? 'Delete failed';
    const notFoundMsg = errorMessages?.notFound ?? this.defaultMessages.notFound ?? 'Not found';
    const successMessage = errorMessages?.successMessage ?? this.defaultMessages.successMessage;
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
      return SuccessResponse(null, successMessage);
    } catch (error) {
      return HandleServiceError(error, { fallbackMessage: deleteFailed, context: 'BaseCrudService.deleteById' });
    }
  }
}
