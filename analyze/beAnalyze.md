Backend Stack Scope Rule

Bu dokümandaki backend standartları şu stack için geçerlidir:

Express + Mongo/Mongoose + TypeScript

Node.js backend model discovery (güncel yapı):
- `src/models` zorunlu değildir.
- Mongoose model/scheme dosyaları `src/modules/**` altında bulunabilir.
- Özellikle `*.model.ts` dosyaları `src/modules/<module>/` içinde taranmalıdır.
- Aşağıdaki yapı geçerli kabul edilmelidir:
  - `src/core/**` (errors/response/middleware/auth/pagination/services/logging/schema/types)
  - `src/modules/**` (transactions, daily-portfolio, users, symbols, symbol-types, notifications, user-watch-list, auth, integrations, asset, logs, coins, test-firebase)
  - `(models/ yok)` durumu Node/Mongoose için validdir.

Bu dokümanda geçen static core bootstrap dosyaları da yalnızca bu stack için kullanılmalıdır.

Static core bootstrap dosyaları:
• pagination.helper.ts
• response.helper.ts
• error.helper.ts
• error-codes.ts
• logger.ts
• api-contract.ts

Kural:
• Bu dosyalar yalnızca Express + Mongoose backend generator tarafından kullanılır.
• Başka backend stack’leri bu dosyaları reuse etmez.
• .NET, Entity Framework, TypeORM, Prisma gibi stack’ler kendi infrastructure standardına sahip olmalıdır.
• Generator önce backend stack’i detect eder.
• Stack detection sonucuna göre doğru asset setini seçer.
• Stack’e ait olmayan core dosyaları hedef projeye copy edilmez.
• Static core dosyalar dynamic template değildir.
• Static core dosyalar Handlebars ile render edilmez.
• Static core dosyalar module/entity bağımlı değildir.

Önerilen asset ayrımı:

generator-assets/
express-mongoose/
core/
errors/
logging/
pagination/
response/
types/

dotnet-ef/
core/

typeorm/
core/

⸻

Ana Kural

Raw model dosyası doğrudan template’e verilmez.

Akış:

Project Path
↓
Model Discovery
↓
Model Parse
↓
NormalizedModel
↓
Template Context
↓
Generation Queue
↓
Safe File Write

⸻

Proje Açılış Akışı

Uygulama ilk açıldığında kullanıcı proje root path’i seçer.

Generator: 1. Proje klasörünü tarar 2. Backend stack’i detect eder 3. Stack Express + Mongoose + TypeScript ise Express backend generator aktif olur 4. models veya modules altındaki model dosyalarını bulur 5. Desteklenen model dosyalarını listeler 6. Kullanıcı generate/update edilecek modeli seçer 7. Model parse edilir 8. NormalizedModel oluşturulur 9. Seçilen backend option’larına göre dosyalar üretilir

⸻

Backend Module Dosya Standardı

Her module altında 9 dosya oluşur veya güncellenir:

src/modules/<module-name>/
<module-name>.model.ts
<module-name>.crud.ts
<module-name>.filters.ts
<module-name>.types.ts
<module-name>.service.ts
<module-name>.service.admin.ts   (opsiyonel)
<module-name>.schema.ts
<module-name>.routes.ts
<module-name>.routes.admin.ts    (opsiyonel)

Not:
- `<module-name>` kebab-case olmalıdır (örn. `user-watch-list`, `symbol-types`).
- Tüm artifact’lar **aynı module klasöründe** co-located olmalıdır.

⸻

Naming Standard

Generator hiçbir yerde manuel string concat ile isim üretmez.

Zorunlu helper’lar:

camelCase()
pascalCase()
kebabCase()
pluralize()
singularize()

Örnek:

userWatchList
↓
user-watch-list
↓
UserWatchList
↓
userWatchLists

Output:

camelName: userWatchList
pascalName: UserWatchList
kebabName: user-watch-list
pluralCamelName: userWatchLists

⸻

Generation Order

Dosyalar dependency sırasına göre üretilmelidir. 1. model 2. crud 3. filters 4. types 5. service 6. admin.service 7. schema 8. routes 9. routes.admin

Dependency:

routes → schema + service
service → filters + crud
crud → model
filters → types
schema → types

⸻

Safe Update Standard

Generator mevcut dosyayı güncellerken custom kodları silmemelidir.

Standart custom block marker’ları:

// <custom-imports>
// </custom-imports>

// <custom-types>
// </custom-types>

// <custom-methods>
// </custom-methods>

// <custom-routes>
// </custom-routes>

// <custom-schema>
// </custom-schema>

Update akışı: 1. Mevcut dosya okunur 2. Custom block içerikleri extract edilir 3. Yeni template render edilir 4. Custom block içerikleri yeni dosyaya geri merge edilir 5. Dosya yazılır

Kural:

Generated code overwrite edilebilir
Custom block overwrite edilemez

⸻

NormalizedModel Standardı

type NormalizedModel = {
name: string;
camelName: string;
pascalName: string;
kebabName: string;
pluralCamelName: string;

fields: NormalizedField[];

ownership?: {
field: string;
normalApiFromAuth: boolean;
adminApiBodyAllowed: boolean;
adminApiFilterable: boolean;
};

indexes?: NormalizedIndex[];

timestamps?: {
createdAt: boolean;
updatedAt: boolean;
};
};

type NormalizedField = {
name: string;

type:
| ‘string’
| ‘number’
| ‘boolean’
| ‘date’
| ‘objectId’
| ‘decimal’
| ‘array’
| ‘object’;

required: boolean;
nullable?: boolean;

filter?: {
enabled: boolean;
mode: ‘regex’ | ‘exact’ | ‘objectId’ | ‘boolean’ | ‘number’ | ‘date’;
};

relation?: {
type: ‘oneToOne’ | ‘oneToMany’ | ‘manyToOne’ | ‘manyToMany’;
target: string;
foreignKey?: string;
displayField?: string;
};
};

type NormalizedIndex = {
fields: string[];
unique?: boolean;
};

⸻

Ownership Field Standard

Örnek ownership field:

userId

Normal Endpoint Davranışı:
• userId body’den alınmaz
• auth context veya BaseCrudService üzerinden set edilir
• update payload içinden userId silinir

Admin Endpoint Davranışı:
• userId body’den alınabilir
• userId filter olarak kullanılabilir
• userId create işleminde required olabilir
• userId update işleminde optional olabilir

⸻

Relation / ObjectId Standard

Eğer field objectId veya relation ise service içinde string → ObjectId dönüşümü yapılır.

Eski kullanım yapılmaz:

new mongoose.Types.ObjectId(id)

Standart kullanım:

import { Types } from ‘mongoose’;

Types.ObjectId.createFromHexString(id);

Create örneği:

export async function create(data: IUserWatchListInput & { userId: string }) {
const { userId, …rest } = data;

return userWatchListAdminCrud.create({
…rest,
userId: Types.ObjectId.createFromHexString(userId)
});
}

Update örneği:

if (typeof dataToUpdate.userId === ‘string’) {
dataToUpdate.userId = Types.ObjectId.createFromHexString(dataToUpdate.userId);
}

⸻

Express Core Static Bootstrap Files

Generator bazı ortak Express + Mongoose framework/core dosyalarını static asset olarak yönetir.

Bu dosyalar dynamic template değildir.
Handlebars render kullanılmaz.
Dosya yoksa hedef projeye copy edilir.
Dosya varsa overwrite edilmez.

Generator asset path:

src/generator-assets/express-mongoose/core/errors/error-codes.ts
src/generator-assets/express-mongoose/core/errors/error.helper.ts
src/generator-assets/express-mongoose/core/logging/logger.ts
src/generator-assets/express-mongoose/core/pagination/pagination.helper.ts
src/generator-assets/express-mongoose/core/response/response.helper.ts
src/generator-assets/express-mongoose/core/types/api-contract.ts

Target project path:

src/core/errors/error-codes.ts
src/core/errors/error.helper.ts
src/core/logging/logger.ts
src/core/pagination/pagination.helper.ts
src/core/response/response.helper.ts
src/core/types/api-contract.ts

Bootstrap kuralları:
• Yalnızca Express + Mongoose + TypeScript stack’inde çalışır.
• Dosya yoksa copy edilir.
• Dosya varsa overwrite edilmez.
• Static core files user-customizable kabul edilir.
• Static core files template değildir.
• Static core files module/entity bağımlı değildir.
• Bootstrap işlemleri loglanmalıdır.
• İleride bu dosyalar güncellenecekse overwrite yapılmaz; ayrı migration/versioning task açılır.

⸻

Pagination Standard

Tüm get-all endpointleri pagination + sorting desteklemelidir.

Service import standardı:

import {
extractListPagination,
resolveListSort
} from ‘@core/pagination/pagination.helper’;

GetAll standardı:

export async function getAll(filters?: UserWatchListListBodyUser) {
const { filters: filterObj, limit, page, sortBy, sortOrder } =
extractListPagination(filters as Record<string, unknown> | undefined);

const filtersQuery = buildUserWatchListFilterQuery(
(filterObj as GetUserWatchListFilters) || {}
);

return userWatchListCrud.getAllPaginated(filtersQuery, {
limit,
page,
sort: resolveListSort(sortBy, sortOrder, { createdAt: -1, \_id: -1 })
});
}

Default sort:

{ createdAt: -1, \_id: -1 }

⸻

Response Layer Standard

Route dosyaları için import standardı:

import { AtaResponse } from ‘@core/response/response.helper’;

Service dosyaları için kural:
- Service katmanı **response helper** kullanmaz.
- Service fonksiyonları CRUD instance’a delege eder ve `BaseCrudService` response contract’ını döndürür.
- Route katmanı `AtaResponse` ile result’ı HTTP response’a yazar.

Response layer davranışı:
• AtaResponse her response’a requestId uygular
• AtaResponse response event loglar
• SuccessResponse ortak success contract döndürür
• ErrorResponse ortak error contract döndürür
• InternalServerErrorResponse, HandleServiceError üzerinden normalize eder
• ErrorResponse code mapping’i ErrorCodes üzerinden yapar
• Plain text ve HTML response yardımcıları aynı helper katmanında yer alır

⸻

Error Layer Standard

Error layer dosyaları:

src/core/errors/error-codes.ts
src/core/errors/error.helper.ts

Davranış:
• error-codes.ts HTTP/domain response code map için tek kaynak olmalıdır
• error.helper.ts service katmanındaki hataları IApiResponse formatına normalize eder
• Mongo validation, cast, duplicate key, JWT, rate limit, timeout ve DB unavailable hataları burada normalize edilir
• Tüm service error logları request context ile birlikte yapılır

⸻

CRUD File Standard

Dosya:

src/modules/<module-name>/<module-name>.crud.ts

Amaç:

BaseCrudService üzerinden normal ve admin CRUD instance üretir.

Template davranışı:

import { BaseCrudService } from '@core/services/base-crud.service';
import type { Model } from 'mongoose';
import { t } from '@helpers';

// module-local model import (co-located layout)
import { <PascalModelExport>, type I<PascalModelType> } from './<module-name>.model';

class UserWatchListCrud extends BaseCrudService {
constructor(requireAuthUserId: boolean = false) {
super(
UserWatchList as unknown as Model,
{
listFailed: t(‘userWatchList.getAllFailed’),
getByIdFailed: t(‘userWatchList.getByIdFailed’),
createFailed: t(‘userWatchList.createFailed’),
updateFailed: t(‘userWatchList.updateFailed’),
deleteFailed: t(‘userWatchList.deleteFailed’),
notFound: t(‘userWatchList.notFoundOrUnauthorized’),
successMessage: t(‘userWatchList.deleteSuccess’)
},
requireAuthUserId
);
}
}

export const userWatchListCrud = new UserWatchListCrud(true);
export const userWatchListAdminCrud = new UserWatchListCrud();

Kural:

normal crud → requireAuthUserId true (protected + `userId` varsa)
admin crud → requireAuthUserId false (Include Admin API açıksa her zaman üretilir)

Notlar:

- Generator’ın ürettiği CRUD çıktısı bu standarda uymak zorundadır.
- Legacy/minimal CRUD output (obje literal: `getAll/getById/create/update/remove`) **yanlıştır** ve BUG-004 olarak takip edilmelidir.
- Custom block marker’ları (`// <custom-imports>`, `// <custom-methods>`) CRUD dosyasında bulunmalı ve update modunda korunmalıdır.

⸻

Filters File Standard

Dosya:

src/modules/<module-name>/<module-name>.filters.ts

Amaç:

GetAll filtrelerini Mongo query objesine dönüştürür.

Kural:

string + regex filter → { $regex, $options: ‘i’ }
objectId filter → Types.ObjectId.createFromHexString(value)
boolean → exact
number → exact
date → date query

Örnek:

import { Types } from ‘mongoose’;
import type { GetUserWatchListFilters } from ‘./userWatchList.types’;

export type UserWatchListFilterInput = GetUserWatchListFilters & {
userId?: string;
};

export function buildUserWatchListFilterQuery(
filters: UserWatchListFilterInput
): Record<string, unknown> {
const query: Record<string, unknown> = {};

if (filters.\_id) {
query.\_id = Types.ObjectId.createFromHexString(filters.\_id);
}

if (filters.watchValue) {
query.watchValue = { $regex: filters.watchValue, $options: ‘i’ };
}

if (filters.userId) {
query.userId = Types.ObjectId.createFromHexString(filters.userId);
}

return query;
}

⸻

Types File Standard

Dosya:

src/modules/<module-name>/<module-name>.types.ts

Amaç:
• Entity interface
• Input DTO
• Filter DTO
• User/Admin list body type

Kural:

Entity interface → DB shape
Input DTO → body payload shape
Ownership field → Input DTO içinde olmaz
Admin body → ownership field ekleyebilir

Örnek:

import { Types } from ‘mongoose’;
import type { ListPaginationBody } from ‘@core/pagination/pagination.helper’;

export interface IUserWatchList {
\_id?: string;
userId: Types.ObjectId;
watchValue: string;
}

export interface IUserWatchListInput {
\_id?: string;
watchValue: string;
}

export interface GetUserWatchListFilters {
\_id?: string;
watchValue?: string;
}

export type UserWatchListListBody =
GetUserWatchListFilters &
ListPaginationBody;

⸻

Schema File Standard

Dosya:

src/modules/<module-name>/<module-name>.schema.ts

Amaç:

Zod validation schema üretir.

Kurallar (güncel):
- `GetAll` için:
  - `<Entity>GetAllFilterSchema` searchable alanlardan oluşur ve `.strict()`tir
  - `<Entity>GetAllBodySchema = <Entity>GetAllFilterSchema.merge(ListPaginationBodySchema)`
- `Params` için:
  - `<Entity>MongoIdParamSchema = z.object({ id: z.string().min(1) }).strict()`
- `Create/Update` için:
  - `<Entity>CreateBodySchema` ve `<Entity>UpdateBodySchema` üretilir
  - required string alanlar `z.string().min(1)` olmalıdır

Örnek:

import { z } from ‘zod’;
import { ListPaginationBodySchema } from ‘@core/schema/list-pagination.schema’;

const UserWatchListGetAllFilterSchema = z
.object({
\_id: z.string().optional(),
watchValue: z.string().optional()
})
.strict();

export const UserWatchListGetAllBodySchema =
UserWatchListGetAllFilterSchema.merge(ListPaginationBodySchema);

export const UserWatchListMongoIdParamSchema = z.object({
id: z.string().min(1)
}).strict();

export const UserWatchListCreateBodySchema = z
.object({
watchValue: z.string().min(1)
})
.strict();

export const UserWatchListUpdateBodySchema = z
.object({
watchValue: z.string().optional()
})
.strict();

// Legacy admin/user schema variants removed in generator standard.

⸻

Normal Service Standard

Dosya:

src/modules/<module-name>/<module-name>.service.ts

Kural:
• auth userId body’den alınmaz
• create payload içine userId elle eklenmez
• update sırasında userId silinir
• getAll pagination + sorting kullanır
• custom methods korunur

Örnek:

import type {
GetUserWatchListFilters,
IUserWatchListInput,
UserWatchListListBodyUser
} from ‘./userWatchList.types’;
import {
extractListPagination,
resolveListSort
} from ‘@core/pagination/pagination.helper’;
import { buildUserWatchListFilterQuery } from ‘./userWatchList.filters’;
import { userWatchListCrud } from ‘./userWatchList.crud’;

export async function getAll(filters?: UserWatchListListBodyUser) {
const { filters: filterObj, limit, page, sortBy, sortOrder } =
extractListPagination(filters as Record<string, unknown> | undefined);

const filtersQuery = buildUserWatchListFilterQuery(
(filterObj as GetUserWatchListFilters) || {}
);

return userWatchListCrud.getAllPaginated(filtersQuery, {
limit,
page,
sort: resolveListSort(sortBy, sortOrder, { createdAt: -1, \_id: -1 })
});
}

export async function getById(id: string) {
return userWatchListCrud.getById(id);
}

export async function create(data: IUserWatchListInput) {
const dataToSave: Record<string, unknown> = { …data };

return userWatchListCrud.create(dataToSave);
}

export async function update(id: string, data: Partial) {
const dataToUpdate: Record<string, unknown> = { …data };

delete dataToUpdate.userId;

return userWatchListCrud.updateById(id, dataToUpdate, {});
}

export async function deleteUserWatchList(id: string) {
return userWatchListCrud.deleteById(id);
}

//
// Custom methods
//

⸻

Admin Service Standard

Dosya:

<module-name>.service.admin.ts

Kural:
• admin filter içinde userId olabilir
• admin create içinde userId required olabilir
• admin update içinde userId optional olabilir
• ObjectId alanları service içinde convert edilir
• getAll pagination + sorting kullanır
• custom methods korunur

Örnek:

import type {
GetUserWatchListFilters,
IUserWatchListInput,
UserWatchListListBodyAdmin
} from ‘./userWatchList.types’;
import {
extractListPagination,
resolveListSort
} from ‘@core/pagination/pagination.helper’;
import type { IUserWatchListModel } from ‘./userWatchList.model’;
import { Types, type FilterQuery } from ‘mongoose’;
import { buildUserWatchListFilterQuery } from ‘./userWatchList.filters’;
import { userWatchListAdminCrud } from ‘./userWatchList.crud’;

export async function getAll(filters?: UserWatchListListBodyAdmin) {
const { filters: filterObj, limit, page, sortBy, sortOrder } =
extractListPagination(filters as Record<string, unknown> | undefined);

const filtersQuery = buildUserWatchListFilterQuery(
(filterObj as GetUserWatchListFilters & { userId?: string }) || {}
) as FilterQuery;

return userWatchListAdminCrud.getAllPaginated(filtersQuery, {
limit,
page,
sort: resolveListSort(sortBy, sortOrder, { createdAt: -1, \_id: -1 })
});
}

export async function getById(id: string) {
return userWatchListAdminCrud.getById(id);
}

export async function create(data: IUserWatchListInput & { userId: string }) {
const { userId, …rest } = data;

return userWatchListAdminCrud.create({
…rest,
userId: Types.ObjectId.createFromHexString(userId)
});
}

export async function update(
id: string,
data: Partial & { userId?: string }
) {
const dataToUpdate: Record<string, unknown> = { …data };

if (typeof dataToUpdate.userId === ‘string’) {
dataToUpdate.userId = Types.ObjectId.createFromHexString(dataToUpdate.userId);
}

return userWatchListAdminCrud.updateById(
id,
dataToUpdate,
{},
undefined,
{ allowUserIdInPayload: true }
);
}

export async function deleteUserWatchList(id: string) {
return userWatchListAdminCrud.deleteById(id);
}

//
// Custom methods
//

⸻

Routes Standard

Dosya İsimlendirme Kuralları:
• Normal route dosyası: userWatchList.routes.ts
• Admin route dosyası: userWatchList.routes.admin.ts

Middleware Kullanımı:
• Normal route: authMiddleware
• Admin route: authMiddleware, adminAuthMiddleware

Standart endpointler:

POST /get-all
GET /:id
POST /create
POST /update/:id
DELETE /:id

Normal Route örneği:

import express, { Router } from ‘express’;
import _ as userWatchListService from ‘./userWatchList.service’;
import { AtaResponse } from ‘@core/response/response.helper’;
import { authMiddleware } from ‘@middlewares’;
import { validate } from ‘@core’;
import _ as TSchema from ‘./userWatchList.schema’;

const router: Router = express.Router();

router.use(authMiddleware);

router.post(
‘/get-all’,
validate({ body: TSchema.UserWatchListGetAllBodySchema }),
async (req, res) => {
const result = await userWatchListService.getAll(req.body);
AtaResponse(res, result);
}
);

router.get(
‘/:id’,
validate({ params: TSchema.UserWatchListMongoIdParamSchema }),
async (req, res) => {
const result = await userWatchListService.getById(req.params.id);
AtaResponse(res, result);
}
);

router.post(
‘/create’,
validate({ body: TSchema.UserWatchListCreateBodySchema }),
async (req, res) => {
const result = await userWatchListService.create(req.body);
AtaResponse(res, result);
}
);

router.post(
‘/update/:id’,
validate({
params: TSchema.UserWatchListMongoIdParamSchema,
body: TSchema.UserWatchListUpdateBodySchema
}),
async (req, res) => {
const result = await userWatchListService.update(req.params.id, req.body);
AtaResponse(res, result);
}
);

router.delete(
‘/:id’,
validate({ params: TSchema.UserWatchListMongoIdParamSchema }),
async (req, res) => {
const result = await userWatchListService.deleteUserWatchList(req.params.id);
AtaResponse(res, result);
}
);

//
//

export default router;

Admin Route örneği:

import express, { Router } from ‘express’;
import _ as userWatchListServiceAdmin from ‘./userWatchList.admin.service’;
import { AtaResponse } from ‘@core/response/response.helper’;
import { authMiddleware, adminAuthMiddleware } from ‘@middlewares’;
import { validate } from ‘@core’;
import _ as TSchema from ‘./userWatchList.schema’;

const router: Router = express.Router();

router.use(authMiddleware);
router.use(adminAuthMiddleware);

router.post(
‘/get-all’,
validate({ body: TSchema.UserWatchListGetAllBodySchema }),
async (req, res) => {
const result = await userWatchListServiceAdmin.getAll(req.body);
AtaResponse(res, result);
}
);

router.get(
‘/:id’,
validate({ params: TSchema.UserWatchListMongoIdParamSchema }),
async (req, res) => {
const result = await userWatchListServiceAdmin.getById(req.params.id);
AtaResponse(res, result);
}
);

router.post(
‘/create’,
validate({ body: TSchema.UserWatchListCreateBodySchema }),
async (req, res) => {
const result = await userWatchListServiceAdmin.create(req.body);
AtaResponse(res, result);
}
);

router.post(
‘/update/:id’,
validate({
params: TSchema.UserWatchListMongoIdParamSchema,
body: TSchema.UserWatchListUpdateBodySchema
}),
async (req, res) => {
const result = await userWatchListServiceAdmin.update(req.params.id, req.body);
AtaResponse(res, result);
}
);

router.delete(
‘/:id’,
validate({ params: TSchema.UserWatchListMongoIdParamSchema }),
async (req, res) => {
const result = await userWatchListServiceAdmin.deleteUserWatchList(req.params.id);
AtaResponse(res, result);
}
);

//
//

export default router;

⸻

Model File Standard

Dosya:

userWatchList.model.ts

Kurallar:
• Mongoose schema üretir
• interface üretir
• relation varsa ref ekler
• index varsa schema index ekler
• timestamps metadata’ya göre oluşur

Örnek:

import mongoose, { Document, Schema } from ‘mongoose’;

export interface IUserWatchListModel extends Document {
userId: Schema.Types.ObjectId;
watchValue: string;
}

const UserWatchListSchema = new Schema(
{
userId: {
type: Schema.Types.ObjectId,
required: true,
ref: ‘User’
},
watchValue: {
type: String,
required: true
}
},
{
timestamps: { createdAt: true, updatedAt: false },
versionKey: false,
toJSON: {
transform: function (doc, ret) {
const obj = ret as Record<string, any>;
return obj;
}
}
}
);

UserWatchListSchema.index(
{ userId: 1, watchValue: 1 },
{ unique: true }
);

export const UserWatchList =
mongoose.model(‘UserWatchList’, UserWatchListSchema);

⸻

Template Standard

Template engine:

Handlebars

Template içine business logic yazılmaz.

Yanlış:

{{#if (eq type “string”)}}string{{/if}}

Doğru:

{{tsType type}}

Logic helper veya mapper katmanında olmalıdır.

⸻

Generator Config Mapping

Mapping = seçilen option → hangi template → output path.

{
“backend”: {
“options”: {
“model”: {
“template”: “backend/express/model.ts.hbs”,
“output”: “src/modules/{{kebabCase name}}/{{kebabCase name}}.model.ts”
},
“crud”: {
“template”: “backend/express/crud.ts.hbs”,
“output”: “src/modules/{{kebabCase name}}/{{kebabCase name}}.crud.ts”
},
“filters”: {
“template”: “backend/express/filters.ts.hbs”,
“output”: “src/modules/{{kebabCase name}}/{{kebabCase name}}.filters.ts”
},
“types”: {
“template”: “backend/express/types.ts.hbs”,
“output”: “src/modules/{{kebabCase name}}/{{kebabCase name}}.types.ts”
},
“service”: {
“template”: “backend/express/service.ts.hbs”,
“output”: “src/modules/{{kebabCase name}}/{{kebabCase name}}.service.ts”
},
“adminService”: {
“template”: “backend/express/service.admin.ts.hbs”,
“output”: “src/modules/{{kebabCase name}}/{{kebabCase name}}.service.admin.ts”
},
“schema”: {
“template”: “backend/express/schema.ts.hbs”,
“output”: “src/modules/{{kebabCase name}}/{{kebabCase name}}.schema.ts”
},
“routes”: {
“template”: “backend/express/routes.ts.hbs”,
“output”: “src/modules/{{kebabCase name}}/{{kebabCase name}}.routes.ts”
},
“adminRoutes”: {
“template”: “backend/express/routes.admin.ts.hbs”,
“output”: “src/modules/{{kebabCase name}}/{{kebabCase name}}.routes.admin.ts”
}
}
}
}

⸻

Backend Generator Checklist

[ ] Project path seçiliyor
[ ] Stack detection yapılıyor
[ ] Stack Express + Mongoose + TypeScript ise Express backend generator aktif oluyor
[ ] Model dosyaları taranıyor
[ ] Model parse ediliyor
[ ] NormalizedModel oluşuyor
[ ] Naming helper outputları hazırlanıyor
[ ] Relation/ObjectId alanlar tespit ediliyor
[ ] Ownership field tespit ediliyor
[ ] Filterable fields hazırlanıyor
[ ] Create fields hazırlanıyor
[ ] Update fields hazırlanıyor
[ ] Admin/User schema alanları ayrılıyor
[ ] Express core static bootstrap dosyaları kontrol ediliyor
[ ] Generation queue dependency sırasına göre kuruluyor
[ ] Dosyalar safe update ile yazılıyor
[ ] Custom blocks korunuyor

⸻

Final Backend Rules 1. Raw model template’e gitmez. 2. Her şey NormalizedModel üzerinden üretilir. 3. Backend module toplam 9 dosyadan oluşur. 4. Normal endpoint userId’yi body’den almaz. 5. Admin endpoint userId’yi body/filter üzerinden alabilir. 6. ObjectId conversion için Types.ObjectId.createFromHexString kullanılır. 7. Pagination + sorting tüm getAll endpointlerinde standarttır. 8. Template içinde business logic olmaz. 9. Custom methods/imports/routes/schema blokları silinmez. 10. Dosyalar dependency sırasına göre üretilir. 11. Static core bootstrap files stack bazlı yönetilir. 12. Stack dışı core dosyaları hedef projeye copy edilmez.

⸻

Logging & Error Handling Standard

Generator tüm kritik işlemleri loglamalıdır.

Amaç:
• generation flow takibi
• hata ayıklama
• failed generation analizi
• update/debug kolaylığı

Loglama Kuralları

Her ana işlem başlangıcı ve sonucu loglanmalıdır.

Örnek:

[Generator] Project path selected
[Generator] Stack detected: express-mongoose
[Generator] Model discovery started
[Generator] Model parsed successfully
[Generator] NormalizedModel created
[Generator] Routes template rendered
[Generator] File written successfully

Hatalar standart formatta loglanmalıdır:

[Generator][Error]
step: service-generation
module: user-watch-list
file: userWatchList.service.ts
message: Failed to resolve relation field
stack: …

Generator Logger Standardı

Önerilen logger:

pino
veya
winston

Electron UI için ayrıca:
• console logging
• file logging
• renderer log stream

desteklenebilir.

⸻

Generation Checklist Logging

Aşağıdaki tüm adımlar success/fail olarak loglanmalıdır:

[ ] Project path selected
[ ] Stack detection completed
[ ] Model discovery completed
[ ] Model parsed
[ ] NormalizedModel created
[ ] Naming helper outputs generated
[ ] Relation/ObjectId fields resolved
[ ] Ownership field resolved
[ ] Filterable fields prepared
[ ] Create fields prepared
[ ] Update fields prepared
[ ] Admin/User schema fields resolved
[ ] Express core static bootstrap checked
[ ] Generation queue created
[ ] Templates rendered
[ ] Safe file write completed
[ ] Custom blocks merged

Hata Durumu

Bir step fail olursa:
• işlem durmalı
• step loglanmalı
• stack trace kaydedilmeli
• kullanıcıya anlamlı hata gösterilmeli

Örnek:

[Generator][Failed]
step: schema-generation
module: user-watch-list
reason: Missing ownership field metadata

⸻

Safe File Write Logging

Generator dosya yazarken şu durumları loglamalıdır:

CREATE FILE
UPDATE FILE
SKIP FILE
MERGE CUSTOM BLOCKS

Örnek:

[Generator] CREATE modules/user-watch-list/userWatchList.routes.ts
[Generator] UPDATE modules/user-watch-list/userWatchList.service.ts
[Generator] MERGE custom methods block

⸻

Custom Block Merge Logging

Custom block merge sırasında:
• bulunan marker sayısı
• merge edilen bloklar
• eksik marker warning’leri

loglanmalıdır.

Örnek:

[Generator] Custom block found:
[Generator] Custom block merged successfully
[Generator][Warning] Missing closing tag
