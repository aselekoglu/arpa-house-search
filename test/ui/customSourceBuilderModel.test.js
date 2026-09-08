import { expect } from 'chai';

let model;
try {
  model = await import('../../ui/src/views/sources/customSourceBuilderModel.js');
} catch {
  model = null;
}

const storedSource = () => ({
  id: 'source-1',
  name: 'Ottawa manager',
  enabled: false,
  activation: { recipeValid: true, canEnable: true, needsRetest: false },
  recipe: {
    version: 1,
    mode: 'static',
    url: 'https://example.com/apartments',
    selectors: {
      listing: '.card',
      title: '.name',
      price: '.rent',
      url: 'a',
      image: '.photo',
      beds: null,
      baths: null,
      address: '.address',
    },
    pagination: { type: 'none', maxPages: 1, nextSelector: null },
    browser: null,
  },
});

describe('Custom Source builder view model', () => {
  it('exports the builder model contract', () => {
    expect(model, 'Custom Source builder model should exist').to.not.equal(null);
    expect(model).to.have.property('createEmptySourceForm').that.is.a('function');
    expect(model).to.have.property('recipeFromSourceForm').that.is.a('function');
    expect(model).to.have.property('sourceFormFromSource').that.is.a('function');
    expect(model).to.have.property('coverageRowsFromReport').that.is.a('function');
    expect(model).to.have.property('customSourceErrorMessage').that.is.a('function');
    expect(model).to.have.property('isSourceFormDirty').that.is.a('function');
  });

  it('creates a conservative static draft by default', () => {
    const form = model.createEmptySourceForm();
    expect(form).to.deep.include({
      sourceId: null,
      name: '',
      mode: 'static',
      url: '',
      listingSelector: '',
      titleSelector: '',
      priceSelector: '',
      urlSelector: '',
      paginationType: 'none',
      maxPages: '1',
    });
  });

  it('builds a browser Recipe v1 while omitting blank optional selectors', () => {
    const recipe = model.recipeFromSourceForm({
      ...model.createEmptySourceForm(),
      name: 'Example source',
      mode: 'browser',
      url: 'https://example.com/rentals',
      listingSelector: '.listing',
      titleSelector: '.title',
      priceSelector: '.price',
      urlSelector: 'a.details',
      imageSelector: '  ',
      bedsSelector: '.beds',
      paginationType: 'next-button',
      maxPages: '4',
      nextSelector: '.next',
      waitUntil: 'networkidle2',
      timeoutMs: '20000',
      waitForSelector: '.listing',
    });

    expect(recipe).to.deep.equal({
      version: 1,
      mode: 'browser',
      url: 'https://example.com/rentals',
      selectors: {
        listing: '.listing',
        title: '.title',
        price: '.price',
        url: 'a.details',
        beds: '.beds',
      },
      pagination: {
        type: 'next-button',
        maxPages: 4,
        nextSelector: '.next',
      },
      browser: {
        waitUntil: 'networkidle2',
        timeoutMs: 20000,
        waitForSelector: '.listing',
      },
    });
  });

  it('round-trips a stored source into editable form state', () => {
    const form = model.sourceFormFromSource({ ...storedSource(), enabled: true });

    expect(form).to.deep.include({
      sourceId: 'source-1',
      name: 'Ottawa manager',
      mode: 'static',
      url: 'https://example.com/apartments',
      listingSelector: '.card',
      imageSelector: '.photo',
      addressSelector: '.address',
      enabled: true,
      canEnable: true,
      needsRetest: false,
    });
  });

  it('detects unsaved edits before activation while ignoring normalized no-op whitespace', () => {
    const source = storedSource();
    const form = model.sourceFormFromSource(source);

    expect(model.isSourceFormDirty(form, source)).to.equal(false);
    expect(model.isSourceFormDirty({ ...form, name: '  Ottawa manager  ' }, source)).to.equal(false);
    expect(model.isSourceFormDirty({ ...form, priceSelector: '.monthly-rent' }, source)).to.equal(true);
    expect(model.isSourceFormDirty({ ...form, name: 'Different manager' }, source)).to.equal(true);
  });

  it('marks required coverage rows from the backend report', () => {
    const rows = model.coverageRowsFromReport({
      requiredFields: ['title', 'price', 'url'],
      coverage: {
        title: { present: 3, total: 3 },
        price: { present: 2, total: 3 },
        url: { present: 3, total: 3 },
        image: { present: 1, total: 3 },
      },
    });

    expect(rows.find((row) => row.field === 'title')).to.deep.include({ required: true, complete: true });
    expect(rows.find((row) => row.field === 'price')).to.deep.include({ required: true, complete: false });
    expect(rows.find((row) => row.field === 'image')).to.deep.include({ required: false, complete: false });
  });

  it('turns structured API failures into actionable UI text', () => {
    expect(
      model.customSourceErrorMessage({
        json: {
          message: 'Invalid selector configured for price',
          field: 'selectors.price',
          step: 'extract',
        },
      }),
    ).to.equal('Invalid selector configured for price — selectors.price · extract');
  });
});
