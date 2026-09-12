import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Banner, Spin } from '@douyinfe/semi-ui';
import {
  ArpaBadge,
  ArpaButton,
  ArpaInput,
  ArpaPageHeader,
  ArpaPanel,
} from '../../components/arpa/index.js';
import { listCustomSources } from '../../services/customSources.js';
import {
  deleteSearchProfile,
  listSearchProfiles,
  runSearchProfile,
  saveSearchProfile,
} from '../../services/searchProfiles.js';
import {
  createEmptySearchProfileForm,
  searchProfileErrorMessage,
  searchProfileFormFromProfile,
  searchProfilePayloadFromForm,
  sourceOptionsFromCustomSources,
} from './searchProfileModel.js';
import './SearchProfiles.less';

const Field = ({ label, help, children }) => (
  <label className="searchProfiles__field">
    <span className="searchProfiles__fieldLabel">{label}</span>
    {children}
    {help ? <span className="searchProfiles__fieldHelp">{help}</span> : null}
  </label>
);

const sourceKeyLabel = (key) => {
  if (key === 'provider:realtor-ca') return 'Realtor.ca';
  if (key.startsWith('custom-source:')) return `Unavailable Custom Source — ${key.slice('custom-source:'.length)}`;
  return `Unavailable source — ${key}`;
};

export default function SearchProfiles() {
  const [profiles, setProfiles] = useState([]);
  const [customSources, setCustomSources] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(createEmptySearchProfileForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  const sourceOptions = useMemo(() => {
    const available = sourceOptionsFromCustomSources(customSources);
    const known = new Set(available.map((option) => option.key));
    const missing = form.selectedSourceKeys
      .filter((key) => !known.has(key))
      .map((key) => ({ key, label: sourceKeyLabel(key), unavailable: true }));
    return [...available, ...missing];
  }, [customSources, form.selectedSourceKeys]);

  const selectProfile = useCallback((profile) => {
    setSelectedId(profile.id);
    setForm(searchProfileFormFromProfile(profile));
    setError(null);
    setNotice(null);
  }, []);

  const refreshProfiles = useCallback(async ({ selectId = selectedId } = {}) => {
    const nextProfiles = await listSearchProfiles();
    const normalized = Array.isArray(nextProfiles) ? nextProfiles : [];
    setProfiles(normalized);
    if (selectId) {
      const nextSelected = normalized.find((profile) => profile.id === selectId);
      if (nextSelected) {
        setSelectedId(nextSelected.id);
        setForm(searchProfileFormFromProfile(nextSelected));
        return nextSelected;
      }
    }
    return null;
  }, [selectedId]);

  useEffect(() => {
    let active = true;
    Promise.all([listSearchProfiles(), listCustomSources()])
      .then(([nextProfiles, nextSources]) => {
        if (!active) return;
        const normalizedProfiles = Array.isArray(nextProfiles) ? nextProfiles : [];
        setProfiles(normalizedProfiles);
        setCustomSources(Array.isArray(nextSources) ? nextSources : []);
        if (normalizedProfiles.length > 0) {
          setSelectedId(normalizedProfiles[0].id);
          setForm(searchProfileFormFromProfile(normalizedProfiles[0]));
        }
      })
      .catch((cause) => {
        if (active) setError(searchProfileErrorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setNotice(null);
  };

  const newProfile = () => {
    setSelectedId(null);
    setForm(createEmptySearchProfileForm());
    setError(null);
    setNotice(null);
  };

  const run = async (operation) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
    } catch (cause) {
      setError(searchProfileErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const persistProfile = () =>
    run(async () => {
      const saved = await saveSearchProfile(searchProfilePayloadFromForm(form));
      setSelectedId(saved.id);
      await refreshProfiles({ selectId: saved.id });
      setNotice('Search Profile saved.');
    });

  const runPersistedProfile = () => {
    if (!selectedProfile) return;

    run(async () => {
      const result = await runSearchProfile(selectedProfile.id);
      const sources = Array.isArray(result?.sources) ? result.sources : [];
      const completed = sources.filter((source) => source.status === 'completed').length;
      const failed = sources.filter((source) => source.status === 'failed').length;
      setNotice(`Run completed — ${completed} source${completed === 1 ? '' : 's'} completed, ${failed} failed.`);
    });
  };

  const removeProfile = () => {
    if (!selectedProfile) return;
    if (!window.confirm(`Delete “${selectedProfile.name}”? This cannot be undone.`)) return;

    run(async () => {
      await deleteSearchProfile(selectedProfile.id);
      const nextProfiles = await listSearchProfiles();
      const normalized = Array.isArray(nextProfiles) ? nextProfiles : [];
      setProfiles(normalized);
      if (normalized.length > 0) {
        selectProfile(normalized[0]);
      } else {
        newProfile();
      }
    });
  };

  const toggleSource = (key) => {
    setForm((current) => {
      const selected = new Set(current.selectedSourceKeys);
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      return { ...current, selectedSourceKeys: [...selected] };
    });
    setNotice(null);
  };

  if (loading) {
    return (
      <div className="searchProfiles__loading">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="searchProfiles">
      <ArpaPageHeader
        eyebrow="OTTAWA SEARCH DEFINITION"
        title="Search Profiles"
        subtitle="Persist the location, rental bounds, sources and schedule intent that drive a rental search."
        actions={<ArpaButton onClick={newProfile}>New Profile</ArpaButton>}
      />

      {error ? <Banner type="danger" closeIcon={null} description={error} /> : null}
      {notice ? <Banner type="info" closeIcon={null} description={notice} /> : null}

      <div className="searchProfiles__workspace">
        <aside className="searchProfiles__list" aria-label="Search Profiles">
          <div className="searchProfiles__eyebrow">PROFILES</div>
          {profiles.length === 0 ? <p className="searchProfiles__muted">No Search Profiles yet.</p> : null}
          {profiles.map((profile) => (
            <button
              type="button"
              key={profile.id}
              className={`searchProfiles__row ${profile.id === selectedId ? 'searchProfiles__row--active' : ''}`}
              onClick={() => selectProfile(profile)}
            >
              <span>
                <strong>{profile.name}</strong>
                <small>{profile.city}, {profile.region}</small>
              </span>
              <ArpaBadge>{profile.enabledSources?.length ?? 0} sources</ArpaBadge>
            </button>
          ))}
        </aside>

        <main className="searchProfiles__main">
          <ArpaPanel className="searchProfiles__panel">
            <div className="searchProfiles__panelHeader">
              <div>
                <div className="searchProfiles__eyebrow">SEARCH PROFILE V1</div>
                <h2>{form.profileId ? 'Edit Search Profile' : 'New Search Profile'}</h2>
              </div>
              {form.profileId ? <ArpaBadge>Persisted</ArpaBadge> : <ArpaBadge>New</ArpaBadge>}
            </div>

            <div className="searchProfiles__grid searchProfiles__grid--two">
              <Field label="Profile name">
                <ArpaInput
                  value={form.name}
                  onChange={(value) => update('name', value)}
                  placeholder="Ottawa 2BR under $2,400"
                />
              </Field>
              <Field label="Location" help="Ottawa-first for M1; the model remains provider-agnostic.">
                <div className="searchProfiles__locationFields">
                  <ArpaInput value={form.city} onChange={(value) => update('city', value)} placeholder="Ottawa" />
                  <ArpaInput value={form.region} onChange={(value) => update('region', value)} placeholder="ON" />
                </div>
              </Field>
            </div>

            <div className="searchProfiles__sectionHeading">
              <div className="searchProfiles__eyebrow">SEARCH BOUNDS</div>
              <h3>Rental requirements</h3>
            </div>
            <div className="searchProfiles__grid searchProfiles__grid--three">
              <Field label="Maximum monthly rent" help="Blank means no maximum at provider discovery time.">
                <ArpaInput type="number" min="0" value={form.maxPrice} onChange={(value) => update('maxPrice', value)} placeholder="2400" />
              </Field>
              <Field label="Minimum bedrooms" help="Blank stays unknown / unconstrained.">
                <ArpaInput type="number" min="0" step="0.5" value={form.minBedrooms} onChange={(value) => update('minBedrooms', value)} placeholder="2" />
              </Field>
              <Field label="Minimum bathrooms" help="Blank stays unknown / unconstrained.">
                <ArpaInput type="number" min="0" step="0.5" value={form.minBathrooms} onChange={(value) => update('minBathrooms', value)} placeholder="1" />
              </Field>
            </div>

            <div className="searchProfiles__sectionHeading">
              <div className="searchProfiles__eyebrow">DISCOVERY SOURCES</div>
              <h3>Realtor.ca and enabled Custom Sources</h3>
            </div>
            <div className="searchProfiles__sourceChoices">
              {sourceOptions.map((option) => {
                const checked = form.selectedSourceKeys.includes(option.key);
                return (
                  <label className={`searchProfiles__sourceChoice ${option.unavailable ? 'searchProfiles__sourceChoice--unavailable' : ''}`} key={option.key}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSource(option.key)} />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.unavailable ? 'Selected previously; currently unavailable. Deselect to remove it.' : option.kind === 'provider' ? 'Dedicated provider' : 'Enabled Custom Source'}</small>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="searchProfiles__sectionHeading">
              <div className="searchProfiles__eyebrow">SCHEDULE INTENT</div>
              <h3>Automatic search cadence</h3>
            </div>
            <div className="searchProfiles__schedule">
              <label className="searchProfiles__toggle">
                <input
                  type="checkbox"
                  checked={form.scheduleEnabled}
                  onChange={(event) => update('scheduleEnabled', event.target.checked)}
                />
                <span>Enable schedule intent for this profile</span>
              </label>
              <Field label="Interval (minutes)" help="The unified scheduler uses this interval for automatic runs.">
                <ArpaInput
                  type="number"
                  min="1"
                  max="1440"
                  value={form.intervalMinutes}
                  onChange={(value) => update('intervalMinutes', value)}
                />
              </Field>
            </div>
            <p className="searchProfiles__scheduleNote">
              Automatic execution uses the same run pipeline as Run Now. Disable the schedule to keep this profile manual-only.
            </p>

            <div className="searchProfiles__actions">
              <ArpaButton disabled={busy} onClick={persistProfile}>Save Profile</ArpaButton>
              {selectedProfile ? (
                <ArpaButton disabled={busy} onClick={runPersistedProfile}>Run Now</ArpaButton>
              ) : null}
              {selectedProfile ? (
                <ArpaButton variant="danger" disabled={busy} onClick={removeProfile}>Delete Profile</ArpaButton>
              ) : null}
              {busy ? <Spin size="small" /> : null}
            </div>
          </ArpaPanel>
        </main>
      </div>
    </div>
  );
}
