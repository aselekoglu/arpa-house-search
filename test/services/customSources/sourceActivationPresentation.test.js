import { expect } from 'chai';
import { createCustomSourceLifecycleService } from '../../../lib/services/customSources/sourceLifecycleService.js';

const recipe = (url = 'https://rentals.example.com/ottawa') => ({
  version: 1,
  mode: 'static',
  url,
  selectors: {
    listing: '.listing',
    title: '.title',
    price: '.price',
    url: 'a.details',
  },
});

const storage = () => {
  const rows = new Map();
  return {
    rows,
    listByUser(userId) {
      return [...rows.values()].filter((row) => row.userId === userId);
    },
    getById(id) {
      return rows.get(id) ?? null;
    },
    upsert(row) {
      rows.set(row.id, { ...(rows.get(row.id) ?? {}), ...row });
      return rows.get(row.id);
    },
    recordTest({ id, ...test }) {
      rows.set(id, { ...rows.get(id), ...test });
      return rows.get(id);
    },
    setEnabled({ id, enabled, updatedAt }) {
      rows.set(id, { ...rows.get(id), enabled, updatedAt });
      return rows.get(id);
    },
    remove(id) {
      rows.delete(id);
    },
  };
};

describe('Custom Source activation presentation', () => {
  it('reports recipe validity, exact-test activation readiness and stale-test state on source responses', async () => {
    const store = storage();
    const hashFor = (value) => {
      if (!value?.selectors?.listing) throw new Error('invalid recipe');
      return value.url.includes('centretown') ? 'b'.repeat(64) : 'a'.repeat(64);
    };
    const service = createCustomSourceLifecycleService({
      storage: store,
      normalizeAndHash: hashFor,
      testService: {
        async test(value) {
          return {
            recipeHash: hashFor(value),
            activationReady: true,
            totalRecords: 2,
            coverage: {
              title: { present: 2, total: 2 },
              price: { present: 2, total: 2 },
              url: { present: 2, total: 2 },
            },
            preview: [],
          };
        },
      },
      idFactory: () => 'source-activation',
      now: (() => { let value = 100; return () => value++; })(),
    });

    const draft = service.saveDraft({ userId: 'user-a', name: 'PM', recipe: recipe() });
    expect(draft.activation).to.deep.equal({ recipeValid: true, canEnable: false, needsRetest: false });

    await service.testSource({ userId: 'user-a', sourceId: draft.id });
    const tested = service.getSource({ userId: 'user-a', sourceId: draft.id });
    expect(tested.activation).to.deep.equal({ recipeValid: true, canEnable: true, needsRetest: false });

    const changed = service.saveDraft({
      userId: 'user-a',
      sourceId: draft.id,
      name: 'PM',
      recipe: recipe('https://rentals.example.com/centretown'),
    });
    expect(changed.enabled).to.equal(false);
    expect(changed.activation).to.deep.equal({ recipeValid: true, canEnable: false, needsRetest: true });

    const listed = service.listSources({ userId: 'user-a' });
    expect(listed[0].activation).to.deep.equal({ recipeValid: true, canEnable: false, needsRetest: true });
  });

  it('reports incomplete drafts as invalid without treating never-tested drafts as stale', () => {
    const store = storage();
    const service = createCustomSourceLifecycleService({
      storage: store,
      normalizeAndHash: () => { throw new Error('incomplete'); },
      testService: { test: async () => { throw new Error('not used'); } },
      idFactory: () => 'source-incomplete',
      now: () => 200,
    });

    const draft = service.saveDraft({
      userId: 'user-a',
      name: 'Incomplete',
      recipe: { version: 1, mode: 'static', url: 'https://example.com' },
    });
    expect(draft.activation).to.deep.equal({ recipeValid: false, canEnable: false, needsRetest: false });
  });
});
