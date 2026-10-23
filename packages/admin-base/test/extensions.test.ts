import { describe, expect, it } from 'vitest';
import {
  detailViewOptions,
  isColumnSortable,
  type CollectionAction,
  type FieldConfig,
  type ResourceAction
} from '../src/index.js';
import { collectionActionState, splitActions } from '../src/ui/actions/actions.js';

type Row = { id: string } & Record<string, unknown>;

describe('isColumnSortable', () => {
  const name: FieldConfig = { name: 'name', kind: 'string' };

  it('skaler alan varsayılan olarak sıralanır; ilişki ve dizi sıralanmaz', () => {
    expect(isColumnSortable({}, name)).toBe(true);
    expect(isColumnSortable({}, { name: 'userId', kind: 'relation', ref: 'users' })).toBe(false);
    expect(isColumnSortable({}, { name: 'tags', kind: 'string', isArray: true })).toBe(false);
  });

  it('alan ya da resource `sortable: false` ile kapatır; `true` ilişkiyi açmaz', () => {
    expect(isColumnSortable({}, { ...name, sortable: false })).toBe(false);
    expect(isColumnSortable({ sortable: false }, name)).toBe(false);
    expect(isColumnSortable({}, { name: 'userId', kind: 'relation', ref: 'users', sortable: true })).toBe(false);
  });
});

describe('detay görünümü ve aksiyon dağılımı', () => {
  const actions: ResourceAction<Row>[] = [
    { id: 'retry', label: 'Retry', placement: 'row' },
    { id: 'inspect', label: 'Inspect', placement: 'detail' },
    { id: 'export', label: 'Export', placement: 'toolbar' },
    { id: 'archive', label: 'Archive', placement: 'bulk' }
  ];

  it('`detail` aksiyonu detay drawer\'ını açar ve oraya gider', () => {
    expect(detailViewOptions<Row>({ actions })).toEqual({});
    const split = splitActions(actions, true);
    expect(split.rowActions.map(a => a.id)).toEqual(['retry']);
    expect(split.detailActions.map(a => a.id)).toEqual(['inspect']);
    expect(split.toolbarActions.map(a => a.id)).toEqual(['export']);
    expect(split.bulkActions.map(a => a.id)).toEqual(['archive']);
  });

  it('detay kapalıysa `detail` aksiyonları satırda kalır', () => {
    expect(detailViewOptions<Row>({ actions, detail: false })).toBeNull();
    const split = splitActions(actions, false);
    expect(split.rowActions.map(a => a.id)).toEqual(['retry', 'inspect']);
    expect(split.detailActions).toEqual([]);
  });

  it('aksiyon olmadan `detail: true` ya da ayar objesiyle açılır', () => {
    expect(detailViewOptions<Row>(undefined)).toBeNull();
    expect(detailViewOptions<Row>({})).toBeNull();
    expect(detailViewOptions<Row>({ detail: true })).toEqual({});
    expect(detailViewOptions<Row>({ detail: { fetch: false } })).toEqual({ fetch: false });
  });
});

describe('toolbar aksiyonu görünürlüğü', () => {
  it('liste isteğine ve seçime göre karar verir', () => {
    const action: CollectionAction<Row> = {
      id: 'delete-by-report',
      label: 'Delete by report',
      placement: 'toolbar',
      visible: ({ listBody }) => Boolean(listBody.filters?.reportId),
      disabled: ({ selectedIds }) => selectedIds.length > 0
    };
    expect(collectionActionState(action, { listBody: {}, selectedIds: [] })).toEqual({ visible: false, disabled: false });
    expect(collectionActionState(action, { listBody: { filters: { reportId: 'r1' } }, selectedIds: ['a'] })).toEqual({
      visible: true,
      disabled: true
    });
  });

  it('`visible` / `disabled` yoksa görünür ve açık', () => {
    expect(collectionActionState({ id: 'x', label: 'X', placement: 'toolbar' }, { listBody: {}, selectedIds: [] })).toEqual({
      visible: true,
      disabled: false
    });
  });
});
