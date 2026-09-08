import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Banner, Spin } from '@douyinfe/semi-ui';
import {
  ArpaBadge,
  ArpaButton,
  ArpaInput,
  ArpaPageHeader,
  ArpaPanel,
  ArpaSelect,
} from '../../components/arpa/index.js';
import {
  deleteCustomSource,
  listCustomSources,
  saveCustomSourceDraft,
  setCustomSourceEnabled,
  testCustomSource,
} from '../../services/customSources.js';
import {
  coverageRowsFromReport,
  createEmptySourceForm,
  customSourceErrorMessage,
  recipeFromSourceForm,
  sourceFormFromSource,
} from './customSourceBuilderModel.js';
import './CustomSources.less';

const selectorFields = [
  ['listingSelector', 'Listing container', 'Required. One selector matching every listing card.'],
  ['titleSelector', 'Title', 'Required.'],
  ['priceSelector', 'Price', 'Required.'],
  ['urlSelector', 'Listing URL', 'Required. Select an anchor element.'],
  ['imageSelector', 'Image', 'Optional.'],
  ['bedsSelector', 'Bedrooms', 'Optional.'],
  ['bathsSelector', 'Bathrooms', 'Optional.'],
  ['addressSelector', 'Address', 'Optional.'],
];

const sourceStateLabel = (source) => {
  if (source.enabled) return 'Enabled';
  if (source.activation?.needsRetest) return 'Retest required';
  if (source.activation?.canEnable) return 'Ready';
  if (source.lastTestStatus === 'fail') return 'Test failed';
  return 'Draft';
};

const Field = ({ label, help, children }) => (
  <label className="sourceBuilder__field">
    <span className="sourceBuilder__fieldLabel">{label}</span>
    {children}
    {help && <span className="sourceBuilder__fieldHelp">{help}</span>}
  </label>
);

const TestReport = ({ report }) => {
  if (!report) return null;
  const coverageRows = coverageRowsFromReport(report);

  return (
    <section className="sourceBuilder__report" aria-label="Test Extraction results">
      <div className="sourceBuilder__reportHeader">
        <div>
          <div className="sourceBuilder__sectionEyebrow">TEST EXTRACTION</div>
          <h3>{report.totalRecords} listings found</h3>
          <p>{report.pagesFetched} page{report.pagesFetched === 1 ? '' : 's'} fetched.</p>
        </div>
        <ArpaBadge>{report.activationReady ? 'Ready to enable' : 'Required coverage incomplete'}</ArpaBadge>
      </div>

      <div className="sourceBuilder__coverage">
        {coverageRows.map((row) => (
          <div className="sourceBuilder__coverageRow" key={row.field}>
            <span>
              {row.field}
              {row.required && <strong> required</strong>}
            </span>
            <span className={row.complete ? 'sourceBuilder__coverageGood' : 'sourceBuilder__coverageWarn'}>
              {row.present}/{row.total} {row.complete ? '✓' : '—'}
            </span>
          </div>
        ))}
      </div>

      <div className="sourceBuilder__preview">
        <div className="sourceBuilder__sectionEyebrow">PREVIEW</div>
        {report.preview?.length > 0 ? (
          <div className="sourceBuilder__previewTableWrap">
            <table className="sourceBuilder__previewTable">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Price</th>
                  <th>Beds</th>
                  <th>Address</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {report.preview.map((record, index) => (
                  <tr key={`${record.url ?? 'preview'}-${index}`}>
                    <td>{record.title ?? '—'}</td>
                    <td>{record.price ?? '—'}</td>
                    <td>{record.beds ?? '—'}</td>
                    <td>{record.address ?? '—'}</td>
                    <td>
                      {record.url ? (
                        <a href={record.url} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="sourceBuilder__muted">No preview records were returned.</p>
        )}
      </div>
    </section>
  );
};

export default function CustomSources() {
  const [sources, setSources] = useState([]);
  const [form, setForm] = useState(createEmptySourceForm);
  const [selectedId, setSelectedId] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const selectedSource = useMemo(() => sources.find((source) => source.id === selectedId) ?? null, [sources, selectedId]);

  const refreshSources = useCallback(async ({ selectId = selectedId } = {}) => {
    const nextSources = await listCustomSources();
    setSources(Array.isArray(nextSources) ? nextSources : []);
    if (selectId) {
      const nextSelected = nextSources.find((source) => source.id === selectId);
      if (nextSelected) {
        setSelectedId(nextSelected.id);
        setForm(sourceFormFromSource(nextSelected));
        return nextSelected;
      }
    }
    return null;
  }, [selectedId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const nextSources = await listCustomSources();
        if (!active) return;
        setSources(Array.isArray(nextSources) ? nextSources : []);
        if (nextSources?.length > 0) {
          setSelectedId(nextSources[0].id);
          setForm(sourceFormFromSource(nextSources[0]));
          setReport(nextSources[0].lastTestReport ?? null);
        }
      } catch (cause) {
        if (active) setError(customSourceErrorMessage(cause));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setNotice(null);
  };

  const selectSource = (source) => {
    setSelectedId(source.id);
    setForm(sourceFormFromSource(source));
    setReport(source.lastTestReport ?? null);
    setError(null);
    setNotice(null);
  };

  const newSource = () => {
    setSelectedId(null);
    setForm(createEmptySourceForm());
    setReport(null);
    setError(null);
    setNotice(null);
  };

  const persistDraft = async () => {
    const saved = await saveCustomSourceDraft({
      sourceId: form.sourceId,
      name: form.name,
      recipe: recipeFromSourceForm(form),
    });
    setSelectedId(saved.id);
    setForm(sourceFormFromSource(saved));
    await refreshSources({ selectId: saved.id });
    return saved;
  };

  const run = async (operation) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
    } catch (cause) {
      setError(customSourceErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () =>
    run(async () => {
      await persistDraft();
      setReport(null);
      setNotice('Draft saved. Run Test Extraction before enabling this source.');
    });

  const testExtraction = () =>
    run(async () => {
      const saved = await persistDraft();
      const nextReport = await testCustomSource(saved.id);
      setReport(nextReport);
      const refreshed = await refreshSources({ selectId: saved.id });
      setForm(sourceFormFromSource(refreshed ?? saved));
      setNotice(nextReport.activationReady ? 'Test passed. This exact recipe can now be enabled.' : 'Test completed, but required coverage is incomplete.');
    });

  const toggleEnabled = () =>
    run(async () => {
      if (!selectedSource) return;
      const enabled = !selectedSource.enabled;
      const updated = await setCustomSourceEnabled(selectedSource.id, enabled);
      await refreshSources({ selectId: updated.id });
      setNotice(enabled ? 'Source enabled.' : 'Source disabled.');
    });

  const remove = () => {
    if (!selectedSource) return;
    if (!window.confirm(`Delete “${selectedSource.name}”? This cannot be undone.`)) return;
    run(async () => {
      await deleteCustomSource(selectedSource.id);
      const nextSources = await listCustomSources();
      setSources(nextSources);
      if (nextSources.length > 0) {
        selectSource(nextSources[0]);
      } else {
        newSource();
      }
    });
  };

  const activation = selectedSource?.activation ?? { recipeValid: false, canEnable: false, needsRetest: false };
  const canEnable = Boolean(selectedSource && !selectedSource.enabled && activation.canEnable && !busy);

  if (loading) {
    return (
      <div className="sourceBuilder__loading">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="sourceBuilder">
      <ArpaPageHeader
        eyebrow="DISCOVERY SOURCES"
        title="Sources"
        subtitle="Add property-manager pages and other rental sources. Test extraction before any source can run live."
        actions={<ArpaButton onClick={newSource}>New Source</ArpaButton>}
      />

      {error && <Banner type="danger" closeIcon={null} description={error} />}
      {notice && <Banner type="info" closeIcon={null} description={notice} />}

      <div className="sourceBuilder__workspace">
        <aside className="sourceBuilder__sourceList" aria-label="Custom Sources">
          <div className="sourceBuilder__sectionEyebrow">CUSTOM SOURCES</div>
          {sources.length === 0 && <p className="sourceBuilder__muted">No custom sources yet.</p>}
          {sources.map((source) => (
            <button
              type="button"
              className={`sourceBuilder__sourceRow ${source.id === selectedId ? 'sourceBuilder__sourceRow--active' : ''}`}
              key={source.id}
              onClick={() => selectSource(source)}
            >
              <span>
                <strong>{source.name}</strong>
                <small>{source.recipe?.url ?? 'No URL'}</small>
              </span>
              <ArpaBadge>{sourceStateLabel(source)}</ArpaBadge>
            </button>
          ))}
        </aside>

        <main className="sourceBuilder__main">
          <ArpaPanel className="sourceBuilder__panel">
            <div className="sourceBuilder__panelHeader">
              <div>
                <div className="sourceBuilder__sectionEyebrow">SOURCE RECIPE</div>
                <h2>{form.sourceId ? 'Edit Custom Source' : 'New Custom Source'}</h2>
              </div>
              {selectedSource && <ArpaBadge>{sourceStateLabel(selectedSource)}</ArpaBadge>}
            </div>

            <div className="sourceBuilder__grid sourceBuilder__grid--two">
              <Field label="Source name">
                <ArpaInput value={form.name} onChange={(value) => update('name', value)} placeholder="Example Property Management" />
              </Field>
              <Field label="Execution mode" help="Use Browser only when the listing page needs JavaScript.">
                <ArpaSelect
                  value={form.mode}
                  onChange={(value) => update('mode', value)}
                  options={[
                    { value: 'static', label: 'Static HTML (faster)' },
                    { value: 'browser', label: 'Browser / JavaScript' },
                  ]}
                />
              </Field>
            </div>

            <Field label="Source URL" help="Only public HTTP(S) targets are accepted; private/local network targets are blocked.">
              <ArpaInput value={form.url} onChange={(value) => update('url', value)} placeholder="https://example.com/ottawa-rentals" />
            </Field>

            <div className="sourceBuilder__sectionHeading">
              <div className="sourceBuilder__sectionEyebrow">SELECTORS</div>
              <h3>Listing fields</h3>
            </div>
            <div className="sourceBuilder__grid sourceBuilder__grid--two">
              {selectorFields.map(([field, label, help]) => (
                <Field label={label} help={help} key={field}>
                  <ArpaInput value={form[field]} onChange={(value) => update(field, value)} placeholder=".listing-card" />
                </Field>
              ))}
            </div>

            <div className="sourceBuilder__sectionHeading">
              <div className="sourceBuilder__sectionEyebrow">PAGINATION</div>
              <h3>Additional pages</h3>
            </div>
            <div className="sourceBuilder__grid sourceBuilder__grid--three">
              <Field label="Pagination">
                <ArpaSelect
                  value={form.paginationType}
                  onChange={(value) => update('paginationType', value)}
                  options={[
                    { value: 'none', label: 'Single page' },
                    { value: 'next-button', label: 'Next button' },
                  ]}
                />
              </Field>
              {form.paginationType === 'next-button' && (
                <>
                  <Field label="Maximum pages">
                    <ArpaInput type="number" min="1" max="10" value={form.maxPages} onChange={(value) => update('maxPages', value)} />
                  </Field>
                  <Field label="Next button selector">
                    <ArpaInput value={form.nextSelector} onChange={(value) => update('nextSelector', value)} placeholder=".pagination-next" />
                  </Field>
                </>
              )}
            </div>

            {form.mode === 'browser' && (
              <>
                <div className="sourceBuilder__sectionHeading">
                  <div className="sourceBuilder__sectionEyebrow">BROWSER</div>
                  <h3>Page readiness</h3>
                </div>
                <div className="sourceBuilder__grid sourceBuilder__grid--three">
                  <Field label="Wait until">
                    <ArpaSelect
                      value={form.waitUntil}
                      onChange={(value) => update('waitUntil', value)}
                      options={[
                        { value: 'domcontentloaded', label: 'DOM content loaded' },
                        { value: 'load', label: 'Window load' },
                        { value: 'networkidle0', label: 'Network idle 0' },
                        { value: 'networkidle2', label: 'Network idle 2' },
                      ]}
                    />
                  </Field>
                  <Field label="Timeout (ms)">
                    <ArpaInput type="number" min="1000" max="30000" value={form.timeoutMs} onChange={(value) => update('timeoutMs', value)} />
                  </Field>
                  <Field label="Wait for selector" help="Optional extra readiness signal.">
                    <ArpaInput value={form.waitForSelector} onChange={(value) => update('waitForSelector', value)} placeholder=".listing-card" />
                  </Field>
                </div>
              </>
            )}

            <div className="sourceBuilder__actions">
              <ArpaButton variant="secondary" disabled={busy} onClick={saveDraft}>
                Save Draft
              </ArpaButton>
              <ArpaButton disabled={busy} onClick={testExtraction}>
                Test Extraction
              </ArpaButton>
              {selectedSource && !selectedSource.enabled && (
                <ArpaButton variant="secondary" disabled={!canEnable} onClick={toggleEnabled}>
                  Enable Source
                </ArpaButton>
              )}
              {selectedSource?.enabled && (
                <ArpaButton variant="secondary" disabled={busy} onClick={toggleEnabled}>
                  Disable Source
                </ArpaButton>
              )}
              {selectedSource && (
                <ArpaButton variant="danger" disabled={busy} onClick={remove}>
                  Delete Source
                </ArpaButton>
              )}
              {busy && <Spin size="small" />}
            </div>

            {selectedSource && !selectedSource.enabled && !activation.canEnable && (
              <p className="sourceBuilder__activationHint">
                {activation.needsRetest
                  ? 'The recipe changed after its last test. Run Test Extraction again before enabling.'
                  : 'Run a successful Test Extraction with full title, price and URL coverage before enabling.'}
              </p>
            )}
          </ArpaPanel>

          <TestReport report={report} />
        </main>
      </div>
    </div>
  );
}
