/**
 * Core asset tests (plan 5 P2, P4). Pure asset modules + real mongoose / bson from Varlik360's node_modules.
 * Run: node scripts/verify/test-core-assets.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { extractListPagination, resolveListSort } from '../../src/generator-assets/core/pagination/pagination.helper.ts';
import { toWire } from '../../src/generator-assets/core/response/wire.ts';
import { resolveCrudProjection, stripHiddenFields } from '../../src/generator-assets/core/services/crud-projection.ts';
import { applyAuthScope } from '../../src/generator-assets/core/services/crud-scope.ts';

const requireFromHost = createRequire('/Users/atakanatabey/Projects/VarlikALL/Varlik360/package.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mongoose = requireFromHost('mongoose') as typeof import('mongoose');
const { ObjectId, Decimal128 } = mongoose.Types;

const json = (value: unknown) => JSON.parse(JSON.stringify(value));

describe('extractListPagination (K2)', () => {
  it('reads nested filters and pagination', () => {
    const body = { filters: { status: 'active' }, page: 2, limit: 25, sortBy: ' name ', sortOrder: 'asc' };
    assert.deepEqual(extractListPagination(body), {
      filters: { status: 'active' },
      page: 2,
      limit: 25,
      sortBy: 'name',
      sortOrder: 'asc'
    });
  });

  it('flat body keys are not filters anymore (hard switch, G1)', () => {
    assert.deepEqual(extractListPagination({ status: 'active' }).filters, {});
  });

  it('empty / invalid input', () => {
    assert.deepEqual(extractListPagination(undefined), { filters: {} });
    assert.deepEqual(extractListPagination({ filters: ['x'], page: 'a', sortOrder: 'up' }), {
      filters: {},
      page: undefined,
      limit: undefined,
      sortBy: undefined,
      sortOrder: undefined
    });
  });

  it('does not share the caller filters object', () => {
    const filters = { a: 1 };
    const out = extractListPagination({ filters });
    out.filters.b = 2;
    assert.deepEqual(filters, { a: 1 });
  });
});

describe('resolveListSort', () => {
  it('maps id to _id (K1)', () => {
    assert.deepEqual(resolveListSort('id', 'asc', { createdAt: -1, _id: -1 }), { _id: 1 });
  });
  it('keeps other fields and falls back', () => {
    assert.deepEqual(resolveListSort('name', 'desc', { createdAt: -1 }), { name: -1 });
    assert.deepEqual(resolveListSort('  ', 'asc', { createdAt: -1, _id: -1 }), { createdAt: -1, _id: -1 });
  });
});

describe('toWire (K1, K5)', () => {
  const userId = new ObjectId();
  const rowId = new ObjectId();
  const itemId = new ObjectId();

  it('lean document: _id → id, nested populate, subdoc arrays, ObjectId refs, Decimal128, Date, Map', () => {
    const lean = {
      _id: rowId,
      userId: { _id: userId, email: 'a@b.c' },
      symbolTypeId: userId,
      items: [{ _id: itemId, qty: 1 }],
      value: Decimal128.fromString('1234.56'),
      rates: new Map([['USDTRY', 46.6]]),
      createdAt: new Date('2026-10-16T00:00:00.000Z')
    };
    assert.deepEqual(json(toWire(lean)), {
      id: rowId.toString(),
      userId: { id: userId.toString(), email: 'a@b.c' },
      symbolTypeId: userId.toString(),
      items: [{ id: itemId.toString(), qty: 1 }],
      value: '1234.56',
      rates: { USDTRY: 46.6 },
      createdAt: '2026-10-16T00:00:00.000Z'
    });
  });

  it('keeps an existing id and drops _id', () => {
    assert.deepEqual(json(toWire({ _id: rowId, id: 'custom' })), { id: 'custom' });
  });

  it('mongoose document: goes through toJSON (model transforms kept)', () => {
    const schema = new mongoose.Schema(
      {
        email: String,
        password: String,
        value: mongoose.Schema.Types.Decimal128,
        rates: { type: Map, of: Number },
        limits: new mongoose.Schema({ watchList: Number })
      },
      {
        versionKey: false,
        toJSON: {
          transform(_doc, ret) {
            delete (ret as Record<string, unknown>).password;
            return ret;
          }
        }
      }
    );
    const Model = mongoose.models.WireTest ?? mongoose.model('WireTest', schema);
    const doc = new Model({ email: 'a@b.c', password: 'hash', value: '9.90', rates: { EURTRY: 50 }, limits: { watchList: 10 } });
    const wire = json(toWire(doc)) as Record<string, unknown>;
    assert.equal(wire.id, doc._id.toString());
    assert.equal('_id' in wire, false);
    assert.equal('password' in wire, false);
    assert.equal(wire.value, '9.90');
    assert.deepEqual(wire.rates, { EURTRY: 50 });
    assert.equal(typeof (wire.limits as Record<string, unknown>).id, 'string');
    assert.equal((wire.limits as Record<string, unknown>).watchList, 10);
  });

  it('primitives, null and arrays pass through', () => {
    assert.equal(toWire(null), null);
    assert.equal(toWire('x'), 'x');
    assert.deepEqual(toWire([1, { _id: 'a' }]), [1, { id: 'a' }]);
  });
});

describe('crud-projection (G2)', () => {
  const hidden = ['password', 'otpCode'] as const;

  it('resolveCrudProjection', () => {
    assert.equal(resolveCrudProjection(undefined, hidden), '-password -otpCode');
    assert.equal(resolveCrudProjection('email name', hidden), 'email name');
    assert.equal(resolveCrudProjection(undefined, []), undefined);
  });

  it('stripHiddenFields: plain objects and arrays', () => {
    assert.deepEqual(stripHiddenFields({ email: 'a', password: 'h', otpCode: '1' }, hidden), { email: 'a' });
    assert.deepEqual(stripHiddenFields([{ password: 'h', n: 1 }], hidden), [{ n: 1 }]);
  });

  it('stripHiddenFields never mutates a mongoose document', () => {
    const Model = mongoose.models.WireTest ?? mongoose.model('WireTest', new mongoose.Schema({}));
    const doc = new Model({ email: 'a@b.c', password: 'hash' });
    assert.equal(stripHiddenFields(doc, hidden), doc);
    assert.equal(doc.get('password'), 'hash');
  });
});

describe('crud-scope (§2.1, G5)', () => {
  const uid = new ObjectId();
  const id = new ObjectId();

  it('false / no auth user: filter unchanged (copy)', () => {
    const filter = { name: 'a' };
    const out = applyAuthScope(filter, false, uid);
    assert.deepEqual(out, filter);
    assert.notEqual(out, filter);
    assert.deepEqual(applyAuthScope(filter, true, undefined), filter);
  });

  it('true: userId scope', () => {
    assert.deepEqual(applyAuthScope({ _id: id }, true, uid), { _id: id, userId: uid });
  });

  it("'self': own record, caller _id kept", () => {
    const scoped = applyAuthScope({}, 'self', uid);
    assert.deepEqual(scoped, { $and: [{}, { _id: uid }] });
    // getById / update / delete spread `{ _id: id, ...scoped }`: both conditions must hold.
    const byId = { _id: id, ...scoped } as Record<string, unknown>;
    assert.equal(byId._id, id);
    assert.deepEqual(byId.$and, [{}, { _id: uid }]);
  });
});

